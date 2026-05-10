import { canonicalizeStoredContainerId } from "../lib/scope-identity.js";
import type { CanonicalLogStore } from "../log/canonical-log.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import type { MemoryRecord } from "../types.js";
import { reindexMemoryRecords } from "../index/reindex.js";

export interface ScopeIdentityRewriteChange {
  readonly id: string;
  readonly projectId?: string;
  readonly fromContainerId?: string;
  readonly toContainerId?: string;
}

export interface RewriteScopeIdentityResult {
  readonly status: "dry_run" | "applied";
  readonly scannedRecords: number;
  readonly changedRecords: number;
  readonly changes: readonly ScopeIdentityRewriteChange[];
  readonly reindexed: boolean;
}

export async function rewriteScopeIdentity(input: {
  readonly apply: boolean;
  readonly logStore: CanonicalLogStore;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
}): Promise<RewriteScopeIdentityResult> {
  const records = await input.logStore.readAll();
  const { records: rewrittenRecords, changes } = rewriteScopeIdentityRecords(records);

  if (input.apply && changes.length > 0) {
    await input.logStore.replaceAll(rewrittenRecords);
    await reindexMemoryRecords({
      logStore: input.logStore,
      table: input.table,
      embeddingProvider: input.embeddingProvider,
    });
  }

  return {
    status: input.apply ? "applied" : "dry_run",
    scannedRecords: records.length,
    changedRecords: changes.length,
    changes,
    reindexed: input.apply && changes.length > 0,
  };
}

export function rewriteScopeIdentityRecords(records: readonly MemoryRecord[]): {
  readonly records: readonly MemoryRecord[];
  readonly changes: readonly ScopeIdentityRewriteChange[];
} {
  const changes: ScopeIdentityRewriteChange[] = [];
  const rewrittenRecords = records.map((record) => {
    if (record.scope === "global") {
      if (!record.projectId && !record.containerId) {
        return record;
      }

      changes.push({
        id: record.id,
        projectId: record.projectId,
        fromContainerId: record.containerId,
        toContainerId: undefined,
      });

      const { projectId: _projectId, containerId: _containerId, ...globalRecord } = record;
      void _projectId;
      void _containerId;
      return globalRecord;
    }

    const nextContainerId = canonicalizeStoredContainerId(record.containerId);
    if (nextContainerId === record.containerId) {
      return record;
    }

    changes.push({
      id: record.id,
      projectId: record.projectId,
      fromContainerId: record.containerId,
      toContainerId: nextContainerId,
    });

    return {
      ...record,
      containerId: nextContainerId,
    };
  });

  return { records: rewrittenRecords, changes };
}
