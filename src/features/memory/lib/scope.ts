import type { MemoryRecord, MemoryScope, RetrievalRow, ScopeFilter } from "../types.js";
import { containerIdMatchesFilter, containerIdReadAliases } from "./scope-identity.js";

const scopeRequirementByName: Record<MemoryScope, readonly (keyof ScopeFilter)[]> = {
  global: [],
  project: ["projectId", "containerId"],
};

export function assertValidScope(filter: ScopeFilter): void {
  const requiredFields = scopeRequirementByName[filter.scope];

  for (const fieldName of requiredFields) {
    if (!filter[fieldName]) {
      throw new Error(`Missing required scope field: ${fieldName}`);
    }
  }
}

export function toScopeFilter(input: ScopeFilter): ScopeFilter {
  assertValidScope(input);
  return input;
}

export function matchesScopeFilter(
  record: Pick<MemoryRecord | RetrievalRow, "scope" | "projectId" | "containerId">,
  filter: ScopeFilter,
): boolean {
  return record.scope === filter.scope
    && (!filter.projectId || record.projectId === filter.projectId)
    && containerIdMatchesFilter(record.containerId, filter.containerId);
}

export function matchesProjectScopeIdentity(
  record: Pick<MemoryRecord, "projectId" | "containerId">,
  filter: { readonly projectId?: string; readonly containerId?: string },
): boolean {
  return (!filter.projectId || record.projectId === filter.projectId)
    && containerIdMatchesFilter(record.containerId, filter.containerId);
}

export function toSqlScopeWhereClause(filter: ScopeFilter): string {
  const parts = [`scope = '${escapeSqlValue(filter.scope)}'`];

  if (filter.projectId) {
    parts.push(`project_id = '${escapeSqlValue(filter.projectId)}'`);
  }

  if (filter.containerId) {
    const containerIds = containerIdReadAliases(filter.containerId);
    const containerClause = containerIds
      .map((containerId) => `container_id = '${escapeSqlValue(containerId)}'`)
      .join(" OR ");
    parts.push(`(${containerClause})`);
  }

  return parts.join(" AND ");
}

function escapeSqlValue(value: string): string {
  return value.replaceAll("'", "''");
}
