import { memoryKinds, memoryScopes } from "../memory/constants.js";
import type { MemoryRecord, MemoryScope, SearchMemoryItem } from "../memory/types.js";
import type {
  ConsoleGraphEdgeTypeFilter,
  ConsoleFilterState,
  ConsoleKindFilter,
  ConsoleMemory,
  ConsoleNavigationView,
  ConsoleProjectScopeSummary,
  ConsoleReviewStatusFilter,
  ConsoleReviewStatusCountKey,
  ConsoleScopeFilter,
  ConsoleVerificationStatusFilter,
} from "./types.js";

const defaultConsoleLimit = 50;
const minimumConsoleLimit = 1;
const maximumConsoleLimit = 50;

export const consoleNavigationViews = ["verified", "inbox", "projects", "firehose"] as const;
export const consoleScopeFilters = ["all", ...memoryScopes] as const;
export const consoleKindFilters = ["all", ...memoryKinds] as const;
export const consoleVerificationStatusFilters = ["all", "hypothesis", "verified"] as const;
export const consoleReviewStatusFilters = ["all", "active", "none", "pending", "deferred", "rejected"] as const;
export const consoleGraphEdgeTypeFilters = ["all", "has_source", "tagged_with", "has_evidence", "reviewed_as", "related_memory"] as const;

export function normalizeConsoleFilters(input: URLSearchParams): ConsoleFilterState {
  const view = normalizeNavigationView(input.get("view"));
  const scope = normalizeScopeFilter(input.get("scope"));
  const projectId = scope === "global" ? undefined : normalizeOptionalText(input.get("projectId"));
  const containerId = scope === "global" ? undefined : normalizeOptionalText(input.get("containerId"));
  const verificationStatus = input.has("verificationStatus")
    ? normalizeVerificationStatusFilter(input.get("verificationStatus"))
    : defaultVerificationStatusForView(view);
  const reviewStatus = input.has("reviewStatus")
    ? normalizeReviewStatusFilter(input.get("reviewStatus"))
    : defaultReviewStatusForView(view);

  return {
    view,
    query: normalizeOptionalText(input.get("q")),
    scope,
    kind: normalizeKindFilter(input.get("kind")),
    verificationStatus,
    reviewStatus,
    projectId,
    containerId,
    selectedId: scope === "global" ? undefined : normalizeOptionalText(input.get("id")),
    limit: normalizeLimit(input.get("limit")),
    graphEdgeType: normalizeGraphEdgeTypeFilter(input.get("edgeType")),
  };
}

export function normalizeMemoryRecord(record: MemoryRecord): ConsoleMemory {
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
): ConsoleMemory {
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

export function filterConsoleMemories(
  memories: readonly ConsoleMemory[],
  filters: ConsoleFilterState,
  options: { readonly includeQuery?: boolean } = {},
): readonly ConsoleMemory[] {
  const includeQuery = options.includeQuery ?? true;
  const query = includeQuery ? filters.query?.toLocaleLowerCase() : undefined;

  return sortConsoleMemories(
    memories
      .filter((memory) => matchesNavigationView(memory, filters.view))
      .filter((memory) => filters.scope === "all" || memory.scope === filters.scope)
      .filter((memory) => filters.kind === "all" || memory.kind === filters.kind)
      .filter((memory) => filters.verificationStatus === "all" || memory.verificationStatus === filters.verificationStatus)
      .filter((memory) => matchesReviewStatus(memory, filters.reviewStatus))
      .filter((memory) => !filters.projectId || memory.projectId === filters.projectId)
      .filter((memory) => !filters.containerId || memory.containerId === filters.containerId)
      .filter((memory) => !query || searchableText(memory).toLocaleLowerCase().includes(query)),
  );
}

export function aggregateConsoleProjectScopes(memories: readonly ConsoleMemory[]): readonly ConsoleProjectScopeSummary[] {
  const summaries = new Map<string, MutableConsoleProjectScopeSummary>();

  for (const memory of memories) {
    if (memory.scope !== "project" || !memory.projectId || !memory.containerId) {
      continue;
    }

    const key = `${memory.projectId}\u0000${memory.containerId}`;
    const summary = summaries.get(key) ?? createMutableConsoleProjectScopeSummary(memory.projectId, memory.containerId);
    summary.totalCount += 1;
    summary.kindCounts[memory.kind] += 1;
    summary.verificationStatusCounts[memory.verificationStatus] += 1;
    summary.reviewStatusCounts[memory.reviewStatus ?? "none"] += 1;

    const timestamp = memory.updatedAt ?? memory.createdAt;
    if (isNewerTimestamp(timestamp, summary.latestTimestamp)) {
      summary.latestTimestamp = timestamp;
    }

    summaries.set(key, summary);
  }

  return [...summaries.values()].sort((left, right) => {
    const rightTime = right.latestTimestamp ? Date.parse(right.latestTimestamp) : 0;
    const leftTime = left.latestTimestamp ? Date.parse(left.latestTimestamp) : 0;
    const timeDifference = rightTime - leftTime;

    if (timeDifference !== 0) {
      return timeDifference;
    }

    const projectDifference = left.projectId.localeCompare(right.projectId);
    return projectDifference !== 0 ? projectDifference : left.containerId.localeCompare(right.containerId);
  });
}

export function canUseIndexedSearch(
  filters: ConsoleFilterState,
): filters is ConsoleFilterState & { readonly query: string; readonly scope: MemoryScope } {
  if (filters.query === undefined) {
    return false;
  }

  if (filters.scope === "global") {
    return true;
  }

  return filters.scope === "project" && filters.projectId !== undefined && filters.containerId !== undefined;
}

export function filtersToSearchParams(filters: ConsoleFilterState, selectedId?: string): URLSearchParams {
  const params = new URLSearchParams();
  const defaultVerificationStatus = defaultVerificationStatusForView(filters.view);
  const defaultReviewStatus = defaultReviewStatusForView(filters.view);
  appendParam(params, "q", filters.query);
  appendParam(params, "view", filters.view === "verified" ? undefined : filters.view);
  appendParam(params, "scope", filters.scope === "all" ? undefined : filters.scope);
  appendParam(params, "kind", filters.kind === "all" ? undefined : filters.kind);
  appendParam(
    params,
    "verificationStatus",
    filters.verificationStatus === defaultVerificationStatus ? undefined : filters.verificationStatus,
  );
  appendParam(
    params,
    "reviewStatus",
    filters.reviewStatus === defaultReviewStatus ? undefined : filters.reviewStatus,
  );
  appendParam(params, "projectId", filters.projectId);
  appendParam(params, "containerId", filters.containerId);
  appendParam(params, "limit", filters.limit === defaultConsoleLimit ? undefined : String(filters.limit));
  appendParam(params, "edgeType", filters.graphEdgeType === undefined || filters.graphEdgeType === "all" ? undefined : filters.graphEdgeType);
  appendParam(params, "id", selectedId);
  return params;
}

interface MutableConsoleProjectScopeSummary {
  readonly projectId: string;
  readonly containerId: string;
  totalCount: number;
  readonly kindCounts: Record<ConsoleMemory["kind"], number>;
  readonly verificationStatusCounts: Record<ConsoleMemory["verificationStatus"], number>;
  readonly reviewStatusCounts: Record<ConsoleReviewStatusCountKey, number>;
  latestTimestamp?: string;
}

function createMutableConsoleProjectScopeSummary(projectId: string, containerId: string): MutableConsoleProjectScopeSummary {
  return {
    projectId,
    containerId,
    totalCount: 0,
    kindCounts: {
      fact: 0,
      conversation: 0,
      decision: 0,
      doc: 0,
      task: 0,
    },
    verificationStatusCounts: {
      hypothesis: 0,
      verified: 0,
    },
    reviewStatusCounts: {
      none: 0,
      pending: 0,
      deferred: 0,
      rejected: 0,
    },
  };
}

function isNewerTimestamp(candidate: string, current: string | undefined): boolean {
  if (!current) {
    return true;
  }

  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);

  if (!Number.isFinite(candidateTime)) {
    return false;
  }

  if (!Number.isFinite(currentTime)) {
    return true;
  }

  return candidateTime > currentTime;
}

