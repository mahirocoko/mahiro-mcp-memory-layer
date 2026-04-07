import type { MemoryScope, ScopeFilter } from "../types.js";

const scopeRequirementByName: Record<MemoryScope, readonly (keyof ScopeFilter)[]> = {
  global: [],
  user: ["userId"],
  project: ["userId", "projectId", "containerId"],
  session: ["userId", "projectId", "containerId", "sessionId"],
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

  if (filter.userId) {
    parts.push(`user_id = '${escapeSqlValue(filter.userId)}'`);
  }

  if (filter.projectId) {
    parts.push(`project_id = '${escapeSqlValue(filter.projectId)}'`);
  }

  if (filter.containerId) {
    parts.push(`container_id = '${escapeSqlValue(filter.containerId)}'`);
  }

  if (filter.sessionId) {
    parts.push(`session_id = '${escapeSqlValue(filter.sessionId)}'`);
  }

  return parts.join(" AND ");
}

function escapeSqlValue(value: string): string {
  return value.replaceAll("'", "''");
}
