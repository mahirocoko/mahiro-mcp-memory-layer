import type { MemoryScope, ScopeFilter } from "../types.js";

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

export function toSqlScopeWhereClause(filter: ScopeFilter): string {
  const parts = [`scope = '${escapeSqlValue(filter.scope)}'`];

  if (filter.projectId) {
    parts.push(`project_id = '${escapeSqlValue(filter.projectId)}'`);
  }

  if (filter.containerId) {
    parts.push(`container_id = '${escapeSqlValue(filter.containerId)}'`);
  }

  return parts.join(" AND ");
}

function escapeSqlValue(value: string): string {
  return value.replaceAll("'", "''");
}