function normalizeOptionalText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNavigationView(value: string | null): ConsoleNavigationView {
  return consoleNavigationViews.includes(value as ConsoleNavigationView) ? (value as ConsoleNavigationView) : "verified";
}

function defaultVerificationStatusForView(view: ConsoleNavigationView): ConsoleVerificationStatusFilter {
  return view === "verified" ? "verified" : "all";
}

function defaultReviewStatusForView(view: ConsoleNavigationView): ConsoleReviewStatusFilter {
  return view === "firehose" ? "all" : "active";
}

function normalizeScopeFilter(value: string | null): ConsoleScopeFilter {
  return consoleScopeFilters.includes(value as ConsoleScopeFilter) ? (value as ConsoleScopeFilter) : "all";
}

function normalizeKindFilter(value: string | null): ConsoleKindFilter {
  return consoleKindFilters.includes(value as ConsoleKindFilter) ? (value as ConsoleKindFilter) : "all";
}

function normalizeVerificationStatusFilter(value: string | null): ConsoleVerificationStatusFilter {
  return consoleVerificationStatusFilters.includes(value as ConsoleVerificationStatusFilter)
    ? (value as ConsoleVerificationStatusFilter)
    : "all";
}

function normalizeReviewStatusFilter(value: string | null): ConsoleReviewStatusFilter {
  return consoleReviewStatusFilters.includes(value as ConsoleReviewStatusFilter)
    ? (value as ConsoleReviewStatusFilter)
    : "all";
}

function normalizeGraphEdgeTypeFilter(value: string | null): ConsoleGraphEdgeTypeFilter {
  return consoleGraphEdgeTypeFilters.includes(value as ConsoleGraphEdgeTypeFilter)
    ? (value as ConsoleGraphEdgeTypeFilter)
    : "all";
}

function normalizeLimit(value: string | null): number {
  if (!value) {
    return defaultConsoleLimit;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return defaultConsoleLimit;
  }

  return Math.min(Math.max(parsed, minimumConsoleLimit), maximumConsoleLimit);
}

function matchesReviewStatus(memory: ConsoleMemory, filter: ConsoleReviewStatusFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return memory.reviewStatus !== "rejected";
  }

  if (filter === "none") {
    return memory.reviewStatus === undefined;
  }

  return memory.reviewStatus === filter;
}

function matchesNavigationView(memory: ConsoleMemory, view: ConsoleNavigationView): boolean {
  if (view !== "inbox") {
    return true;
  }

  return memory.reviewStatus !== "rejected" && (
    memory.verificationStatus === "hypothesis" ||
    memory.reviewStatus === undefined ||
    memory.reviewStatus === "pending"
  );
}

function searchableText(memory: ConsoleMemory): string {
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

function sortConsoleMemories(memories: readonly ConsoleMemory[]): readonly ConsoleMemory[] {
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
