import { memoryKinds, memoryScopes } from "../memory/constants.js";
import type { MemoryRecord, MemoryScope, SearchMemoryItem } from "../memory/types.js";
import type {
  ViewerFilterState,
  ViewerKindFilter,
  ViewerMemory,
  ViewerReviewStatusFilter,
  ViewerScopeFilter,
  ViewerVerificationStatusFilter,
} from "./types.js";

const defaultViewerLimit = 100;
const minimumViewerLimit = 1;
const maximumViewerLimit = 100;

export const viewerScopeFilters = ["all", ...memoryScopes] as const;
export const viewerKindFilters = ["all", ...memoryKinds] as const;
export const viewerVerificationStatusFilters = ["all", "hypothesis", "verified"] as const;
export const viewerReviewStatusFilters = ["all", "none", "pending", "deferred", "rejected"] as const;

export function normalizeViewerFilters(input: URLSearchParams): ViewerFilterState {
  return {
    query: normalizeOptionalText(input.get("q")),
    scope: normalizeScopeFilter(input.get("scope")),
    kind: normalizeKindFilter(input.get("kind")),
    verificationStatus: normalizeVerificationStatusFilter(input.get("verificationStatus")),
    reviewStatus: normalizeReviewStatusFilter(input.get("reviewStatus")),
    projectId: normalizeOptionalText(input.get("projectId")),
    containerId: normalizeOptionalText(input.get("containerId")),
    selectedId: normalizeOptionalText(input.get("id")),
    limit: normalizeLimit(input.get("limit")),
  };
}

export function normalizeMemoryRecord(record: MemoryRecord): ViewerMemory {
  return {
    id: record.id,
    kind: record.kind,
    scope: record.scope,
    verificationStatus: record.verificationStatus ?? "hypothesis",
    reviewStatus: record.reviewStatus,
    reviewDecisions: record.reviewDecisions ?? [],
    verifiedAt: record.verifiedAt,
    verificationEvidence: record.verificationEvidence ?? [],
    projectId: record.projectId,
    containerId: record.containerId,
    source: record.source,
    content: record.content,
    summary: record.summary,
    tags: record.tags,
    importance: record.importance,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    reasons: [],
  };
}

export function normalizeSearchMemoryItem(
  item: SearchMemoryItem,
  scope: MemoryScope,
  projectId?: string,
  containerId?: string,
): ViewerMemory {
  return {
    id: item.id,
    kind: item.kind,
    scope,
    verificationStatus: item.verificationStatus,
    reviewStatus: item.reviewStatus,
    reviewDecisions: item.reviewDecisions,
    verifiedAt: item.verifiedAt,
    verificationEvidence: item.verificationEvidence,
    projectId,
    containerId,
    source: item.source,
    content: item.content,
    summary: item.summary,
    tags: [],
    importance: item.importance,
    createdAt: item.createdAt,
    score: item.score,
    reasons: item.reasons,
  };
}

export function filterViewerMemories(
  memories: readonly ViewerMemory[],
  filters: ViewerFilterState,
  options: { readonly includeQuery?: boolean } = {},
): readonly ViewerMemory[] {
  const includeQuery = options.includeQuery ?? true;
  const query = includeQuery ? filters.query?.toLocaleLowerCase() : undefined;

  return sortViewerMemories(
    memories
      .filter((memory) => filters.scope === "all" || memory.scope === filters.scope)
      .filter((memory) => filters.kind === "all" || memory.kind === filters.kind)
      .filter((memory) => filters.verificationStatus === "all" || memory.verificationStatus === filters.verificationStatus)
      .filter((memory) => matchesReviewStatus(memory, filters.reviewStatus))
      .filter((memory) => !filters.projectId || memory.projectId === filters.projectId)
      .filter((memory) => !filters.containerId || memory.containerId === filters.containerId)
      .filter((memory) => !query || searchableText(memory).toLocaleLowerCase().includes(query)),
  );
}

export function canUseIndexedSearch(
  filters: ViewerFilterState,
): filters is ViewerFilterState & { readonly query: string; readonly scope: MemoryScope } {
  if (filters.query === undefined) {
    return false;
  }

  if (filters.scope === "global") {
    return true;
  }

  return filters.scope === "project" && filters.projectId !== undefined && filters.containerId !== undefined;
}

export function filtersToSearchParams(filters: ViewerFilterState, selectedId?: string): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, "q", filters.query);
  appendParam(params, "scope", filters.scope === "all" ? undefined : filters.scope);
  appendParam(params, "kind", filters.kind === "all" ? undefined : filters.kind);
  appendParam(params, "verificationStatus", filters.verificationStatus === "all" ? undefined : filters.verificationStatus);
  appendParam(params, "reviewStatus", filters.reviewStatus === "all" ? undefined : filters.reviewStatus);
  appendParam(params, "projectId", filters.projectId);
  appendParam(params, "containerId", filters.containerId);
  appendParam(params, "limit", filters.limit === defaultViewerLimit ? undefined : String(filters.limit));
  appendParam(params, "id", selectedId);
  return params;
}

function normalizeOptionalText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeScopeFilter(value: string | null): ViewerScopeFilter {
  return viewerScopeFilters.includes(value as ViewerScopeFilter) ? (value as ViewerScopeFilter) : "all";
}

function normalizeKindFilter(value: string | null): ViewerKindFilter {
  return viewerKindFilters.includes(value as ViewerKindFilter) ? (value as ViewerKindFilter) : "all";
}

function normalizeVerificationStatusFilter(value: string | null): ViewerVerificationStatusFilter {
  return viewerVerificationStatusFilters.includes(value as ViewerVerificationStatusFilter)
    ? (value as ViewerVerificationStatusFilter)
    : "all";
}

function normalizeReviewStatusFilter(value: string | null): ViewerReviewStatusFilter {
  return viewerReviewStatusFilters.includes(value as ViewerReviewStatusFilter)
    ? (value as ViewerReviewStatusFilter)
    : "all";
}

function normalizeLimit(value: string | null): number {
  if (!value) {
    return defaultViewerLimit;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return defaultViewerLimit;
  }

  return Math.min(Math.max(parsed, minimumViewerLimit), maximumViewerLimit);
}

function matchesReviewStatus(memory: ViewerMemory, filter: ViewerReviewStatusFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "none") {
    return memory.reviewStatus === undefined;
  }

  return memory.reviewStatus === filter;
}

function searchableText(memory: ViewerMemory): string {
  return [
    memory.id,
    memory.kind,
    memory.scope ?? "",
    memory.content,
    memory.summary ?? "",
    memory.projectId ?? "",
    memory.containerId ?? "",
    memory.source.type,
    memory.source.uri ?? "",
    memory.source.title ?? "",
    ...memory.tags,
    ...memory.reasons,
  ].join("\n");
}

function sortViewerMemories(memories: readonly ViewerMemory[]): readonly ViewerMemory[] {
  return [...memories].sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
    return rightTime - leftTime;
  });
}

function appendParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}
