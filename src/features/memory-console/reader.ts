import { getAppEnv } from "../../config/env.js";
import { MemoryService } from "../memory/memory-service.js";
import { listMemories } from "../memory/core/list-memories.js";
import { searchMemories } from "../memory/core/search-memories.js";
import { DeterministicEmbeddingProvider } from "../memory/index/embedding-provider.js";
import { connectToLanceDb } from "../memory/index/lancedb-client.js";
import { MemoryRecordsTable } from "../memory/index/memory-records-table.js";
import { JsonlLogStore } from "../memory/log/jsonl-log-store.js";
import { RetrievalTraceStore } from "../memory/observability/retrieval-trace.js";
import type { MemoryConsoleBackend, ReadOnlyMemoryReader } from "./types.js";

export async function createLocalMemoryConsoleBackend(): Promise<MemoryConsoleBackend> {
  const env = getAppEnv();
  const logStore = new JsonlLogStore(env.dataPaths.canonicalLogFilePath);
  const embeddingProvider = new DeterministicEmbeddingProvider(env.embeddingDimensions);
  const connection = await connectToLanceDb(env.dataPaths.lanceDbDirectory);
  const table = new MemoryRecordsTable(connection);
  const traceStore = new RetrievalTraceStore(env.dataPaths.retrievalTraceFilePath);
  const service = new MemoryService(logStore, table, embeddingProvider, traceStore);
  const readOnlyReader: ReadOnlyMemoryReader = {
    readAll: () => logStore.readAll(),
    list: (payload) => listMemories({ payload, logStore }),
    search: (payload) => searchMemories({
      payload,
      table,
      embeddingProvider,
      traceStore,
      traceProvenance: {
        surface: "tool",
        trigger: "memory_console",
        phase: "search",
      },
    }),
  };

  return createMemoryConsoleBackend(readOnlyReader, service);
}

export function createMemoryConsoleBackend(
  reader: ReadOnlyMemoryReader,
  service: Pick<MemoryService, "listReviewQueueOverview" | "getReviewAssist" | "reviewMemory" | "promoteMemory" | "purgeRejectedMemories">,
): MemoryConsoleBackend {
  return {
    ...reader,
    listReviewQueueOverview: (payload) => service.listReviewQueueOverview(payload),
    getReviewAssist: (payload) => service.getReviewAssist(payload),
    reviewMemory: (payload) => service.reviewMemory(payload),
    promoteMemory: (payload) => service.promoteMemory(payload),
    purgeRejectedMemories: (payload) => service.purgeRejectedMemories(payload),
  };
}

export async function createLocalReadOnlyMemoryReader(): Promise<ReadOnlyMemoryReader> {
  return createLocalMemoryConsoleBackend();
}
