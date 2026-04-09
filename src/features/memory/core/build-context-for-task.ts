import { buildContextForTaskInputSchema } from "../schemas.js";
import { defaultContextMaxChars, defaultContextMaxItems } from "../constants.js";
import type { BuildContextForTaskInput, BuildContextForTaskResult } from "../types.js";
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
}): Promise<BuildContextForTaskResult> {
  const payload = buildContextForTaskInputSchema.parse(input.payload);
  const maxItems = payload.maxItems ?? defaultContextMaxItems;
  const basePayload = {
    query: payload.task,
    mode: payload.mode,
    userId: payload.userId,
    projectId: payload.projectId,
    containerId: payload.containerId,
  };

  if (!payload.sessionId) {
    const result = await searchMemories({
      payload: {
        ...basePayload,
        scope: "project",
        limit: maxItems,
      },
      table: input.table,
      embeddingProvider: input.embeddingProvider,
      traceStore: input.traceStore,
    });

    const built = buildContextFromItems({
      task: payload.task,
      mode: payload.mode,
      items: result.items,
      maxItems,
      maxChars: payload.maxChars ?? defaultContextMaxChars,
      degraded: result.degraded,
    });

    return attachMemorySuggestionsIfRequested(payload, built);
  }

  const sessionResult = await searchMemories({
    payload: {
      ...basePayload,
      scope: "session",
      sessionId: payload.sessionId,
      limit: maxItems,
    },
    table: input.table,
    embeddingProvider: input.embeddingProvider,
    traceStore: input.traceStore,
  });

  const seenIds = new Set(sessionResult.items.map((item) => item.id));
  const merged = [...sessionResult.items];
  let degraded = sessionResult.degraded;

  if (merged.length < maxItems) {
    const projectResult = await searchMemories({
      payload: {
        ...basePayload,
        scope: "project",
        limit: maxItems - merged.length,
      },
      table: input.table,
      embeddingProvider: input.embeddingProvider,
      traceStore: input.traceStore,
    });

    degraded = degraded || projectResult.degraded;

    for (const item of projectResult.items) {
      if (seenIds.has(item.id)) {
        continue;
      }
      seenIds.add(item.id);
      merged.push(item);
      if (merged.length >= maxItems) {
        break;
      }
    }
  }

  const base = buildContextFromItems({
    task: payload.task,
    mode: payload.mode,
    items: merged,
    maxItems,
    maxChars: payload.maxChars ?? defaultContextMaxChars,
    degraded,
  });

  return attachMemorySuggestionsIfRequested(payload, base);
}

function attachMemorySuggestionsIfRequested(
  payload: {
    readonly includeMemorySuggestions?: boolean;
    readonly recentConversation?: string;
    readonly userId?: string;
    readonly projectId?: string;
    readonly containerId?: string;
    readonly sessionId?: string;
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
    userId: payload.userId,
    projectId: payload.projectId,
    containerId: payload.containerId,
    sessionId: payload.sessionId,
    maxCandidates: payload.suggestionMaxCandidates,
  });

  return {
    ...base,
    memorySuggestions,
  };
}
