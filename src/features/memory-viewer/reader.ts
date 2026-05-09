import { getAppEnv } from "../../config/env.js";
import { listMemories } from "../memory/core/list-memories.js";
import { searchMemories } from "../memory/core/search-memories.js";
import { DeterministicEmbeddingProvider } from "../memory/index/embedding-provider.js";
import { connectToLanceDb } from "../memory/index/lancedb-client.js";
import { MemoryRecordsTable } from "../memory/index/memory-records-table.js";
import { JsonlLogStore } from "../memory/log/jsonl-log-store.js";
import type { ReadOnlyMemoryReader } from "./types.js";

export async function createLocalReadOnlyMemoryReader(): Promise<ReadOnlyMemoryReader> {
  const env = getAppEnv();
  const logStore = new JsonlLogStore(env.dataPaths.canonicalLogFilePath);
  const embeddingProvider = new DeterministicEmbeddingProvider(env.embeddingDimensions);
  const connection = await connectToLanceDb(env.dataPaths.lanceDbDirectory);
  const table = new MemoryRecordsTable(connection);

  return {
    readAll: () => logStore.readAll(),
    list: (payload) => listMemories({ payload, logStore }),
    search: (payload) => searchMemories({
      payload,
      table,
      embeddingProvider,
      traceProvenance: {
        surface: "tool",
        trigger: "memory_viewer",
        phase: "search",
      },
    }),
  };
}
