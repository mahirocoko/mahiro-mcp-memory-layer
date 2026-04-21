import { searchMemoriesInputSchema } from "../schemas.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import type { RetrievalTraceStore } from "../observability/retrieval-trace.js";
import type { RetrievalTraceProvenance, SearchMemoriesInput, SearchMemoriesResult } from "../types.js";
import { toScopeFilter } from "../lib/scope.js";
import { runHybridSearch } from "../retrieval/hybrid-search.js";

export async function searchMemories(input: {
  readonly payload: SearchMemoriesInput;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
  readonly traceStore: RetrievalTraceStore;
  readonly traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">;
}): Promise<SearchMemoriesResult> {
  const payload = searchMemoriesInputSchema.parse(input.payload);
  const filter = toScopeFilter({
    scope: payload.scope,
    projectId: payload.projectId,
    containerId: payload.containerId,
  });
  const { result, trace } = await runHybridSearch({
    search: payload,
    filter,
    table: input.table,
    embeddingProvider: input.embeddingProvider,
    ...(input.traceProvenance
      ? {
          traceProvenance: {
            ...input.traceProvenance,
            searchScope: payload.scope,
          },
        }
      : {}),
  });

  await input.traceStore.append(trace);

  return result;
}
