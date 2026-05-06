import { mkdir, rm } from "node:fs/promises";

import { getAppEnv } from "../../config/env.js";
import { JsonlLogStore } from "./log/jsonl-log-store.js";
import { DeterministicEmbeddingProvider } from "./index/embedding-provider.js";
import { connectToLanceDb } from "./index/lancedb-client.js";
import { MemoryRecordsTable } from "./index/memory-records-table.js";
import { RetrievalTraceStore } from "./observability/retrieval-trace.js";
import { buildContextForTask } from "./core/build-context-for-task.js";
import { listMemories } from "./core/list-memories.js";
import { rememberMemory } from "./core/remember.js";
import { searchMemories } from "./core/search-memories.js";
import { applyConservativeMemoryPolicy as runApplyConservativeMemoryPolicy } from "./core/apply-conservative-memory-policy.js";
import { suggestMemoryCandidates } from "./core/suggest-memory-candidates.js";
import { upsertDocument } from "./core/upsert-document.js";
import { reindexMemoryRecords } from "./index/reindex.js";
import { createMemoryFacade, type MemoryFacade } from "./memory-facade.js";
import { applyConservativeMemoryPolicyInputSchema, enqueueMemoryProposalInputSchema, getReviewAssistInputSchema, listReviewQueueInputSchema, listReviewQueueOverviewInputSchema, promoteMemoryInputSchema, reviewMemoryInputSchema } from "./schemas.js";
import { toRetrievalRow } from "./retrieval/rank.js";
import type {
  ApplyConservativeMemoryPolicyInput,
  ApplyConservativeMemoryPolicyResult,
  BuildContextForTaskInput,
  BuildContextForTaskResult,
  EnqueueMemoryProposalInput,
  EnqueueMemoryProposalResult,
  GetReviewAssistInput,
  InspectMemoryRetrievalInput,
  InspectMemoryRetrievalResult,
  ListMemoriesInput,
  ListReviewQueueInput,
  ListReviewQueueOverviewInput,
  MemoryRecord,
  ReviewAssistResult,
  ReviewQueueOverviewItem,
  PrepareHostTurnMemoryInput,
  PrepareHostTurnMemoryResult,
  PrepareTurnMemoryInput,
  PrepareTurnMemoryResult,
  PromoteMemoryInput,
  PromoteMemoryResult,
  ReviewMemoryInput,
  ReviewMemoryResult,
  ResetMemoryStorageResult,
  RememberInput,
  RetrievalTraceProvenance,
  SearchMemoriesInput,
  SearchMemoriesResult,
  SuggestMemoryCandidatesInput,
  SuggestMemoryCandidatesResult,
  UpsertDocumentInput,
  WakeUpMemoryInput,
  WakeUpMemoryResult,
} from "./types.js";

export class MemoryService {
  private readonly facade: MemoryFacade;
  private logStore: JsonlLogStore;
  private table: MemoryRecordsTable;
  private embeddingProvider: DeterministicEmbeddingProvider;
  private traceStore: RetrievalTraceStore;

  public static async create(): Promise<MemoryService> {
    const env = getAppEnv();
    await Promise.all([
      mkdir(env.dataPaths.logDirectory, { recursive: true }),
      mkdir(env.dataPaths.tracesDirectory, { recursive: true }),
      mkdir(env.dataPaths.lanceDbDirectory, { recursive: true }),
    ]);

    const logStore = new JsonlLogStore(env.dataPaths.canonicalLogFilePath);
    const embeddingProvider = new DeterministicEmbeddingProvider(env.embeddingDimensions);
    const connection = await connectToLanceDb(env.dataPaths.lanceDbDirectory);
    const table = new MemoryRecordsTable(connection);
    const traceStore = new RetrievalTraceStore(env.dataPaths.retrievalTraceFilePath);

    return new MemoryService(logStore, table, embeddingProvider, traceStore);
  }

  public constructor(
    logStore: JsonlLogStore,
    table: MemoryRecordsTable,
    embeddingProvider: DeterministicEmbeddingProvider,
    traceStore: RetrievalTraceStore,
  ) {
    this.logStore = logStore;
    this.table = table;
    this.embeddingProvider = embeddingProvider;
    this.traceStore = traceStore;
    this.facade = createMemoryFacade({
      buildContext: (payload, traceProvenance) => this.buildContext(payload, traceProvenance),
      applyConservativeMemoryPolicy: (payload) => this.applyConservativeMemoryPolicy(payload),
    });
  }

