import { upsertDocumentInputSchema } from "../schemas.js";
import type { CanonicalLogStore } from "../log/canonical-log.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import type { MemoryRecord, MemorySource, UpsertDocumentInput } from "../types.js";
import { assertValidScope } from "../lib/scope.js";
import { nowIso } from "../lib/time.js";
import { toRetrievalRow } from "../retrieval/rank.js";
import { rememberMemory } from "./remember.js";

type UpsertPayload = UpsertDocumentInput;

function normStr(value: string | undefined): string {
  return value ?? "";
}

function scopeMatches(record: MemoryRecord, payload: UpsertPayload): boolean {
  const scope = payload.sessionId ? "session" : "project";

  return (
    record.scope === scope &&
    normStr(record.userId) === normStr(payload.userId) &&
    normStr(record.projectId) === normStr(payload.projectId) &&
    normStr(record.containerId) === normStr(payload.containerId) &&
    normStr(record.sessionId) === normStr(payload.sessionId)
  );
}

function sourceMatches(a: MemorySource, b: MemorySource): boolean {
  return a.type === b.type && normStr(a.uri) === normStr(b.uri) && normStr(a.title) === normStr(b.title);
}

function findLatestMatchingDoc(records: readonly MemoryRecord[], payload: UpsertPayload): MemoryRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];

    if (!record) {
      continue;
    }

    if (record.kind !== "doc") {
      continue;
    }

    if (!scopeMatches(record, payload)) {
      continue;
    }

    if (!sourceMatches(record.source, payload.source)) {
      continue;
    }

    return record;
  }

  return undefined;
}

export async function upsertDocument(input: {
  readonly payload: UpsertPayload;
  readonly logStore: CanonicalLogStore;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
}) {
  const payload = upsertDocumentInputSchema.parse(input.payload);
  const scope = payload.sessionId ? "session" : "project";

  assertValidScope({
    scope,
    userId: payload.userId,
    projectId: payload.projectId,
    containerId: payload.containerId,
    sessionId: payload.sessionId,
  });

  const existing = findLatestMatchingDoc(await input.logStore.readAll(), payload);

  if (existing) {
    const now = nowIso();
    const updated: MemoryRecord = {
      ...existing,
      content: payload.content,
      summary: payload.summary ?? existing.summary,
      tags: payload.tags ?? [...existing.tags],
      importance: payload.importance ?? existing.importance,
      updatedAt: now,
    };

    await input.logStore.replaceRecordById(existing.id, updated);
    await input.table.deleteRowsByIds([existing.id]);

    const embedding = await input.embeddingProvider.embedText(
      [updated.content, updated.summary ?? "", ...updated.tags].join("\n"),
    );

    await input.table.upsertRows([toRetrievalRow(updated, embedding, input.embeddingProvider.version)]);

    return {
      id: updated.id,
      status: "accepted" as const,
      indexed: true,
    };
  }

  return rememberMemory({
    payload: {
      content: payload.content,
      kind: "doc",
      scope,
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
