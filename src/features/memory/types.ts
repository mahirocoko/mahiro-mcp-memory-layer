import type { memoryKinds, memoryScopes, retrievalModes } from "./constants.js";

export type MemoryKind = (typeof memoryKinds)[number];
export type MemoryScope = (typeof memoryScopes)[number];
export type RetrievalMode = (typeof retrievalModes)[number];

export interface MemorySource {
  readonly type: "manual" | "chat" | "tool" | "document" | "system";
  readonly uri?: string;
  readonly title?: string;
}

export interface MemoryRecord {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly scope: MemoryScope;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly source: MemorySource;
  readonly content: string;
  readonly summary?: string;
  readonly tags: readonly string[];
  readonly importance: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface RememberInput {
  readonly content: string;
  readonly kind: MemoryKind;
  readonly scope: MemoryScope;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly source: MemorySource;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly importance?: number;
}

export interface SearchMemoriesInput {
  readonly query: string;
  readonly mode: RetrievalMode;
  readonly scope: MemoryScope;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly limit?: number;
}

export interface SearchMemoryItem {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly summary?: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly createdAt: string;
  readonly importance: number;
  readonly source: MemorySource;
}

export interface SearchMemoriesResult {
  readonly items: readonly SearchMemoryItem[];
  readonly degraded: boolean;
}

export interface RetrievalTraceProvenance {
  readonly surface: "tool" | "memory-facade" | "opencode-plugin" | "eval";
  readonly trigger: string;
  readonly phase: string;
  readonly searchScope?: MemoryScope;
}

export interface BuildContextForTaskInput {
  readonly task: string;
  readonly mode: RetrievalMode;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly maxItems?: number;
  readonly maxChars?: number;
  /** Opt-in: attach `suggest_memory_candidates` output for the same scope as this build. */
  readonly includeMemorySuggestions?: boolean;
  readonly recentConversation?: string;
  readonly suggestionMaxCandidates?: number;
}

export interface BuildContextForTaskResult {
  readonly context: string;
  readonly items: readonly string[];
  readonly truncated: boolean;
  readonly degraded: boolean;
  /** Present when `includeMemorySuggestions` was true and validation passed. */
  readonly memorySuggestions?: SuggestMemoryCandidatesResult;
}

export interface UpsertDocumentInput {
  readonly projectId?: string;
  readonly userId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly source: MemorySource;
  readonly content: string;
  readonly tags?: readonly string[];
  readonly summary?: string;
  readonly importance?: number;
}

export interface ListMemoriesInput {
  readonly scope?: MemoryScope;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly kind?: MemoryKind;
  readonly limit?: number;
}

export type MemorySuggestionConfidence = "low" | "medium" | "high";

export type MemorySaveRecommendation = "likely_skip" | "consider_saving" | "strong_candidate";

export interface SuggestMemoryCandidatesInput {
  readonly conversation: string;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly maxCandidates?: number;
}

export interface MemorySuggestionCandidate {
  readonly kind: MemoryKind;
  readonly scope: MemoryScope;
  readonly reason: string;
  readonly draftContent: string;
  readonly confidence: MemorySuggestionConfidence;
}

export interface SuggestMemoryCandidatesResult {
  readonly recommendation: MemorySaveRecommendation;
  readonly signals: {
    readonly durable: readonly string[];
    readonly ephemeral: readonly string[];
  };
  readonly candidates: readonly MemorySuggestionCandidate[];
}

/** Input for `apply_conservative_memory_policy`: same scope fields as suggest, plus optional precomputed suggestion. */
export interface ApplyConservativeMemoryPolicyInput {
  /** Required unless `suggestion` is provided (hosts may reuse a prior `suggest_memory_candidates` result). */
  readonly conversation?: string;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly maxCandidates?: number;
  /** When set, heuristics are skipped and policy applies to this snapshot. */
  readonly suggestion?: SuggestMemoryCandidatesResult;
  /** Overrides default `{ type: "tool", title: "apply_conservative_memory_policy" }` on auto-saved memories. */
  readonly sourceOverride?: MemorySource;
  /** Appended to default tags on auto-saved memories (`conservative_auto_save`). */
  readonly extraTags?: readonly string[];
}

/** Result: conservative policy — auto-save only on `strong_candidate` with complete scope ids; `consider_saving` is review-only. */
export interface ApplyConservativeMemoryPolicyResult {
  readonly recommendation: MemorySaveRecommendation;
  readonly signals: SuggestMemoryCandidatesResult["signals"];
  readonly candidates: readonly MemorySuggestionCandidate[];
  readonly autoSaved: readonly { readonly candidateIndex: number; readonly id: string }[];
  readonly autoSaveSkipped: readonly { readonly candidateIndex: number; readonly reason: "incomplete_scope_ids" }[];
  readonly reviewOnlySuggestions: readonly MemorySuggestionCandidate[];
}

/** Input for `prepare_host_turn_memory`: task + retrieval scope + `recentConversation`; optional policy tags/source for auto-saves. */
export interface PrepareHostTurnMemoryInput
  extends Omit<BuildContextForTaskInput, "includeMemorySuggestions"> {
  readonly recentConversation: string;
  readonly sourceOverride?: MemorySource;
  readonly extraTags?: readonly string[];
}

/** Result: built context bundle + suggestion snapshot + conservative policy outcome (policy uses `memorySuggestions` as `suggestion`, so heuristics run once). */
export interface PrepareHostTurnMemoryResult extends BuildContextForTaskResult {
  readonly memorySuggestions: SuggestMemoryCandidatesResult;
  readonly conservativePolicy: ApplyConservativeMemoryPolicyResult;
}

/** Product alias for `prepare_host_turn_memory` (identical inputs and behavior). */
export type PrepareTurnMemoryInput = PrepareHostTurnMemoryInput;
/** Product alias for `prepare_host_turn_memory` (identical inputs and behavior). */
export type PrepareTurnMemoryResult = PrepareHostTurnMemoryResult;

/** Input for `wake_up_memory`: session-start retrieval bundle with stable profile + recent activity sections for the same scope. */
export interface WakeUpMemoryInput {
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  /** Applied per section (`profile` and `recent`). */
  readonly maxItems?: number;
  /** Applied per section (`profile` and `recent`). */
  readonly maxChars?: number;
}

/** Combined profile + recent retrieval for one scope; `profile` / `recent` mirror two `build_context_for_task` calls. */
export interface WakeUpMemoryResult {
  /** Convenience string: `profile.context` and `recent.context` separated by a fixed divider. */
  readonly wakeUpContext: string;
  readonly profile: BuildContextForTaskResult;
  readonly recent: BuildContextForTaskResult;
  readonly truncated: boolean;
  readonly degraded: boolean;
}

export interface ScopeFilter {
  readonly scope: MemoryScope;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
}

export interface RetrievalRow {
  readonly id: string;
  readonly content: string;
  readonly summary: string;
  readonly embedding: readonly number[];
  readonly kind: MemoryKind;
  readonly scope: MemoryScope;
  readonly userId: string;
  readonly projectId: string;
  readonly containerId: string;
  readonly sessionId: string;
  readonly importance: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sourceType: string;
  readonly sourceUri: string;
  readonly sourceTitle: string;
  readonly tags: string;
  readonly embeddingVersion: string;
  readonly indexVersion: string;
}

export interface RetrievalTraceEntry {
  readonly requestId: string;
  readonly query: string;
  readonly retrievalMode: RetrievalMode;
  readonly enforcedFilters: ScopeFilter;
  readonly provenance?: RetrievalTraceProvenance;
  readonly returnedMemoryIds: readonly string[];
  readonly rankingReasonsById: Record<string, readonly string[]>;
  readonly contextSize: number;
  readonly embeddingVersion: string;
  readonly indexVersion: string;
  readonly degraded: boolean;
  readonly createdAt: string;
}

export interface InspectMemoryRetrievalInput {
  readonly requestId?: string;
  /**
   * Internal/plugin-side hint for resolving the latest retrieval trace relative to a live scope
   * instead of the global latest trace across every workspace.
   */
  readonly latestScopeFilter?: {
    readonly userId?: string;
    readonly projectId?: string;
    readonly containerId?: string;
    readonly sessionId?: string;
  };
}

export interface InspectMemoryRetrievalFoundResult {
  readonly status: "found";
  readonly lookup: "latest" | "request_id";
  readonly trace: RetrievalTraceEntry;
  readonly summary: {
    readonly hit: boolean;
    readonly returnedCount: number;
    readonly degraded: boolean;
  };
}

export interface InspectMemoryRetrievalEmptyResult {
  readonly status: "empty";
  readonly lookup: "latest" | "request_id";
  readonly requestId?: string;
}

export type InspectMemoryRetrievalResult =
  | InspectMemoryRetrievalFoundResult
  | InspectMemoryRetrievalEmptyResult;
