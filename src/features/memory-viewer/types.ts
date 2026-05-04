import type {
  ListMemoriesInput,
  MemoryKind,
  MemoryRecord,
  MemoryReviewDecision,
  MemoryReviewStatus,
  MemoryScope,
  MemorySource,
  MemoryVerificationEvidence,
  MemoryVerificationStatus,
  SearchMemoriesInput,
  SearchMemoriesResult,
} from "../memory/types.js";

export type ViewerScopeFilter = "all" | MemoryScope;
export type ViewerKindFilter = "all" | MemoryKind;
export type ViewerVerificationStatusFilter = "all" | MemoryVerificationStatus;
export type ViewerReviewStatusFilter = "all" | "none" | MemoryReviewStatus;
export type ViewerFetchMode = "list" | "search";

export interface ViewerFilterState {
  readonly query?: string;
  readonly scope: ViewerScopeFilter;
  readonly kind: ViewerKindFilter;
  readonly verificationStatus: ViewerVerificationStatusFilter;
  readonly reviewStatus: ViewerReviewStatusFilter;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly selectedId?: string;
  readonly limit: number;
}

export interface ViewerMemory {
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

export interface ViewerLoadResult {
  readonly filters: ViewerFilterState;
  readonly memories: readonly ViewerMemory[];
  readonly selectedMemory?: ViewerMemory;
  readonly fetchedCount: number;
  readonly fetchMode: ViewerFetchMode;
  readonly degraded: boolean;
  readonly refreshedAt: string;
}

export interface ReadOnlyMemoryReader {
  list(input: ListMemoriesInput): Promise<readonly MemoryRecord[]>;
  search(input: SearchMemoriesInput): Promise<SearchMemoriesResult>;
}
