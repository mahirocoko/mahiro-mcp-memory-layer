import { upsertDocumentInputSchema } from "../schemas.js";
import type { CanonicalLogStore } from "../log/canonical-log.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import { rememberMemory } from "./remember.js";

export async function upsertDocument(input: {
  readonly payload: Parameters<typeof upsertDocumentInputSchema.parse>[0];
  readonly logStore: CanonicalLogStore;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
}) {
  const payload = upsertDocumentInputSchema.parse(input.payload);

  return rememberMemory({
    payload: {
      content: payload.content,
      kind: "doc",
      scope: payload.sessionId ? "session" : "project",
      userId: payload.userId,
      projectId: payload.projectId,
      containerId: payload.containerId,
      sessionId: payload.sessionId,
      source: payload.source,
      summary: payload.summary,
      tags: payload.tags,
      importance: payload.importance ?? 0.6,
    },
    logStore: input.logStore,
    table: input.table,
    embeddingProvider: input.embeddingProvider,
  });
}
