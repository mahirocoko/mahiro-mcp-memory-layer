import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getAppEnv } from "../../../config/env.js";
import { buildContextForTask } from "../core/build-context-for-task.js";
import { searchMemories } from "../core/search-memories.js";
import { DeterministicEmbeddingProvider } from "../index/embedding-provider.js";
import { connectToLanceDb } from "../index/lancedb-client.js";
import { MemoryRecordsTable } from "../index/memory-records-table.js";
import { RetrievalTraceStore } from "../observability/retrieval-trace.js";
import { toRetrievalRow } from "../retrieval/rank.js";
import type {
  BuildContextForTaskInput,
  BuildContextForTaskResult,
  MemoryRecord,
  RetrievalMode,
  MemoryScope,
} from "../types.js";

/** Shared timestamp so within-run recency contributions match across all seeded rows (ties broken by keyword/vector/importance). */
const EVAL_CREATED_AT = "2026-04-01T12:00:00.000Z";

export const retrievalEvalScope = {
  userId: "mahiro",
  projectId: "mahiro-mcp-memory-layer-eval",
  containerId: "workspace:mahiro-mcp-memory-layer-eval",
  sessionWithNotes: "eval-session-probes",
  sessionSparse: "eval-session-sparse",
} as const;

const manualSource = { type: "manual" as const };

/**
 * Fixed corpus: requestId / result-store vs trace-store probes, session rows, and a few
 * project-level distractors that share vocabulary but describe the wrong contract.
 * Importance nudges break ties when keyword + vector + recency align.
 */