  public async resetStorage(): Promise<ResetMemoryStorageResult> {
    const env = getAppEnv();

    await Promise.all([
      rm(env.dataPaths.lanceDbDirectory, { recursive: true, force: true }),
      rm(env.dataPaths.canonicalLogFilePath, { force: true }),
      rm(env.dataPaths.retrievalTraceFilePath, { force: true }),
    ]);

    await Promise.all([
      mkdir(env.dataPaths.logDirectory, { recursive: true }),
      mkdir(env.dataPaths.tracesDirectory, { recursive: true }),
      mkdir(env.dataPaths.lanceDbDirectory, { recursive: true }),
    ]);

    this.logStore = new JsonlLogStore(env.dataPaths.canonicalLogFilePath);
    this.embeddingProvider = new DeterministicEmbeddingProvider(env.embeddingDimensions);
    const connection = await connectToLanceDb(env.dataPaths.lanceDbDirectory);
    this.table = new MemoryRecordsTable(connection);
    this.traceStore = new RetrievalTraceStore(env.dataPaths.retrievalTraceFilePath);

    return {
      status: "cleared",
      cleared: {
        lanceDb: true,
        canonicalLog: true,
        retrievalTrace: true,
      },
    };
  }

  public remember(payload: RememberInput) {
    return rememberMemory({
      payload,
      logStore: this.logStore,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
    });
  }

  public async promoteMemory(payload: PromoteMemoryInput): Promise<PromoteMemoryResult> {
    const parsed = promoteMemoryInputSchema.parse(payload);
    const existing = await this.logStore.readById(parsed.id);

    if (!existing) {
      throw new Error(`No memory record found for id ${parsed.id}`);
    }

    const nextRecord: MemoryRecord = {
      ...existing,
      verificationStatus: parsed.verificationStatus ?? "verified",
      verifiedAt: new Date().toISOString(),
      verificationEvidence: parsed.evidence,
      updatedAt: new Date().toISOString(),
    };

    await this.logStore.replaceRecordById(parsed.id, nextRecord);
    await this.table.deleteRowsByIds([parsed.id]);

    const embedding = await this.embeddingProvider.embedText([
      nextRecord.content,
      nextRecord.summary ?? "",
      ...nextRecord.tags,
    ].join("\n"));

    await this.table.upsertRows([toRetrievalRow(nextRecord, embedding, this.embeddingProvider.version)]);

    return {
      id: nextRecord.id,
      status: "accepted",
      verificationStatus: nextRecord.verificationStatus ?? "verified",
      verifiedAt: nextRecord.verifiedAt ?? "",
      verificationEvidence: nextRecord.verificationEvidence ?? [],
    };
  }

