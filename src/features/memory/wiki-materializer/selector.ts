import { assertValidScope } from "../lib/scope.js";
import type { MemoryRecord, MemoryReviewStatus, MemoryVerificationStatus } from "../types.js";
import {
  defaultWikiMaterializerFilterFlags,
  type WikiMaterializerExclusionReason,
  type WikiMaterializerFilterFlags,
  type WikiMaterializerFilters,
  type WikiMaterializerOptions,
  type WikiSelectedRecord,
} from "./contracts.js";
import { hashWikiMaterializerRecord } from "./utils.js";

export interface WikiCanonicalRecordReader {
  readAll(): Promise<readonly MemoryRecord[]>;
}

export interface SelectWikiCanonicalRecordsInput {
  readonly logStore: WikiCanonicalRecordReader;
  readonly options: Pick<WikiMaterializerOptions, "projectId" | "containerId" | "filters">;
}

export interface WikiCanonicalRecordSelection {
  readonly records: readonly WikiSelectedRecord[];
  readonly filters: WikiMaterializerFilters;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly excludedByReason: Partial<Record<WikiMaterializerExclusionReason, number>>;
}

export async function selectWikiCanonicalRecords(
  input: SelectWikiCanonicalRecordsInput,
): Promise<WikiCanonicalRecordSelection> {
  assertValidScope({
    scope: "project",
    projectId: input.options.projectId,
    containerId: input.options.containerId,
  });

  const filters = resolveWikiMaterializerFilters(input.options.filters);
  const records = await input.logStore.readAll();
  const selected: WikiSelectedRecord[] = [];
  const excludedByReason: Partial<Record<WikiMaterializerExclusionReason, number>> = {};

  for (const record of records) {
    const excludedReason = getExclusionReason(record, input.options, filters);

    if (excludedReason) {
      excludedByReason[excludedReason] = (excludedByReason[excludedReason] ?? 0) + 1;
      continue;
    }

    selected.push(toSelectedRecord(record));
  }

  selected.sort(compareSelectedRecords);

  const excludedCount = Object.values(excludedByReason).reduce((total, count) => total + count, 0);

  return {
    records: selected,
    filters,
    includedCount: selected.length,
    excludedCount,
    excludedByReason,
  };
}

export function resolveWikiMaterializerFilters(
  overrides: Partial<WikiMaterializerFilterFlags> | undefined,
): WikiMaterializerFilters {
  const flags = {
    ...defaultWikiMaterializerFilterFlags,
    ...overrides,
  } satisfies WikiMaterializerFilterFlags;

  const includeVerificationStatuses: MemoryVerificationStatus[] = ["verified"];

  if (flags.includeHypotheses) {
    includeVerificationStatuses.push("hypothesis");
  }

  const excludeReviewStatuses: MemoryReviewStatus[] = [];

  if (!flags.includePendingReview) {
    excludeReviewStatuses.push("pending");
  }

  if (!flags.includeDeferredReview) {
    excludeReviewStatuses.push("deferred");
  }

  if (!flags.includeRejectedReview) {
    excludeReviewStatuses.push("rejected");
  }

  return {
    mode: flags.includeHypotheses ? "include_hypotheses" : "verified_only",
    includeVerificationStatuses,
    excludeReviewStatuses,
    flags,
  };
}

function getExclusionReason(
  record: MemoryRecord,
  scope: Pick<WikiMaterializerOptions, "projectId" | "containerId">,
  filters: WikiMaterializerFilters,
): WikiMaterializerExclusionReason | undefined {
  if (record.scope !== "project" || record.projectId !== scope.projectId || record.containerId !== scope.containerId) {
    return "scope_mismatch";
  }

  if (record.reviewStatus === "rejected" && filters.excludeReviewStatuses.includes("rejected")) {
    return "rejected_review";
  }

  if (record.reviewStatus === "deferred" && filters.excludeReviewStatuses.includes("deferred")) {
    return "deferred_review";
  }

  if (record.reviewStatus === "pending" && filters.excludeReviewStatuses.includes("pending")) {
    return "pending_review";
  }

  if (!filters.includeVerificationStatuses.includes(record.verificationStatus ?? "hypothesis")) {
    return "unverified";
  }

  return undefined;
}

function toSelectedRecord(record: MemoryRecord): WikiSelectedRecord {
  const selectedRecord = {
    id: record.id,
    kind: record.kind,
    scope: record.scope,
    verificationStatus: record.verificationStatus ?? "hypothesis",
    reviewStatus: record.reviewStatus,
    reviewDecisions: record.reviewDecisions ?? [],
    verifiedAt: record.verifiedAt,
    verificationEvidence: record.verificationEvidence ?? [],
    projectId: record.projectId ?? "",
    containerId: record.containerId ?? "",
    source: record.source,
    content: record.content,
    summary: record.summary,
    tags: record.tags,
    importance: record.importance,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  return {
    ...selectedRecord,
    recordHash: hashWikiMaterializerRecord(selectedRecord),
  };
}

function compareSelectedRecords(left: WikiSelectedRecord, right: WikiSelectedRecord): number {
  return compareText(left.kind, right.kind)
    || compareText(left.source.uri ?? "", right.source.uri ?? "")
    || compareText(left.source.title ?? "", right.source.title ?? "")
    || compareText(left.createdAt, right.createdAt)
    || compareText(left.updatedAt ?? "", right.updatedAt ?? "")
    || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
