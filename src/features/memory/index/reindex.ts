import type { CanonicalLogStore } from "../log/canonical-log.js";
import type { MemoryRecord } from "../types.js";
import type { EmbeddingProvider } from "./embedding-provider.js";
import type { MemoryRecordsTable } from "./memory-records-table.js";

import { toRetrievalRow } from "../retrieval/rank.js";

export async function reindexMemoryRecords(input: {
  readonly logStore: CanonicalLogStore;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
}): Promise<void> {
  const records = await input.logStore.readAll();
  const rows = await Promise.all(records.map((record) => createRetrievalRow(record, input.embeddingProvider)));

  await input.table.replaceAll(rows);
}

async function createRetrievalRow(record: MemoryRecord, embeddingProvider: EmbeddingProvider) {
  const summary = record.summary ?? record.content;
  const embedding = await embeddingProvider.embedText([record.content, summary, ...record.tags].join("\n"));

  return toRetrievalRow(record, embedding, embeddingProvider.version);
}