  public async reviewMemory(payload: ReviewMemoryInput): Promise<ReviewMemoryResult> {
    const parsed = reviewMemoryInputSchema.parse(payload);
    const existing = await this.logStore.readById(parsed.id);

    if (!existing) {
      throw new Error(`No memory record found for id ${parsed.id}`);
    }

    const now = new Date().toISOString();
    const nextDecisions = [
      ...(existing.reviewDecisions ?? []),
      {
        action: parsed.action,
        decidedAt: now,
        ...(parsed.note ? { note: parsed.note } : {}),
        ...(parsed.evidence ? { evidence: parsed.evidence } : {}),
      },
    ];

    const nextRecord: MemoryRecord = {
      ...existing,
      ...(parsed.content ? { content: parsed.content } : {}),
      ...(parsed.summary ? { summary: parsed.summary } : {}),
      ...(parsed.tags ? { tags: parsed.tags } : {}),
      verificationStatus: parsed.action === "edit_then_promote" ? "verified" : (existing.verificationStatus ?? "hypothesis"),
      reviewStatus:
        parsed.action === "reject"
          ? "rejected"
          : parsed.action === "defer"
            ? "deferred"
            : undefined,
      reviewDecisions: nextDecisions,
      verifiedAt: parsed.action === "edit_then_promote" ? now : existing.verifiedAt,
      verificationEvidence: parsed.action === "edit_then_promote" ? (parsed.evidence ?? []) : existing.verificationEvidence,
      updatedAt: now,
    };

    await this.logStore.replaceRecordById(parsed.id, nextRecord);
    await this.table.deleteRowsByIds([parsed.id]);

    const embedding = await this.embeddingProvider.embedText([
      nextRecord.content,
      nextRecord.summary ?? "",
      ...nextRecord.tags,
    ].join("\n"));

    await this.table.upsertRows([toRetrievalRow(nextRecord, embedding, this.embeddingProvider.version)]);

    return {
      id: nextRecord.id,
      status: "accepted",
      action: parsed.action,
      ...(nextRecord.reviewStatus ? { reviewStatus: nextRecord.reviewStatus } : {}),
      verificationStatus: nextRecord.verificationStatus ?? "hypothesis",
      reviewDecisions: nextRecord.reviewDecisions ?? [],
      ...(nextRecord.verifiedAt ? { verifiedAt: nextRecord.verifiedAt } : {}),
      verificationEvidence: nextRecord.verificationEvidence ?? [],
    };
  }

  public search(payload: SearchMemoriesInput): Promise<SearchMemoriesResult> {
    return searchMemories({
      payload,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
      traceStore: this.traceStore,
      traceProvenance: {
        surface: "tool",
        trigger: "search_memories",
        phase: "search",
      },
    });
  }

  public buildContext(
    payload: BuildContextForTaskInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ): Promise<BuildContextForTaskResult> {
    return buildContextForTask({
      payload,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
      traceStore: this.traceStore,
      traceProvenance:
        traceProvenance ??
        {
          surface: "tool",
          trigger: "build_context_for_task",
          phase: "build-context",
        },
    });
  }

  public upsertDocument(payload: UpsertDocumentInput) {
    return upsertDocument({
      payload,
      logStore: this.logStore,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
    });
  }

  public list(payload: ListMemoriesInput): Promise<readonly MemoryRecord[]> {
    return listMemories({
      payload,
      logStore: this.logStore,
    });
  }

  public listReviewQueue(payload: ListReviewQueueInput): Promise<readonly MemoryRecord[]> {
    const parsed = listReviewQueueInputSchema.parse(payload);
    return this.logStore.listReviewQueue(parsed);
  }

  public async listReviewQueueOverview(payload: ListReviewQueueOverviewInput): Promise<readonly ReviewQueueOverviewItem[]> {
    const parsed = listReviewQueueOverviewInputSchema.parse(payload);
    const queue = await this.logStore.listReviewQueue(parsed);
    const records = await this.logStore.readAll();
    const relevantVerified = records.filter((record) =>
      record.verificationStatus === "verified"
      && (!parsed.projectId || record.projectId === parsed.projectId)
      && (!parsed.containerId || record.containerId === parsed.containerId)
    );

    return queue
      .map((record) => toReviewQueueOverviewItem(record, relevantVerified))
      .sort((left, right) => {
        if (right.priorityScore !== left.priorityScore) {
          return right.priorityScore - left.priorityScore;
        }

        const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
        const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
        return rightTime - leftTime;
      });
  }

  public async getReviewAssist(payload: GetReviewAssistInput): Promise<ReviewAssistResult> {
    const parsed = getReviewAssistInputSchema.parse(payload);
    const record = await this.logStore.readById(parsed.id);

    if (!record) {
      throw new Error(`No memory record found for id ${parsed.id}`);
    }

    const verifiedRecords = (await this.logStore.readAll()).filter((item) =>
      item.verificationStatus === "verified"
      && item.id !== record.id
      && item.projectId === record.projectId
      && item.containerId === record.containerId
    );

    const hints = collectReviewHints(record, verifiedRecords);
    const suggestions = buildReviewAssistSuggestions(record, hints, verifiedRecords);

    return {
      id: record.id,
      status: "ready",
      hints,
      suggestions,
    };
  }

