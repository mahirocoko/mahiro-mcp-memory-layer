import type {
  ListMemoriesInput,
  MemoryKind,
  MemoryRecord,
  MemoryReviewDecision,
  MemoryReviewHint,
  MemoryReviewStatus,
  MemoryScope,
  MemorySource,
  MemoryVerificationEvidence,
  MemoryVerificationStatus,
  PromoteMemoryInput,
  PromoteMemoryResult,
  PurgeRejectedMemoriesInput,
  PurgeRejectedMemoriesResult,
  ReviewAssistResult,
  ReviewAssistSuggestion,
  ReviewMemoryInput,
  ReviewMemoryResult,
  ReviewQueueOverviewItem,
  SearchMemoriesInput,
  SearchMemoriesResult,
} from "../memory/types.js";

export type ConsoleNavigationView = "verified" | "inbox" | "projects" | "firehose";
export type ConsoleScopeFilter = "all" | MemoryScope;
export type ConsoleKindFilter = "all" | MemoryKind;
export type ConsoleVerificationStatusFilter = "all" | MemoryVerificationStatus;
export type ConsoleReviewStatusFilter = "all" | "active" | "none" | MemoryReviewStatus;
export type ConsoleFetchMode = "list" | "search";
export type ConsoleRoute = "/" | "/review" | "/rejected" | "/graph";
export type ConsoleGraphEdgeTypeFilter = "all" | MemoryGraphEdgeType;

export interface ConsoleActionResult {
  readonly status: "accepted";
  readonly action: "review" | "promote" | "purge-rejected";
  readonly input: ConsoleReviewActionInput | ConsolePromoteActionInput | ConsolePurgeRejectedActionInput;
  readonly redirectTo: ConsoleRoute;
}

export interface ConsoleActionError {
  readonly status: "invalid";
  readonly action: "review" | "promote" | "purge-rejected";
  readonly message: string;
}

export type ConsoleReviewActionInput = ReviewMemoryInput;

export type ConsolePromoteActionInput = PromoteMemoryInput;

export type ConsolePurgeRejectedActionInput = PurgeRejectedMemoriesInput;

export type ConsolePurgeRejectedActionResult = PurgeRejectedMemoriesResult;

export interface ConsoleFilterState {
  readonly view: ConsoleNavigationView;
  readonly query?: string;
  readonly scope: ConsoleScopeFilter;
  readonly kind: ConsoleKindFilter;
  readonly verificationStatus: ConsoleVerificationStatusFilter;
  readonly reviewStatus: ConsoleReviewStatusFilter;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly selectedId?: string;
  readonly limit: number;
  readonly graphEdgeType?: ConsoleGraphEdgeTypeFilter;
}

export interface ConsoleMemory {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly scope?: MemoryScope;
  readonly verificationStatus: MemoryVerificationStatus;
  readonly reviewStatus?: MemoryReviewStatus;
  readonly reviewDecisions: readonly MemoryReviewDecision[];
  readonly verifiedAt?: string;
  readonly verificationEvidence: readonly MemoryVerificationEvidence[];
  readonly projectId?: string;
  readonly containerId?: string;
  readonly source: MemorySource;
  readonly content: string;
  readonly summary?: string;
  readonly tags: readonly string[];
  readonly importance: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly score?: number;
  readonly reasons: readonly string[];
}

export type ConsoleReviewStatusCountKey = "none" | MemoryReviewStatus;

export interface ConsoleProjectScopeSummary {
  readonly projectId: string;
  readonly containerId: string;
  readonly totalCount: number;
  readonly kindCounts: Readonly<Record<MemoryKind, number>>;
  readonly verificationStatusCounts: Readonly<Record<MemoryVerificationStatus, number>>;
  readonly reviewStatusCounts: Readonly<Record<ConsoleReviewStatusCountKey, number>>;
  readonly latestTimestamp?: string;
}

export interface ConsoleLoadResult {
  readonly filters: ConsoleFilterState;
  readonly memories: readonly ConsoleMemory[];
  readonly projectScopes: readonly ConsoleProjectScopeSummary[];
  readonly selectedMemory?: ConsoleMemory;
  readonly fetchedCount: number;
  readonly fetchMode: ConsoleFetchMode;
  readonly degraded: boolean;
  readonly refreshedAt: string;
}

export interface ConsoleReviewLoadResult {
  readonly filters: ConsoleFilterState;
  readonly reviewItems: readonly ReviewQueueOverviewItem[];
  readonly selectedReviewItem?: ReviewQueueOverviewItem;
  readonly reviewAssist?: ReviewAssistResult;
  readonly refreshedAt: string;
}

export interface ReadOnlyMemoryReader {
  readAll(): Promise<readonly MemoryRecord[]>;
  list(input: ListMemoriesInput): Promise<readonly MemoryRecord[]>;
  search(input: SearchMemoriesInput): Promise<SearchMemoriesResult>;
}

export interface MemoryConsoleReviewReader {
  listReviewQueueOverview(input: { readonly projectId?: string; readonly containerId?: string; readonly limit?: number }): Promise<readonly ReviewQueueOverviewItem[]>;
  getReviewAssist(input: { readonly id: string }): Promise<ReviewAssistResult>;
}

export interface MemoryConsoleActionWriter {
  reviewMemory(input: ReviewMemoryInput): Promise<ReviewMemoryResult>;
  promoteMemory(input: PromoteMemoryInput): Promise<PromoteMemoryResult>;
  purgeRejectedMemories(input: PurgeRejectedMemoriesInput): Promise<PurgeRejectedMemoriesResult>;
}

export type MemoryConsoleBackend = ReadOnlyMemoryReader & Partial<MemoryConsoleReviewReader> & Partial<MemoryConsoleActionWriter>;

export type MemoryGraphNodeType = "memory" | "source" | "tag" | "evidence";
export type MemoryGraphEdgeType = "has_source" | "tagged_with" | "has_evidence" | "reviewed_as" | "related_memory";
export type MemoryGraphWarningType = "missing_related_memory";
export type MemoryGraphRelationSource = "review_hint" | "review_assist_suggestion";
export type MemoryGraphInputMemory = MemoryRecord | ConsoleMemory;

export interface MemoryGraphNode {
  readonly id: string;
  readonly type: MemoryGraphNodeType;
  readonly label: string;
  readonly memoryId?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface MemoryGraphEdge {
  readonly id: string;
  readonly type: MemoryGraphEdgeType;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface MemoryGraphWarning {
  readonly type: MemoryGraphWarningType;
  readonly memoryId: string;
  readonly relatedMemoryId: string;
  readonly relationSource: MemoryGraphRelationSource;
  readonly relationType: string;
  readonly message: string;
}

export interface MemoryGraph {
  readonly nodes: readonly MemoryGraphNode[];
  readonly edges: readonly MemoryGraphEdge[];
  readonly warnings: readonly MemoryGraphWarning[];
}

export interface MemoryGraphRelatedInput {
  readonly memoryId: string;
  readonly hints?: readonly MemoryReviewHint[];
  readonly assistSuggestions?: readonly ReviewAssistSuggestion[];
}

export interface MemoryGraphBuildOptions {
  readonly related?: readonly MemoryGraphRelatedInput[];
}

export interface ConsoleGraphLoadResult extends ConsoleLoadResult {
  readonly graph: MemoryGraph;
  readonly selectedGraphNode?: MemoryGraphNode;
}
