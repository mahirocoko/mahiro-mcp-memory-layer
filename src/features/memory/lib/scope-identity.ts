import path from "node:path";

export const canonicalContainerIdPrefix = "workspace";

const legacyContainerIdPrefixes = ["worktree", "directory"] as const;

export interface CanonicalProjectScopeIdentityInput {
  readonly projectName?: unknown;
  readonly projectId?: unknown;
  readonly worktreePath?: unknown;
  readonly directoryPath?: unknown;
  readonly projectDirectoryPath?: unknown;
}

export interface CanonicalProjectScopeIdentity {
  readonly projectId?: string;
  readonly containerId?: string;
}

export function resolveCanonicalProjectScopeIdentity(
  input: CanonicalProjectScopeIdentityInput,
): CanonicalProjectScopeIdentity {
  return {
    projectId: canonicalizeProjectId(input.projectName) ?? canonicalizeProjectId(input.projectId),
    containerId:
      canonicalizeContainerId(input.worktreePath)
      ?? canonicalizeContainerId(input.directoryPath)
      ?? canonicalizeContainerId(input.projectDirectoryPath),
  };
}

export function canonicalizeProjectId(value: unknown): string | undefined {
  return toNonEmptyString(value);
}

export function canonicalizeContainerId(value: unknown): string | undefined {
  const normalized = toNonEmptyString(value);
  if (!normalized) {
    return undefined;
  }

  return `${canonicalContainerIdPrefix}:${path.resolve(normalized)}`;
}

export function containerIdReadAliases(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }

  const parsed = parseContainerId(value);
  if (!parsed) {
    return [value];
  }

  const aliases = [
    value,
    `${canonicalContainerIdPrefix}:${parsed.path}`,
    ...legacyContainerIdPrefixes.map((prefix) => `${prefix}:${parsed.path}`),
  ];

  return [...new Set(aliases)];
}

export function containerIdMatchesFilter(recordContainerId: string | undefined, filterContainerId: string | undefined): boolean {
  if (!filterContainerId) {
    return true;
  }

  return containerIdReadAliases(filterContainerId).includes(recordContainerId ?? "");
}

export function canonicalizeStoredContainerId(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  const parsed = parseContainerId(value);
  if (parsed) {
    return `${canonicalContainerIdPrefix}:${parsed.path}`;
  }

  return looksLikeFilePath(value) ? `${canonicalContainerIdPrefix}:${path.resolve(value)}` : value;
}

function looksLikeFilePath(value: string): boolean {
  return path.isAbsolute(value) || value.startsWith("./") || value.startsWith("../");
}

function parseContainerId(value: string): { readonly prefix: string; readonly path: string } | undefined {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const prefix = value.slice(0, separatorIndex);
  const pathPart = value.slice(separatorIndex + 1);
  if (pathPart.length === 0) {
    return undefined;
  }

  if (prefix !== canonicalContainerIdPrefix && !legacyContainerIdPrefixes.includes(prefix as never)) {
    return undefined;
  }

  return { prefix, path: pathPart };
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
