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
  };

  const scopedResults = await searchContextScopes({
    basePayload,
    projectId: payload.projectId,
    containerId: payload.containerId,
    maxItems,
    table: input.table,
    embeddingProvider: input.embeddingProvider,
    traceStore: input.traceStore,
    traceProvenance: input.traceProvenance,
  });
  const items = mergeContextItems(scopedResults.flatMap((result) => result.items), maxItems);
  const degraded = scopedResults.some((result) => result.degraded);

  const base = buildContextFromItems({
    task: payload.task,
    mode: payload.mode,
    items,
    maxItems,
    maxChars: payload.maxChars ?? defaultContextMaxChars,
    degraded,
  });

  return attachMemorySuggestionsIfRequested(payload, base);
}

async function searchContextScopes(input: {
  readonly basePayload: { readonly query: string; readonly mode: BuildContextForTaskInput["mode"] };
  readonly projectId?: string;
  readonly containerId?: string;
  readonly maxItems: number;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
  readonly traceStore: RetrievalTraceStore;
  readonly traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">;
}) {
  if (input.projectId || input.containerId) {
    const globalResult = await searchMemories({
      payload: {
        ...input.basePayload,
        scope: "global",
        limit: input.maxItems,
      },
      table: input.table,
      embeddingProvider: input.embeddingProvider,
      traceStore: input.traceStore,
      traceProvenance: input.traceProvenance,
    });
    const projectResult = await searchMemories({
      payload: {
        ...input.basePayload,
        scope: "project",
        projectId: input.projectId,
        containerId: input.containerId,
        limit: input.maxItems,
      },
      table: input.table,
      embeddingProvider: input.embeddingProvider,
      traceStore: input.traceStore,
      traceProvenance: input.traceProvenance,
    });

    return [
      projectResult,
      { ...globalResult, items: globalResult.items.filter((item) => item.verificationStatus === "verified") },
    ];
  }

  return [await searchMemories({
    payload: {
      ...input.basePayload,
      scope: "global",
      limit: input.maxItems,
    },
    table: input.table,
    embeddingProvider: input.embeddingProvider,
    traceStore: input.traceStore,
    traceProvenance: input.traceProvenance,
  })];
}

function mergeContextItems<T extends { readonly id: string }>(items: readonly T[], maxItems: number): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
    if (merged.length >= maxItems) {
      break;
    }
  }

  return merged;
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
