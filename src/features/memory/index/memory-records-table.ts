import type { Connection, Table } from "@lancedb/lancedb";

import type { RetrievalRow, ScopeFilter } from "../types.js";
import { extractLexicalTokensForCandidateQuery } from "../lib/lexical-tokens.js";
import { toSqlScopeWhereClause } from "../lib/scope.js";

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

    const query = table.query().where(toSqlScopeWhereClause(filter));

    const rows = await (typeof limit === "number" ? query.limit(limit) : query).toArray();

    return rows.map((row) => toRetrievalRow(row));
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

    const tokenClause = tokens
      .map((token) => {
        const literal = escapeSqlPredicateValue(token);

        return `(strpos(lower(content), '${literal}') > 0 OR strpos(lower(summary), '${literal}') > 0 OR strpos(lower(tags), '${literal}') > 0)`;
      })
      .join(" OR ");

    try {
      const rows = await table
        .query()
        .where(`${toSqlScopeWhereClause(filter)} AND (${tokenClause})`)
        .limit(limit)
        .toArray();

      return rows.map((row) => toRetrievalRow(row));
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
      .where(toSqlScopeWhereClause(filter))
      .limit(limit)
      .toArray();

    return rows.map((row) => toRetrievalRow(row));
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

function toDatabaseRow(row: RetrievalRow): Record<string, unknown> {
  return {
    id: row.id,
    content: row.content,
    summary: row.summary,
    embedding: [...row.embedding],
    kind: row.kind,
    scope: row.scope,
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

function toRetrievalRow(input: Record<string, unknown>): RetrievalRow {
  return {
    id: String(input.id ?? ""),
    content: String(input.content ?? ""),
    summary: String(input.summary ?? ""),
    embedding: Array.isArray(input.embedding) ? input.embedding.map((value) => Number(value)) : [],
    kind: String(input.kind ?? "fact") as RetrievalRow["kind"],
    scope: String(input.scope ?? "global") as RetrievalRow["scope"],
    projectId: String(input.project_id ?? input.projectId ?? ""),
    containerId: String(input.container_id ?? input.containerId ?? ""),
    importance: Number(input.importance ?? 0),
    createdAt: String(input.created_at ?? input.createdAt ?? ""),
    updatedAt: String(input.updated_at ?? input.updatedAt ?? ""),
    sourceType: String(input.source_type ?? input.sourceType ?? ""),
    sourceUri: String(input.source_uri ?? input.sourceUri ?? ""),
    sourceTitle: String(input.source_title ?? input.sourceTitle ?? ""),
    tags: String(input.tags ?? "[]"),
    embeddingVersion: String(input.embedding_version ?? input.embeddingVersion ?? ""),
    indexVersion: String(input.index_version ?? input.indexVersion ?? ""),
  };
}
