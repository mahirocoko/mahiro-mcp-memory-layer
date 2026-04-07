import { mkdir } from "node:fs/promises";

import { getAppEnv } from "../../config/env.js";
import { JsonlLogStore } from "./log/jsonl-log-store.js";
import { DeterministicEmbeddingProvider } from "./index/embedding-provider.js";
import { connectToLanceDb } from "./index/lancedb-client.js";
import { MemoryRecordsTable } from "./index/memory-records-table.js";
import { RetrievalTraceStore } from "./observability/retrieval-trace.js";
import { buildContextForTask } from "./core/build-context-for-task.js";
import { listMemories } from "./core/list-memories.js";
import { rememberMemory } from "./core/remember.js";
import { searchMemories } from "./core/search-memories.js";
import { upsertDocument } from "./core/upsert-document.js";
import { reindexMemoryRecords } from "./index/reindex.js";
import type {
  BuildContextForTaskInput,
  BuildContextForTaskResult,
  ListMemoriesInput,
  MemoryRecord,
  RememberInput,
  SearchMemoriesInput,
  SearchMemoriesResult,
  UpsertDocumentInput,
} from "./types.js";

export class MemoryService {
  public static async create(): Promise<MemoryService> {
    const env = getAppEnv();
    await Promise.all([
      mkdir(env.dataPaths.logDirectory, { recursive: true }),
      mkdir(env.dataPaths.tracesDirectory, { recursive: true }),
      mkdir(env.dataPaths.lanceDbDirectory, { recursive: true }),
    ]);

    const logStore = new JsonlLogStore(env.dataPaths.canonicalLogFilePath);
    const embeddingProvider = new DeterministicEmbeddingProvider(env.embeddingDimensions);
    const connection = await connectToLanceDb(env.dataPaths.lanceDbDirectory);
    const table = new MemoryRecordsTable(connection);
    const traceStore = new RetrievalTraceStore(env.dataPaths.retrievalTraceFilePath);

    return new MemoryService(logStore, table, embeddingProvider, traceStore);
  }

  public constructor(
    private readonly logStore: JsonlLogStore,
    private readonly table: MemoryRecordsTable,
    private readonly embeddingProvider: DeterministicEmbeddingProvider,
    private readonly traceStore: RetrievalTraceStore,
  ) {}

  public remember(payload: RememberInput) {
    return rememberMemory({
      payload,
      logStore: this.logStore,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
    });
  }

  public search(payload: SearchMemoriesInput): Promise<SearchMemoriesResult> {
    return searchMemories({
      payload,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
      traceStore: this.traceStore,
    });
  }

  public buildContext(payload: BuildContextForTaskInput): Promise<BuildContextForTaskResult> {
    return buildContextForTask({
      payload,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
      traceStore: this.traceStore,
    });
  }

  public upsertDocument(payload: UpsertDocumentInput) {
    return upsertDocument({
      payload,
      logStore: this.logStore,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
    });
  }

  public list(payload: ListMemoriesInput): Promise<readonly MemoryRecord[]> {
    return listMemories({
      payload,
      logStore: this.logStore,
    });
  }

  public reindex(): Promise<void> {
    return reindexMemoryRecords({
      logStore: this.logStore,
      table: this.table,
      embeddingProvider: this.embeddingProvider,
    });
  }
}
