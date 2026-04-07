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

export interface BuildContextForTaskInput {
  readonly task: string;
  readonly mode: RetrievalMode;
  readonly userId?: string;
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
  readonly maxItems?: number;
  readonly maxChars?: number;
}

export interface BuildContextForTaskResult {
  readonly context: string;
  readonly items: readonly string[];
  readonly truncated: boolean;
  readonly degraded: boolean;
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
  readonly returnedMemoryIds: readonly string[];
  readonly rankingReasonsById: Record<string, readonly string[]>;
  readonly contextSize: number;
  readonly embeddingVersion: string;
  readonly indexVersion: string;
  readonly degraded: boolean;
  readonly createdAt: string;
}