export const retrievalEvalMemoryRecords: readonly MemoryRecord[] = [
  {
    id: "eval-proj-request-id",
    kind: "decision",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "requestId hardening: reject payloads when request_id is missing, malformed, or replayed; hooks validate before result-store writes. Status polling must target the correct run after write gating.",
    summary: "",
    tags: [],
    importance: 0.92,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-generic-hardening",
    kind: "fact",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content: "Security hardening: rate limits, auth checks, and audit logging on the API layer.",
    summary: "",
    tags: [],
    importance: 0.35,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-result-store",
    kind: "decision",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "orchestration result-store persists durable workflow outputs (structured results) for downstream tools; distinct from trace metadata. Integrators consume structured workflow artifacts via this handoff path.",
    summary: "",
    tags: [],
    importance: 0.88,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-trace-store",
    kind: "fact",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "orchestration trace-store is append-only canonical jsonl for lifecycle/debugging; not a substitute for durable result payloads. Failure review and engineering inspection use this record stream.",
    summary: "",
    tags: [],
    importance: 0.5,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-orchestration-store-tangle",
    kind: "fact",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Orchestration durable workflow trace exports are mirrored into a downstream result-shaped store shard for jsonl rehydration pipelines; unrelated to toolkit structured outputs or the canonical debugging log contract.",
    summary: "",
    tags: [],
    importance: 0.41,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-session-language-residual",
    kind: "fact",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Project checklist: session-level requestId rejections should precede result-store writes during generic hardening work (wording overlaps session notes but is project-wide guidance).",
    summary: "",
    tags: [],
    importance: 0.38,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-webhook-reqid-distractor",
    kind: "decision",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Webhook delivery deduplication: requestId hardening on the inbound webhook receiver rejects duplicate deliveries at the hook entry-point; unrelated to orchestration write gating or status-polling correctness.",
    summary: "",
    tags: [],
    importance: 0.85,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-result-archive-distractor",
    kind: "decision",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Archival result-store mirroring: durable workflow snapshots are replicated downstream into cold storage for compliance auditing; distinct from the live structured-output handoff path used by integrators.",
    summary: "",
    tags: [],
    importance: 0.82,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-sess-reqid",
    kind: "fact",
    scope: "session",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    sessionId: retrievalEvalScope.sessionWithNotes,
    source: manualSource,
    content:
      "Session probe: requestId must be rejected when missing before touching result-store; requestId hardening precedes writes; session-first retrieval should surface this.",
    summary: "",
    tags: [],
    importance: 0.75,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-sess-reqid-noise",
    kind: "fact",
    scope: "session",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    sessionId: retrievalEvalScope.sessionWithNotes,
    source: manualSource,
    content:
      "Per-request identifier validation at the middleware boundary before result-store writes; generic guardrail without session-scoped probe wording.",
    summary: "",
    tags: [],
    importance: 0.52,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-embedding-cache-invalidation",
    kind: "decision",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Embedding cache invalidation: after prompt-template edits, prior cached embedding rows are stale; retrieval fusion must not treat those vectors as trustworthy for the same task kind across template generations.",
    summary: "",
    tags: [],
    importance: 0.87,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-embedding-cache-hit",
    kind: "fact",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Embedding cache hits: reuse cached vectors when task kind, routed prompt hash, explicit model name, and cwd match; avoids duplicate embed RPC for identical retrieval keys.",
    summary: "",
    tags: [],
    importance: 0.84,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
  {
    id: "eval-proj-verbose-sandbox-rehearsal",
    kind: "fact",
    scope: "project",
    userId: retrievalEvalScope.userId,
    projectId: retrievalEvalScope.projectId,
    containerId: retrievalEvalScope.containerId,
    source: manualSource,
    content:
      "Sandbox rehearsal note (non-production): teams often walk through durable workflow outputs, structured results, downstream tools, integrators, handoff paths, trace metadata, and lifecycle logging while preparing QA checklists. During rehearsal, engineers repeat phrases about durable workflow outputs and structured results for downstream tools, compare trace metadata side notes with integrator-facing handoff paths, and rehearse how downstream tools might skim structured results even though this paragraph is explicitly about dry-run practice rather than the live orchestration contract. The rehearsal script mentions durable workflow outputs again, downstream tools again, structured results again, trace metadata again, and integrator handoff vocabulary again to simulate noisy meeting minutes. None of this substitutes for reading the canonical orchestration plane design notes: it is intentionally verbose padding so lexical overlap stays high while the described intent remains sandbox-only drill documentation.",
    summary: "",
    tags: [],
    importance: 0.42,
    createdAt: EVAL_CREATED_AT,
    updatedAt: EVAL_CREATED_AT,
  },
];

export interface RetrievalEvalSearchCase {
  readonly id: string;
  readonly query: string;
  readonly mode: RetrievalMode;
  readonly scope: MemoryScope;
  readonly sessionId?: string;
  /** When set, overrides the eval harness default projectId (e.g. wrong-project empty results). */
  readonly projectId?: string;
  readonly limit: number;
  readonly expectedTop1: string;
  readonly expectedInTopK?: { readonly k: number; readonly ids: readonly string[] };
  /** When true, pass iff search returns no items (zero-hit / scoped-empty). */
  readonly expectEmpty?: boolean;
  /** When set, search `degraded` must equal this (embedding-failure probes). */
  readonly expectDegraded?: boolean;
}

export interface RetrievalEvalContextCase {
  readonly id: string;
  readonly payload: BuildContextForTaskInput;
  /** First returned memory id must match (session-first / primary hit). */
  readonly expectedFirstItemId: string;
  /** All substrings must appear in built context (usefulness signal). */
  readonly contextMustInclude: readonly string[];
  /** Optional: second id must appear when session + project both contribute. */
  readonly mustIncludeItemIds?: readonly string[];
  /** When set, built `truncated` must equal this (maxChars / item budget probes). */
  readonly expectTruncated?: boolean;
  /** Substrings that must not appear in built context. */
  readonly contextMustExclude?: readonly string[];
  /** Memory ids that must not appear in the built items list. */
  readonly mustExcludeItemIds?: readonly string[];
  /** When true, pass iff no memory items are included (empty retrieval). */
  readonly expectEmptyItems?: boolean;
  /** When set, built `degraded` must equal this (embedding-failure probes). */
  readonly expectDegraded?: boolean;
}

export const retrievalEvalSearchCases: readonly RetrievalEvalSearchCase[] = [
  {
    id: "search-request-id-project",
    query: "requestId reject malformed replay hook hardening",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-request-id",
  },
  {
    id: "search-result-store-project",
    query: "durable workflow outputs result store downstream tools",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-result-store",
  },
  {
    id: "search-trace-store-project",
    query: "append-only canonical orchestration trace jsonl debugging",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-trace-store",
  },
  {
    id: "search-session-request-id",
    query: "session probe requestId rejected result-store",
    mode: "full",
    scope: "session",
    sessionId: retrievalEvalScope.sessionWithNotes,
    limit: 8,
    expectedTop1: "eval-sess-reqid",
  },
  {
    id: "search-session-probe-beats-reqid-noise",
    query: "session probe requestId hardening before result-store writes",
    mode: "full",
    scope: "session",
    sessionId: retrievalEvalScope.sessionWithNotes,
    limit: 8,
    expectedTop1: "eval-sess-reqid",
  },
  {
    id: "search-store-roles-paraphrase",
    query:
      "durable structured workflow outputs downstream tools distinct trace metadata append only canonical jsonl substitute payloads",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-result-store",
    expectedInTopK: { k: 6, ids: ["eval-proj-result-store", "eval-proj-trace-store"] },
  },
  {
    id: "search-semantic-replay-gate",
    query:
      "hook validation must precede durable writes when orchestration traffic looks malformed or replayed so polling cannot attach to the wrong run",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-request-id",
  },
  {
    id: "search-reqid-gating-vs-webhook-dedup",
    query: "requestId hardening reject hook before result-store writes orchestration gating",
    mode: "full",
    scope: "project",
    limit: 10,
    expectedTop1: "eval-proj-request-id",
  },
  {
    id: "search-live-handoff-vs-archival-mirror",
    query: "durable structured workflow outputs result store downstream tools integrators consume",
    mode: "full",
    scope: "project",
    limit: 10,
    expectedTop1: "eval-proj-result-store",
  },
  {
    id: "search-same-topic-embedding-cache-invalidation-beats-reuse",
    query:
      "prompt template edits stale cached embedding rows retrieval fusion must not treat vectors trustworthy same task kind across template generations",
    mode: "full",
    scope: "project",
    limit: 10,
    expectedTop1: "eval-proj-embedding-cache-invalidation",
  },
  {
    id: "search-long-noisy-sandbox-doc-vs-result-store-contract",
    query:
      "orchestration result-store persists durable workflow outputs structured results downstream tools distinct trace metadata integrators consume handoff path",
    mode: "full",
    scope: "project",
    limit: 10,
    expectedTop1: "eval-proj-result-store",
  },
  {
    id: "search-wrong-project-scope-empty",
    query: "requestId reject malformed replay hook hardening",
    mode: "full",
    scope: "project",
    projectId: "mahiro-mcp-memory-layer-eval-missing-project",
    limit: 8,
    expectEmpty: true,
    expectedTop1: "",
  },
  {
    id: "search-session-scope-no-matching-rows",
    query: "session probe requestId rejected result-store",
    mode: "full",
    scope: "session",
    sessionId: "eval-session-without-memories",
    limit: 8,
    expectEmpty: true,
    expectedTop1: "",
  },
];

/** Run only after clearing the Lance table (empty corpus). */
export const retrievalEvalEmptyTableSearchCases: readonly RetrievalEvalSearchCase[] = [
  {
    id: "search-empty-corpus-project-scope",
    query: "requestId orchestration durable workflow outputs",
    mode: "full",
    scope: "project",
    limit: 8,
    expectEmpty: true,
    expectedTop1: "",
  },
];

export const retrievalEvalDegradedSearchCases: readonly RetrievalEvalSearchCase[] = [
  {
    id: "search-degraded-keyword-only-request-id",
    query: "requestId hardening reject malformed replay",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-request-id",
    expectDegraded: true,
  },
  {
    id: "search-degraded-keyword-only-result-store",
    query: "durable workflow outputs downstream tools result-store",
    mode: "full",
    scope: "project",
    limit: 8,
    expectedTop1: "eval-proj-result-store",
    expectDegraded: true,
  },
];

/** Run only after clearing the Lance table (empty corpus). */
export const retrievalEvalEmptyTableContextCases: readonly RetrievalEvalContextCase[] = [
  {
    id: "context-empty-corpus-no-memory-items",
    payload: {
      task: "Summarize requestId hardening for the orchestration result store",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      maxItems: 6,
      maxChars: 8000,
    },
    expectedFirstItemId: "",
    expectEmptyItems: true,
    contextMustInclude: ["Task:", "Relevant memories:"],
  },
];

export const retrievalEvalDegradedContextCases: readonly RetrievalEvalContextCase[] = [
  {
    id: "context-degraded-keyword-only-request-id",
    payload: {
      task: "requestId hardening before result-store writes",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionWithNotes,
      maxItems: 6,
      maxChars: 8000,
    },
    expectedFirstItemId: "eval-sess-reqid",
    contextMustInclude: ["requestId"],
    expectDegraded: true,
  },
];

export const retrievalEvalContextCases: readonly RetrievalEvalContextCase[] = [
  {
    id: "context-session-first-then-project",
    payload: {
      task: "requestId hardening and session probe before result-store writes",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionWithNotes,
      maxItems: 6,
      maxChars: 8000,
    },
    expectedFirstItemId: "eval-sess-reqid",
    contextMustInclude: ["Session probe:", "requestId"],
    mustIncludeItemIds: ["eval-sess-reqid", "eval-proj-request-id"],
  },
  {
    id: "context-project-fallback-when-session-sparse",
    payload: {
      task: "Explain durable workflow outputs in the result store versus trace jsonl",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionSparse,
      maxItems: 6,
      maxChars: 8000,
    },
    expectedFirstItemId: "eval-proj-result-store",
    contextMustInclude: ["result-store", "durable"],
  },
  {
    id: "context-adversarial-sandbox-noise-excluded",
    payload: {
      task: "What is the live orchestration result-store contract for downstream tool integrators?",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionSparse,
      maxItems: 6,
      maxChars: 8000,
    },
    expectedFirstItemId: "eval-proj-result-store",
    contextMustInclude: ["durable workflow outputs", "downstream tools"],
    mustIncludeItemIds: ["eval-proj-result-store"],
  },
  {
    id: "context-tight-maxchars-only-top-item",
    payload: {
      task: "requestId hardening and session probe before result-store writes",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionWithNotes,
      maxItems: 6,
      maxChars: 320,
    },
    expectedFirstItemId: "eval-sess-reqid",
    contextMustInclude: ["Session probe:", "requestId"],
    expectTruncated: true,
    mustExcludeItemIds: ["eval-proj-request-id"],
  },
  {
    id: "context-maxchars-drops-verbose-sandbox-distractor",
    payload: {
      task: "What is the live orchestration result-store contract for downstream tool integrators?",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionSparse,
      maxItems: 10,
      maxChars: 380,
    },
    expectedFirstItemId: "eval-proj-result-store",
    contextMustInclude: ["durable workflow outputs"],
    expectTruncated: true,
    mustExcludeItemIds: ["eval-proj-verbose-sandbox-rehearsal"],
    contextMustExclude: ["Sandbox rehearsal note (non-production)"],
  },
  {
    id: "context-wrong-project-scope-no-items",
    payload: {
      task: "requestId hardening before result-store writes",
      mode: "full",
      userId: retrievalEvalScope.userId,
      projectId: "mahiro-mcp-memory-layer-eval-missing-project",
      containerId: retrievalEvalScope.containerId,
      sessionId: retrievalEvalScope.sessionWithNotes,
      maxItems: 6,
      maxChars: 8000,
    },
    expectedFirstItemId: "",
    expectEmptyItems: true,
    contextMustInclude: ["Task:", "Relevant memories:"],
  },
];

export interface RetrievalEvalSearchCaseResult {
  readonly caseId: string;
  readonly pass: boolean;
  readonly top1: string | null;
  readonly expectedTop1: string;
  readonly rankOfExpected: number;
  readonly topKMisses: readonly string[];
  readonly returnedIds: readonly string[];
  /** Present when the case asserted zero-hit behavior. */
  readonly expectEmpty?: boolean;
  readonly expectDegraded?: boolean;
  readonly degradedMismatch?: boolean;
}

export interface RetrievalEvalContextCaseResult {
  readonly caseId: string;
  readonly pass: boolean;
  readonly firstItemId: string | null;
  readonly expectedFirstItemId: string;
  readonly missingSubstrings: readonly string[];
  readonly missingItemIds: readonly string[];
  readonly forbiddenSubstringsPresent: readonly string[];
  readonly forbiddenItemIdsPresent: readonly string[];
  readonly truncatedMismatch: boolean;
  readonly degradedMismatch: boolean;
  readonly itemIds: readonly string[];
}

export interface RetrievalEvalSummary {
  readonly searchCasesTotal: number;
  readonly searchCasesPassed: number;
  readonly searchTop1Accuracy: number;
  readonly contextCasesTotal: number;
  readonly contextCasesPassed: number;
  readonly contextUsefulnessRate: number;
  readonly overallPass: boolean;
}

export interface RetrievalEvalOkResult {
  readonly status: "ok";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly summary: RetrievalEvalSummary;
  readonly search: readonly RetrievalEvalSearchCaseResult[];
  readonly context: readonly RetrievalEvalContextCaseResult[];
}

function rankOfId(ids: readonly string[], target: string): number {
  const index = ids.indexOf(target);

  return index < 0 ? -1 : index + 1;
}

export function evaluateSearchCase(
  returnedIds: readonly string[],
  spec: RetrievalEvalSearchCase,
  degraded = false,
): { readonly pass: boolean; readonly topKMisses: readonly string[]; readonly degradedMismatch: boolean } {
  const degradedMismatch = spec.expectDegraded !== undefined && degraded !== spec.expectDegraded;

  if (spec.expectEmpty) {
    return { pass: returnedIds.length === 0 && !degradedMismatch, topKMisses: [], degradedMismatch };
  }

  const top1 = returnedIds[0] ?? null;
  const top1Ok = top1 === spec.expectedTop1;
  const k = spec.expectedInTopK?.k;
  const required = spec.expectedInTopK?.ids;

  if (!k || !required || required.length === 0) {
    return { pass: top1Ok && !degradedMismatch, topKMisses: [], degradedMismatch };
  }

  const slice = returnedIds.slice(0, k);
  const topKMisses = required.filter((id) => !slice.includes(id));

  return { pass: top1Ok && topKMisses.length === 0 && !degradedMismatch, topKMisses, degradedMismatch };
}

export function evaluateContextCase(
  result: Pick<BuildContextForTaskResult, "context" | "items" | "truncated" | "degraded">,
  spec: RetrievalEvalContextCase,
): {
  readonly pass: boolean;
  readonly missingSubstrings: readonly string[];
  readonly missingItemIds: readonly string[];
  readonly forbiddenSubstringsPresent: readonly string[];
  readonly forbiddenItemIdsPresent: readonly string[];
  readonly truncatedMismatch: boolean;
  readonly degradedMismatch: boolean;
} {
  const first = result.items[0] ?? null;
  const firstOk = spec.expectEmptyItems
    ? result.items.length === 0
    : first === spec.expectedFirstItemId;
  const missingSubstrings = spec.contextMustInclude.filter((s) => !result.context.includes(s));
  const requiredIds = spec.mustIncludeItemIds ?? [];
  const missingItemIds = requiredIds.filter((id) => !result.items.includes(id));
  const forbiddenSubs = spec.contextMustExclude ?? [];
  const forbiddenSubstringsPresent = forbiddenSubs.filter((s) => result.context.includes(s));
  const forbiddenIds = spec.mustExcludeItemIds ?? [];
  const forbiddenItemIdsPresent = forbiddenIds.filter((id) => result.items.includes(id));
  const truncatedMismatch =
    spec.expectTruncated !== undefined && result.truncated !== spec.expectTruncated;
  const degradedMismatch =
    spec.expectDegraded !== undefined && result.degraded !== spec.expectDegraded;

  return {
    pass:
      firstOk &&
      missingSubstrings.length === 0 &&
      missingItemIds.length === 0 &&
      forbiddenSubstringsPresent.length === 0 &&
      forbiddenItemIdsPresent.length === 0 &&
      !truncatedMismatch &&
      !degradedMismatch,
    missingSubstrings,
    missingItemIds,
    forbiddenSubstringsPresent,
    forbiddenItemIdsPresent,
    truncatedMismatch,
    degradedMismatch,
  };
}

async function rowsFromRecords(
  records: readonly MemoryRecord[],
  embeddingProvider: DeterministicEmbeddingProvider,
): Promise<ReturnType<typeof toRetrievalRow>[]> {
  return Promise.all(
    records.map(async (record) => {
      const embedding = await embeddingProvider.embedText(
        [record.content, record.summary ?? "", ...record.tags].join("\n"),
      );

      return toRetrievalRow(record, embedding, embeddingProvider.version);
    }),
  );
}

class ThrowingEmbeddingProvider {
  public readonly version: string;
  public readonly dimensions: number;

  public constructor(base: DeterministicEmbeddingProvider) {
    this.version = base.version;
    this.dimensions = base.dimensions;
  }

  public async embedText(): Promise<readonly number[]> {
    throw new Error("embedding unavailable");
  }
}

export async function runRetrievalEval(): Promise<RetrievalEvalOkResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const env = getAppEnv();
  const root = await mkdtemp(path.join(os.tmpdir(), "mcp-memory-retrieval-eval-"));

  try {
    await Promise.all([
      mkdir(path.join(root, "traces"), { recursive: true }),
      mkdir(path.join(root, "lancedb"), { recursive: true }),
      mkdir(path.join(root, "lancedb-empty"), { recursive: true }),
    ]);

    const embeddingProvider = new DeterministicEmbeddingProvider(env.embeddingDimensions);
    const connection = await connectToLanceDb(path.join(root, "lancedb"));
    const table = new MemoryRecordsTable(connection);
    const emptyConnection = await connectToLanceDb(path.join(root, "lancedb-empty"));
    const emptyTable = new MemoryRecordsTable(emptyConnection);
    const traceStore = new RetrievalTraceStore(path.join(root, "traces", "retrieval-trace.jsonl"));

    const rows = await rowsFromRecords(retrievalEvalMemoryRecords, embeddingProvider);
    await table.replaceAll(rows);

    const baseScope = {
      userId: retrievalEvalScope.userId,
      projectId: retrievalEvalScope.projectId,
      containerId: retrievalEvalScope.containerId,
    };

    const searchResults: RetrievalEvalSearchCaseResult[] = [];

    const runSearchSpec = async (spec: RetrievalEvalSearchCase): Promise<void> => {
      const searchResult = await searchMemories({
        payload: {
          query: spec.query,
          mode: spec.mode,
          scope: spec.scope,
          ...baseScope,
          ...(spec.projectId ? { projectId: spec.projectId } : {}),
          ...(spec.sessionId ? { sessionId: spec.sessionId } : {}),
          limit: spec.limit,
        },
        table,
        embeddingProvider,
        traceStore,
      });

      const returnedIds = searchResult.items.map((item) => item.id);
      const { pass, topKMisses, degradedMismatch } = evaluateSearchCase(returnedIds, spec, searchResult.degraded);
      const expectEmpty = spec.expectEmpty ?? false;
      const expectDegraded = spec.expectDegraded ?? false;

      searchResults.push({
        caseId: spec.id,
        pass,
        top1: returnedIds[0] ?? null,
        expectedTop1: expectEmpty ? "" : spec.expectedTop1,
        rankOfExpected: expectEmpty ? -1 : rankOfId(returnedIds, spec.expectedTop1),
        topKMisses,
        returnedIds,
        ...(expectEmpty ? { expectEmpty: true as const } : {}),
        ...(expectDegraded ? { expectDegraded: true as const } : {}),
        ...(degradedMismatch ? { degradedMismatch } : {}),
      });
    };

    for (const spec of retrievalEvalSearchCases) {
      await runSearchSpec(spec);
    }

    for (const spec of retrievalEvalEmptyTableSearchCases) {
      const searchResult = await searchMemories({
        payload: {
          query: spec.query,
          mode: spec.mode,
          scope: spec.scope,
          ...baseScope,
          ...(spec.projectId ? { projectId: spec.projectId } : {}),
          ...(spec.sessionId ? { sessionId: spec.sessionId } : {}),
          limit: spec.limit,
        },
        table: emptyTable,
        embeddingProvider,
        traceStore,
      });

      const returnedIds = searchResult.items.map((item) => item.id);
      const { pass, topKMisses, degradedMismatch } = evaluateSearchCase(returnedIds, spec, searchResult.degraded);

      searchResults.push({
        caseId: spec.id,
        pass,
        top1: returnedIds[0] ?? null,
        expectedTop1: "",
        rankOfExpected: -1,
        topKMisses,
        returnedIds,
        expectEmpty: true,
        ...(degradedMismatch ? { degradedMismatch } : {}),
      });
    }

    const degradedEmbeddingProvider = new ThrowingEmbeddingProvider(embeddingProvider);

    for (const spec of retrievalEvalDegradedSearchCases) {
      const searchResult = await searchMemories({
        payload: {
          query: spec.query,
          mode: spec.mode,
          scope: spec.scope,
          ...baseScope,
          ...(spec.projectId ? { projectId: spec.projectId } : {}),
          ...(spec.sessionId ? { sessionId: spec.sessionId } : {}),
          limit: spec.limit,
        },
        table,
        embeddingProvider: degradedEmbeddingProvider,
        traceStore,
      });

      const returnedIds = searchResult.items.map((item) => item.id);
      const { pass, topKMisses, degradedMismatch } = evaluateSearchCase(returnedIds, spec, searchResult.degraded);

      searchResults.push({
        caseId: spec.id,
        pass,
        top1: returnedIds[0] ?? null,
        expectedTop1: spec.expectedTop1,
        rankOfExpected: rankOfId(returnedIds, spec.expectedTop1),
        topKMisses,
        returnedIds,
        expectDegraded: true,
        ...(degradedMismatch ? { degradedMismatch } : {}),
      });
    }

    const contextResults: RetrievalEvalContextCaseResult[] = [];

    const runContextSpec = async (spec: RetrievalEvalContextCase): Promise<void> => {
      const built = await buildContextForTask({
        payload: spec.payload,
        table,
        embeddingProvider,
        traceStore,
      });

      const {
        pass,
        missingSubstrings,
        missingItemIds,
        forbiddenSubstringsPresent,
        forbiddenItemIdsPresent,
        truncatedMismatch,
        degradedMismatch,
      } = evaluateContextCase(built, spec);

      contextResults.push({
        caseId: spec.id,
        pass,
        firstItemId: built.items[0] ?? null,
        expectedFirstItemId: spec.expectEmptyItems ? "" : spec.expectedFirstItemId,
        missingSubstrings,
        missingItemIds,
        forbiddenSubstringsPresent,
        forbiddenItemIdsPresent,
        truncatedMismatch,
        degradedMismatch,
        itemIds: [...built.items],
      });
    };

    await table.replaceAll(rows);

    for (const spec of retrievalEvalContextCases) {
      await runContextSpec(spec);
    }

    for (const spec of retrievalEvalEmptyTableContextCases) {
      const built = await buildContextForTask({
        payload: spec.payload,
        table: emptyTable,
        embeddingProvider,
        traceStore,
      });

      const {
        pass,
        missingSubstrings,
        missingItemIds,
        forbiddenSubstringsPresent,
        forbiddenItemIdsPresent,
        truncatedMismatch,
        degradedMismatch,
      } = evaluateContextCase(built, spec);

      contextResults.push({
        caseId: spec.id,
        pass,
        firstItemId: built.items[0] ?? null,
        expectedFirstItemId: "",
        missingSubstrings,
        missingItemIds,
        forbiddenSubstringsPresent,
        forbiddenItemIdsPresent,
        truncatedMismatch,
        degradedMismatch,
        itemIds: [...built.items],
      });
    }

    for (const spec of retrievalEvalDegradedContextCases) {
      const built = await buildContextForTask({
        payload: spec.payload,
        table,
        embeddingProvider: degradedEmbeddingProvider,
        traceStore,
      });

      const {
        pass,
        missingSubstrings,
        missingItemIds,
        forbiddenSubstringsPresent,
        forbiddenItemIdsPresent,
        truncatedMismatch,
        degradedMismatch,
      } = evaluateContextCase(built, spec);

      contextResults.push({
        caseId: spec.id,
        pass,
        firstItemId: built.items[0] ?? null,
        expectedFirstItemId: spec.expectedFirstItemId,
        missingSubstrings,
        missingItemIds,
        forbiddenSubstringsPresent,
        forbiddenItemIdsPresent,
        truncatedMismatch,
        degradedMismatch,
        itemIds: [...built.items],
      });
    }

    const finishedAtDate = new Date();
    const searchPassed = searchResults.filter((r) => r.pass).length;
    const contextPassed = contextResults.filter((r) => r.pass).length;
    const searchTop1Hits = searchResults.filter((r) => (r.expectEmpty ? r.pass : r.top1 === r.expectedTop1)).length;

    const summary: RetrievalEvalSummary = {
      searchCasesTotal: searchResults.length,
      searchCasesPassed: searchPassed,
      searchTop1Accuracy: searchResults.length === 0 ? 1 : searchTop1Hits / searchResults.length,
      contextCasesTotal: contextResults.length,
      contextCasesPassed: contextPassed,
      contextUsefulnessRate:
        contextResults.length === 0
          ? 1
          : contextResults.filter((r) => r.missingSubstrings.length === 0).length / contextResults.length,
      overallPass: searchPassed === searchResults.length && contextPassed === contextResults.length,
    };

    return {
      status: "ok",
      startedAt,
      finishedAt: finishedAtDate.toISOString(),
      durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
      summary,
      search: searchResults,
      context: contextResults,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function formatRetrievalEvalAsText(result: RetrievalEvalOkResult): string {
  const lines: string[] = [
    `retrieval eval: ${result.summary.overallPass ? "PASS" : "FAIL"}`,
    `durationMs: ${result.durationMs}`,
    `search: ${result.summary.searchCasesPassed}/${result.summary.searchCasesTotal} cases (top1 accuracy ${result.summary.searchTop1Accuracy.toFixed(2)})`,
    `context: ${result.summary.contextCasesPassed}/${result.summary.contextCasesTotal} cases (substring usefulness ${result.summary.contextUsefulnessRate.toFixed(2)})`,
    "",
    "search cases:",
  ];

  for (const row of result.search) {
    const expectedLabel = row.expectEmpty ? "∅" : row.expectedTop1;
    lines.push(
      `  ${row.pass ? "ok" : "FAIL"} ${row.caseId} top1=${row.top1 ?? "∅"} expected=${expectedLabel} rank=${row.rankOfExpected}`,
    );

    if (row.topKMisses.length > 0) {
      lines.push(`    topK misses: ${row.topKMisses.join(", ")}`);
    }

    if (row.degradedMismatch) {
      lines.push("    degraded flag did not match expectDegraded");
    }
  }

  lines.push("", "context cases:");

  for (const row of result.context) {
    const expectedFirst = row.expectedFirstItemId === "" ? "∅" : row.expectedFirstItemId;
    lines.push(
      `  ${row.pass ? "ok" : "FAIL"} ${row.caseId} first=${row.firstItemId ?? "∅"} expected=${expectedFirst}`,
    );

    if (row.missingSubstrings.length > 0) {
      lines.push(`    missing substrings: ${row.missingSubstrings.join(" | ")}`);
    }

    if (row.missingItemIds.length > 0) {
      lines.push(`    missing item ids: ${row.missingItemIds.join(", ")}`);
    }

    if (row.forbiddenSubstringsPresent.length > 0) {
      lines.push(`    forbidden substrings present: ${row.forbiddenSubstringsPresent.join(" | ")}`);
    }

    if (row.forbiddenItemIdsPresent.length > 0) {
      lines.push(`    forbidden item ids present: ${row.forbiddenItemIdsPresent.join(", ")}`);
    }

    if (row.truncatedMismatch) {
      lines.push("    truncated flag did not match expectTruncated");
    }

    if (row.degradedMismatch) {
      lines.push("    degraded flag did not match expectDegraded");
    }
  }

  return `${lines.join("\n")}\n`;
}