  public async enqueueMemoryProposal(payload: EnqueueMemoryProposalInput): Promise<EnqueueMemoryProposalResult> {
    const parsed = enqueueMemoryProposalInputSchema.parse(payload);
    const suggestion = parsed.suggestion ?? suggestMemoryCandidates({
      conversation: parsed.conversation?.trim() ?? "",
      projectId: parsed.projectId,
      containerId: parsed.containerId,
      maxCandidates: parsed.maxCandidates,
    });

    const proposed: Array<{ candidateIndex: number; id: string }> = [];
    const skipped: Array<{ candidateIndex: number; reason: "incomplete_scope_ids" }> = [];

    for (let i = 0; i < suggestion.candidates.length; i += 1) {
      const candidate = suggestion.candidates[i]!;
      if (candidate.scope === "project" && (!parsed.projectId || !parsed.containerId)) {
        skipped.push({ candidateIndex: i, reason: "incomplete_scope_ids" });
        continue;
      }

      const remembered = await this.remember({
        content: candidate.draftContent,
        kind: candidate.kind,
        scope: candidate.scope,
        projectId: parsed.projectId,
        containerId: parsed.containerId,
        source: parsed.sourceOverride ?? { type: "tool", title: "enqueue_memory_proposal" },
        verificationStatus: "hypothesis",
        reviewStatus: "pending",
        tags: [...(parsed.extraTags ?? []), "review_queue_candidate", `candidate_confidence:${candidate.confidence}`],
        summary: candidate.reason,
      });
      proposed.push({ candidateIndex: i, id: remembered.id });
    }

    return {
      recommendation: suggestion.recommendation,
      proposed,
      skipped,
      candidates: suggestion.candidates,
    };
  }

  public suggestMemoryCandidates(payload: SuggestMemoryCandidatesInput): SuggestMemoryCandidatesResult {
    return suggestMemoryCandidates(payload);
  }

  public applyConservativeMemoryPolicy(
    payload: ApplyConservativeMemoryPolicyInput,
  ): Promise<ApplyConservativeMemoryPolicyResult> {
    const parsed = applyConservativeMemoryPolicyInputSchema.parse(payload);
    return runApplyConservativeMemoryPolicy({
      payload: parsed,
      remember: (p: RememberInput) => this.remember(p),
    });
  }

  /** Product alias for {@link prepareHostTurnMemory} (same schema and result). */
  public prepareTurnMemory(
    payload: PrepareTurnMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ): Promise<PrepareTurnMemoryResult> {
    return this.prepareHostTurnMemory(payload, traceProvenance);
  }

  /**
   * Wake-up: two `build_context_for_task` calls for the same scope — `mode: "profile"` and `mode: "recent"` — plus a
   * combined `wakeUpContext` string. Does not run suggestion or conservative policy.
   */
  public async wakeUpMemory(
    payload: WakeUpMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ): Promise<WakeUpMemoryResult> {
    return this.facade.wakeUpMemory(
      payload,
      traceProvenance ?? {
        surface: "tool",
        trigger: "wake_up_memory",
        phase: "wake-up",
      },
    );
  }

  /**
   * Host one-call: `build_context_for_task` with suggestions on, then `apply_conservative_memory_policy` using that
   * snapshot (single heuristic pass). Conservative writes only for `strong_candidate` with complete scope ids.
   */
  public async prepareHostTurnMemory(
    payload: PrepareHostTurnMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ): Promise<PrepareHostTurnMemoryResult> {
    return this.facade.prepareHostTurnMemory(
      payload,
      traceProvenance ?? {
        surface: "tool",
        trigger: "prepare_host_turn_memory",
        phase: "prepare-host-turn",
      },
    );
  }

  public reindex(): Promise<void> {
    return reindexMemoryRecords({
      logStore: this.logStore,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
    });
  }

  public async inspectMemoryRetrieval(
    payload: InspectMemoryRetrievalInput,
  ): Promise<InspectMemoryRetrievalResult> {
    const trace = payload.requestId
      ? await this.traceStore.readByRequestId(payload.requestId)
      : payload.latestScopeFilter
        ? await this.traceStore.readLatestMatching(payload.latestScopeFilter)
      : await this.traceStore.readLatest();

    if (!trace) {
      return {
        status: "empty",
        lookup: payload.requestId ? "request_id" : "latest",
        ...(payload.requestId ? { requestId: payload.requestId } : {}),
      };
    }

    return {
      status: "found",
      lookup: payload.requestId ? "request_id" : "latest",
      trace,
      summary: {
        hit: trace.returnedMemoryIds.length > 0,
        returnedCount: trace.returnedMemoryIds.length,
        degraded: trace.degraded,
      },
    };
  }
}

