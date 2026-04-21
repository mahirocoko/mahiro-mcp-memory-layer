import { rememberInputSchema } from "../schemas.js";
import type { CanonicalLogStore } from "../log/canonical-log.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import type { MemoryRecord, RememberInput } from "../types.js";
import { newId } from "../../../lib/ids.js";
import { assertValidScope } from "../lib/scope.js";
import { nowIso } from "../lib/time.js";
import { toRetrievalRow } from "../retrieval/rank.js";

export async function rememberMemory(input: {
  readonly payload: RememberInput;
  readonly logStore: CanonicalLogStore;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
}): Promise<{ readonly id: string; readonly status: "accepted"; readonly indexed: boolean }> {
  const payload = rememberInputSchema.parse(input.payload);
  assertValidScope({
    scope: payload.scope,
    projectId: payload.projectId,
    containerId: payload.containerId,
  });

  const now = nowIso();
  const record: MemoryRecord = {
    id: newId("mem"),
    kind: payload.kind,
    scope: payload.scope,
    projectId: payload.projectId,
    containerId: payload.containerId,
    source: payload.source,
    content: payload.content,
    summary: payload.summary,
    tags: payload.tags ?? [],
    importance: payload.importance ?? 0.5,
    createdAt: now,
    updatedAt: now,
  };

  await input.logStore.append(record);

  const embedding = await input.embeddingProvider.embedText([record.content, record.summary ?? "", ...record.tags].join("\n"));

  await input.table.upsertRows([toRetrievalRow(record, embedding, input.embeddingProvider.version)]);

  return {
    id: record.id,
    status: "accepted",
    indexed: true,
  };
}
