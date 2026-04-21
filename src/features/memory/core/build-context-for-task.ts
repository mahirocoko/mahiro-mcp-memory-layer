import { buildContextForTaskInputSchema } from "../schemas.js";
import { defaultContextMaxChars, defaultContextMaxItems } from "../constants.js";
import type { BuildContextForTaskInput, BuildContextForTaskResult, RetrievalTraceProvenance } from "../types.js";
import { buildContextFromItems } from "../retrieval/context-builder.js";
import { searchMemories } from "./search-memories.js";
import { suggestMemoryCandidates } from "./suggest-memory-candidates.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import type { RetrievalTraceStore } from "../observability/retrieval-trace.js";

export async function buildContextForTask(input: {
  readonly payload: BuildContextForTaskInput;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
  readonly traceStore: RetrievalTraceStore;
  readonly traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">;
}): Promise<BuildContextForTaskResult> {
  const payload = buildContextForTaskInputSchema.parse(input.payload);
  const maxItems = payload.maxItems ?? defaultContextMaxItems;
  const basePayload = {
    query: payload.task,
    mode: payload.mode,
    projectId: payload.projectId,
    containerId: payload.containerId,
  };

  const scope = payload.projectId || payload.containerId ? "project" : "global";
  const result = await searchMemories({
    payload: {
      ...basePayload,
      scope,
      limit: maxItems,
    },
    table: input.table,
    embeddingProvider: input.embeddingProvider,
    traceStore: input.traceStore,
    traceProvenance: input.traceProvenance,
  });

  const base = buildContextFromItems({
    task: payload.task,
    mode: payload.mode,
    items: result.items,
    maxItems,
    maxChars: payload.maxChars ?? defaultContextMaxChars,
    degraded: result.degraded,
  });

  return attachMemorySuggestionsIfRequested(payload, base);
}

function attachMemorySuggestionsIfRequested(
  payload: {
    readonly includeMemorySuggestions?: boolean;
    readonly recentConversation?: string;
    readonly projectId?: string;
    readonly containerId?: string;
    readonly suggestionMaxCandidates?: number;
  },
  base: BuildContextForTaskResult,
): BuildContextForTaskResult {
  if (payload.includeMemorySuggestions !== true) {
    return base;
  }

  const conversation = payload.recentConversation!.trim();
  const memorySuggestions = suggestMemoryCandidates({
    conversation,
    projectId: payload.projectId,
    containerId: payload.containerId,
    maxCandidates: payload.suggestionMaxCandidates,
  });

  return {
    ...base,
    memorySuggestions,
  };
}
