import { memoryKinds, memoryScopes } from "../memory/constants.js";
import type { MemoryRecord, MemoryScope, SearchMemoryItem } from "../memory/types.js";
import type {
  ViewerFilterState,
  ViewerKindFilter,
  ViewerMemory,
  ViewerNavigationView,
  ViewerProjectScopeSummary,
  ViewerReviewStatusFilter,
  ViewerReviewStatusCountKey,
  ViewerScopeFilter,
  ViewerVerificationStatusFilter,
} from "./types.js";

const defaultViewerLimit = 50;
const minimumViewerLimit = 1;
const maximumViewerLimit = 50;

export const viewerNavigationViews = ["verified", "inbox", "projects", "firehose"] as const;
export const viewerScopeFilters = ["all", ...memoryScopes] as const;
export const viewerKindFilters = ["all", ...memoryKinds] as const;
export const viewerVerificationStatusFilters = ["all", "hypothesis", "verified"] as const;
export const viewerReviewStatusFilters = ["all", "active", "none", "pending", "deferred", "rejected"] as const;

export function normalizeViewerFilters(input: URLSearchParams): ViewerFilterState {
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

export function aggregateViewerProjectScopes(memories: readonly ViewerMemory[]): readonly ViewerProjectScopeSummary[] {
  const summaries = new Map<string, MutableViewerProjectScopeSummary>();

  for (const memory of memories) {
    if (memory.scope !== "project" || !memory.projectId || !memory.containerId) {
      continue;
    }

    const key = `${memory.projectId}\u0000${memory.containerId}`;
    const summary = summaries.get(key) ?? createMutableProjectScopeSummary(memory.projectId, memory.containerId);
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
  appendParam(params, "limit", filters.limit === defaultViewerLimit ? undefined : String(filters.limit));
  appendParam(params, "id", selectedId);
  return params;
}

interface MutableViewerProjectScopeSummary {
  readonly projectId: string;
  readonly containerId: string;
  totalCount: number;
  readonly kindCounts: Record<ViewerMemory["kind"], number>;
  readonly verificationStatusCounts: Record<ViewerMemory["verificationStatus"], number>;
  readonly reviewStatusCounts: Record<ViewerReviewStatusCountKey, number>;
  latestTimestamp?: string;
}

function createMutableProjectScopeSummary(projectId: string, containerId: string): MutableViewerProjectScopeSummary {
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

function normalizeNavigationView(value: string | null): ViewerNavigationView {
  return viewerNavigationViews.includes(value as ViewerNavigationView) ? (value as ViewerNavigationView) : "verified";
}

function defaultVerificationStatusForView(view: ViewerNavigationView): ViewerVerificationStatusFilter {
  return view === "verified" ? "verified" : "all";
}

function defaultReviewStatusForView(view: ViewerNavigationView): ViewerReviewStatusFilter {
  return view === "firehose" ? "all" : "active";
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

  if (filter === "active") {
    return memory.reviewStatus !== "rejected";
  }

  if (filter === "none") {
    return memory.reviewStatus === undefined;
  }

  return memory.reviewStatus === filter;
}

function matchesNavigationView(memory: ViewerMemory, view: ViewerNavigationView): boolean {
  if (view !== "inbox") {
    return true;
  }

  return memory.reviewStatus !== "rejected" && (
    memory.verificationStatus === "hypothesis" ||
    memory.reviewStatus === undefined ||
    memory.reviewStatus === "pending"
  );
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