function toReviewQueueOverviewItem(
  record: MemoryRecord,
  verifiedRecords: readonly MemoryRecord[],
): ReviewQueueOverviewItem {
  const priorityReasons: string[] = [];
  let priorityScore = Math.round(record.importance * 100);

  if (record.kind === "decision") {
    priorityScore += 25;
    priorityReasons.push("decision_memory");
  } else if (record.kind === "task") {
    priorityScore += 15;
    priorityReasons.push("task_memory");
  } else if (record.kind === "fact") {
    priorityScore += 10;
    priorityReasons.push("fact_memory");
  }

  const confidenceTag = record.tags.find((tag) => tag.startsWith("candidate_confidence:"));
  if (confidenceTag === "candidate_confidence:high") {
    priorityScore += 20;
    priorityReasons.push("high_confidence_candidate");
  } else if (confidenceTag === "candidate_confidence:medium") {
    priorityScore += 10;
    priorityReasons.push("medium_confidence_candidate");
  }

  if (record.reviewStatus === "deferred") {
    priorityScore += 5;
    priorityReasons.push("deferred_followup");
  }

  const hints = collectReviewHints(record, verifiedRecords);
  if (hints.some((hint) => hint.type === "possible_contradiction")) {
    priorityScore += 15;
    priorityReasons.push("possible_contradiction");
  }
  if (hints.some((hint) => hint.type === "likely_duplicate")) {
    priorityScore += 8;
    priorityReasons.push("likely_duplicate");
  }
  if (hints.some((hint) => hint.type === "possible_supersession")) {
    priorityScore += 6;
    priorityReasons.push("possible_supersession");
  }

  return {
    id: record.id,
    kind: record.kind,
    scope: record.scope,
    content: record.content,
    ...(record.summary ? { summary: record.summary } : {}),
    verificationStatus: record.verificationStatus ?? "hypothesis",
    ...(record.reviewStatus ? { reviewStatus: record.reviewStatus } : {}),
    reviewDecisions: record.reviewDecisions ?? [],
    source: record.source,
    tags: record.tags,
    importance: record.importance,
    createdAt: record.createdAt,
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    priorityScore,
    priorityReasons,
    hints,
  };
}

function collectReviewHints(
  record: MemoryRecord,
  verifiedRecords: readonly MemoryRecord[],
): ReviewQueueOverviewItem["hints"] {
  const recordNorm = normalizeMemoryText(record.content);
  const recordTokens = tokenizeMemoryText(record.content);

  const duplicateIds = verifiedRecords
    .filter((verified) => normalizeMemoryText(verified.content) === recordNorm)
    .map((verified) => verified.id);

  const contradictionIds = verifiedRecords
    .filter((verified) => {
      if (normalizeMemoryText(verified.content) === recordNorm) {
        return false;
      }

      const overlap = intersectTokenCount(recordTokens, tokenizeMemoryText(verified.content));
      return overlap >= 3 && hasContradictoryPolarity(record.content, verified.content);
    })
    .map((verified) => verified.id);

  const supersessionIds = verifiedRecords
    .filter((verified) => isPossibleSupersession(record, verified, recordNorm, recordTokens))
    .map((verified) => verified.id);

  const hints: Array<ReviewQueueOverviewItem["hints"][number]> = [];

  if (duplicateIds.length > 0) {
    hints.push({
      type: "likely_duplicate",
      relatedMemoryIds: duplicateIds,
      note: "Matches the content of existing verified memory.",
    });
  }

  if (contradictionIds.length > 0) {
    hints.push({
      type: "possible_contradiction",
      relatedMemoryIds: contradictionIds,
      note: "Shares topic words with verified memory but flips policy-style polarity.",
    });
  }

  if (supersessionIds.length > 0) {
    hints.push({
      type: "possible_supersession",
      relatedMemoryIds: supersessionIds,
      note: "May supersede an existing verified memory; review newer evidence before changing memory status.",
    });
  }

  return hints;
}

