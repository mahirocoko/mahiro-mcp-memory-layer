import path from "node:path";

import type { CursorWorkerInput } from "../types.js";

interface ResolveCursorTrustOptions {
  readonly currentWorkspace?: string;
  readonly trustedRoots?: readonly string[];
}

export function shouldTrustCursorWorkspace(
  input: Pick<CursorWorkerInput, "cwd" | "trust">,
  options: ResolveCursorTrustOptions = {},
): boolean {
  if (input.trust !== undefined) {
    return input.trust;
  }

  const currentWorkspace = normalizePath(options.currentWorkspace ?? process.cwd());
  const trustedRoots = [currentWorkspace, ...getTrustedRoots(options.trustedRoots)].filter(isPresent);
  const targetWorkspace = normalizePath(input.cwd ?? currentWorkspace);

  return trustedRoots.some((trustedRoot) => isWithinTrustedRoot(targetWorkspace, trustedRoot));
}

function getTrustedRoots(explicitTrustedRoots: readonly string[] | undefined): readonly string[] {
  if (explicitTrustedRoots && explicitTrustedRoots.length > 0) {
    return explicitTrustedRoots.map((trustedRoot) => normalizePath(trustedRoot));
  }

  const configuredTrustedRoots = process.env.CURSOR_TRUSTED_WORKSPACES;

  if (!configuredTrustedRoots) {
    return [];
  }

  return configuredTrustedRoots
    .split(path.delimiter)
    .map((trustedRoot) => trustedRoot.trim())
    .filter(Boolean)
    .map((trustedRoot) => normalizePath(trustedRoot));
}

function isWithinTrustedRoot(targetWorkspace: string, trustedRoot: string): boolean {
  const relativePath = path.relative(trustedRoot, targetWorkspace);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
