import type { Connection, Table } from "@lancedb/lancedb";

import { retrievalRowSchema } from "../schemas.js";
import type { RetrievalRow, ScopeFilter } from "../types.js";
import { extractLexicalTokensForCandidateQuery } from "../lib/lexical-tokens.js";

const tableName = "memory_records";

export class MemoryRecordsTable {
  public constructor(private readonly connection: Connection) {}

  public async deleteRowsByIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const table = await this.tryOpenTable();

    if (!table) {
      return;
    }

    const clause = ids.map((id) => `id = '${escapeSqlPredicateValue(id)}'`).join(" OR ");
    await table.delete(`(${clause})`);
  }

  public async upsertRows(rows: readonly RetrievalRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const databaseRows = rows.map((row) => toDatabaseRow(row));
    const existingTable = await this.tryOpenTable();

    if (!existingTable) {
      await this.connection.createTable(tableName, databaseRows);
      return;
    }

    await existingTable.add(databaseRows);
  }

  public async replaceAll(rows: readonly RetrievalRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await this.connection.createTable(tableName, rows.map((row) => toDatabaseRow(row)), { mode: "overwrite" });
  }

  public async queryScopedRows(filter: ScopeFilter, limit?: number): Promise<readonly RetrievalRow[]> {
    const table = await this.tryOpenTable();

    if (!table) {
      return [];
    }

    const rows = await table.query().toArray();

    const scopedRows = rows.flatMap((row) => {
      const parsed = toRetrievalRow(row);
      return parsed && matchesScopeFilter(parsed, filter) ? [parsed] : [];
    });

    return typeof limit === "number" ? scopedRows.slice(0, limit) : scopedRows;
  }

  /**
   * Rows in scope where at least one significant query token appears in content, summary, or tags
   * (DataFusion `strpos` on lowercased columns). Run together with a capped {@link queryScopedRows}
   * pass so lexical hits are not dropped when the scoped table is larger than the baseline limit.
   */
  public async queryScopedLexicalCandidates(
    filter: ScopeFilter,
    query: string,
    limit: number,
  ): Promise<readonly RetrievalRow[]> {
    const tokens = extractLexicalTokensForCandidateQuery(query);

    if (tokens.length === 0) {
      return [];
    }

    const table = await this.tryOpenTable();

    if (!table) {
      return [];
    }

    try {
      const rows = await table.query().toArray();

      return rows.flatMap((row) => {
        const parsed = toRetrievalRow(row);
        if (!parsed || !matchesScopeFilter(parsed, filter)) {
          return [];
        }

        return matchesLexicalCandidate(parsed, tokens) ? [parsed] : [];
      }).slice(0, limit);
    } catch {
      return [];
    }
  }

  public async vectorSearch(filter: ScopeFilter, queryVector: readonly number[], limit: number): Promise<readonly RetrievalRow[]> {
    const table = await this.tryOpenTable();

    if (!table) {
      return [];
    }

    const rows = await table
      .search([...queryVector])
      .limit(Math.max(limit * 16, 100))
      .toArray();

    return rows.flatMap((row) => {
      const parsed = toRetrievalRow(row);
      return parsed && matchesScopeFilter(parsed, filter) ? [parsed] : [];
    }).slice(0, limit);
  }

  private async tryOpenTable(): Promise<Table | null> {
    try {
      return await this.connection.openTable(tableName);
    } catch {
      return null;
    }
  }
}

function escapeSqlPredicateValue(value: string): string {
  return value.replaceAll("'", "''");
}

function matchesScopeFilter(row: RetrievalRow, filter: ScopeFilter): boolean {
  return row.scope === filter.scope
    && (!filter.projectId || row.projectId === filter.projectId)
    && (!filter.containerId || row.containerId === filter.containerId);
}

function matchesLexicalCandidate(row: RetrievalRow, tokens: readonly string[]): boolean {
  const haystack = `${row.content}\n${row.summary}\n${row.tags}`.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function toDatabaseRow(row: RetrievalRow): Record<string, unknown> {
  return {
    id: row.id,
    content: row.content,
    summary: row.summary,
    embedding: [...row.embedding],
    kind: row.kind,
    scope: row.scope,
    verification_status: row.verificationStatus,
    review_status: row.reviewStatus,
    review_decisions: row.reviewDecisions,
    verified_at: row.verifiedAt,
    verification_evidence: row.verificationEvidence,
    project_id: row.projectId,
    container_id: row.containerId,
    importance: row.importance,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    source_type: row.sourceType,
    source_uri: row.sourceUri,
    source_title: row.sourceTitle,
    tags: row.tags,
    embedding_version: row.embeddingVersion,
    index_version: row.indexVersion,
  };
}

function toRetrievalRow(input: Record<string, unknown>): RetrievalRow | null {
  if (
    "user_id" in input ||
    "userId" in input ||
    "session_id" in input ||
    "sessionId" in input
  ) {
    return null;
  }

  const parsed = retrievalRowSchema.safeParse({
    ...input,
    embedding: normalizeEmbedding(input.embedding),
  });

  if (!parsed.success) {
    return null;
  }

  const row = parsed.data;

  return {
    id: row.id,
    content: row.content,
    summary: row.summary,
    embedding: row.embedding,
    kind: row.kind,
    scope: row.scope,
    verificationStatus: row.verification_status ?? row.verificationStatus ?? "hypothesis",
    reviewStatus: row.review_status ?? row.reviewStatus ?? "pending",
    reviewDecisions: row.review_decisions ?? row.reviewDecisions ?? "[]",
    verifiedAt: row.verified_at ?? row.verifiedAt ?? "",
    verificationEvidence: row.verification_evidence ?? row.verificationEvidence ?? "[]",
    projectId: row.project_id ?? row.projectId ?? "",
    containerId: row.container_id ?? row.containerId ?? "",
    importance: row.importance,
    createdAt: row.created_at ?? row.createdAt ?? "",
    updatedAt: row.updated_at ?? row.updatedAt ?? "",
    sourceType: row.source_type ?? row.sourceType ?? "",
    sourceUri: row.source_uri ?? row.sourceUri ?? "",
    sourceTitle: row.source_title ?? row.sourceTitle ?? "",
    tags: row.tags,
    embeddingVersion: row.embedding_version ?? row.embeddingVersion ?? "",
    indexVersion: row.index_version ?? row.indexVersion ?? "",
  };
}

function normalizeEmbedding(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }

  if (value && typeof value === "object" && Symbol.iterator in value) {
    return Array.from(value as Iterable<unknown>, (item) => Number(item));
  }

  return [];
}