function isPossibleSupersession(
  record: MemoryRecord,
  verified: MemoryRecord,
  recordNorm: string,
  recordTokens: Set<string>,
): boolean {
  return (record.verificationStatus ?? "hypothesis") !== "verified"
    && verified.verificationStatus === "verified"
    && isSameMemoryScope(record, verified)
    && normalizeMemoryText(verified.content) !== recordNorm
    && intersectTokenCount(recordTokens, tokenizeMemoryText(verified.content)) >= 3
    && hasExplicitUpdateSignal(record)
    && getEvidenceTime(record) > getEvidenceTime(verified);
}

function isSameMemoryScope(left: MemoryRecord, right: MemoryRecord): boolean {
  return left.scope === right.scope
    && left.projectId === right.projectId
    && left.containerId === right.containerId;
}

function getEvidenceTime(record: MemoryRecord): number {
  const parsed = Date.parse(record.verifiedAt ?? record.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasExplicitUpdateSignal(record: MemoryRecord): boolean {
  const searchable = [
    record.content,
    ...record.tags,
    record.source.type,
    record.source.title ?? "",
    record.source.uri ?? "",
  ].join("\n");

  return /\b(?:supersedes|replaces|instead|changed|now|current|updated)\b|\bno\s+longer\b|(?:เปลี่ยน|แทน|ปัจจุบัน|ไม่ใช้แล้ว|ยกเลิก)/iu.test(searchable);
}

function normalizeMemoryText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenizeMemoryText(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
}

function intersectTokenCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) {
      count += 1;
    }
  }
  return count;
}

function hasContradictoryPolarity(left: string, right: string): boolean {
  const leftNegative = /\b(?:never|do not|don't|must not|should not)\b/i.test(left);
  const rightNegative = /\b(?:never|do not|don't|must not|should not)\b/i.test(right);
  const leftPositive = /\b(?:always|must|should)\b/i.test(left);
  const rightPositive = /\b(?:always|must|should)\b/i.test(right);

  return (leftNegative && rightPositive) || (rightNegative && leftPositive);
}

function buildReviewAssistSuggestions(
  record: MemoryRecord,
  hints: readonly ReviewQueueOverviewItem["hints"][number][],
  verifiedRecords: readonly MemoryRecord[],
): ReviewAssistResult["suggestions"] {
  const suggestions: Array<ReviewAssistResult["suggestions"][number]> = [];

  for (const hint of hints) {
    if (hint.type === "likely_duplicate") {
      const related = verifiedRecords.find((item) => item.id === hint.relatedMemoryIds[0]);
      suggestions.push({
        kind: "merge_duplicate",
        rationale: hint.note,
        relatedMemoryIds: hint.relatedMemoryIds,
        draftContent: related?.content ?? record.content,
        suggestedAction: "edit_then_promote",
      });
      continue;
    }

    if (hint.type === "possible_contradiction") {
      const related = verifiedRecords.find((item) => item.id === hint.relatedMemoryIds[0]);
      suggestions.push({
        kind: "resolve_contradiction",
        rationale: hint.note,
        relatedMemoryIds: hint.relatedMemoryIds,
        draftContent: related
          ? `Compare verified memory: "${related.content}" against proposed memory: "${record.content}" before deciding whether to edit/promote, defer, or reject.`
          : record.content,
        suggestedAction: "edit_then_promote",
      });
      continue;
    }

    if (hint.type === "possible_supersession") {
      suggestions.push({
        kind: "gather_evidence",
        rationale: hint.note,
        relatedMemoryIds: hint.relatedMemoryIds,
        draftContent: "Compare proposed memory against existing verified memory before deciding whether to edit/promote, defer, or reject.",
        suggestedAction: "collect_evidence",
      });
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      kind: "gather_evidence",
      rationale: "No duplicate or contradiction hints found; gather stronger supporting evidence before promotion.",
      relatedMemoryIds: [],
      suggestedAction: "collect_evidence",
    });
  }

  return suggestions;
}
