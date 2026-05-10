import type { PluginInput } from "@opencode-ai/plugin";

import { resolveCanonicalProjectScopeIdentity } from "../memory/lib/scope-identity.js";

export const openCodeScopeFieldNames = ["projectId", "containerId", "sessionId"] as const;

export type OpenCodeScopeField = (typeof openCodeScopeFieldNames)[number];

export type OpenCodeScopeSource =
  | "context.project.id"
  | "context.project.name"
  | "context.worktree"
  | "context.directory"
  | "context.project.directory"
  | "event.properties.sessionID"
  | "event.properties.info.id";

export type OpenCodePluginContext = PluginInput & {
  readonly project: PluginInput["project"] & {
    readonly name?: unknown;
    readonly directory?: unknown;
  };
};

export interface OpenCodePluginEvent {
  readonly type: string;
  readonly properties?: Record<string, unknown>;
}

export interface OpenCodeResolvedScope {
  readonly projectId: string;
  readonly containerId: string;
  readonly sessionId: string;
}

export interface ResolveOpenCodeScopeInput {
  readonly context: OpenCodePluginContext;
  readonly event: OpenCodePluginEvent;
}

export interface CompleteOpenCodeScopeResolution {
  readonly status: "complete";
  readonly scope: OpenCodeResolvedScope;
  readonly missing: readonly [];
  readonly resolvedFrom: Readonly<Record<OpenCodeScopeField, OpenCodeScopeSource>>;
}

export interface IncompleteOpenCodeScopeResolution {
  readonly status: "incomplete";
  readonly reason: "incomplete_scope_ids";
  readonly scope: Partial<OpenCodeResolvedScope>;
  readonly missing: readonly OpenCodeScopeField[];
  readonly resolvedFrom: Readonly<Partial<Record<OpenCodeScopeField, OpenCodeScopeSource>>>;
}

export type OpenCodeScopeResolution = CompleteOpenCodeScopeResolution | IncompleteOpenCodeScopeResolution;

export function resolveOpenCodeScope(input: ResolveOpenCodeScopeInput): OpenCodeScopeResolution {
  const resolvedScope = {
    projectId: resolveProjectId(input.context),
    containerId: resolveContainerId(input.context),
    sessionId: resolveSessionId(input.event),
  };
  const partialScope = toPartialScope(resolvedScope);

  const resolvedFrom = {
    ...resolveProjectSource(input.context),
    ...resolveContainerSource(input.context),
    ...resolveSessionSource(input.event),
  };

  const missing = openCodeScopeFieldNames.filter((fieldName) => !resolvedScope[fieldName]);

  if (missing.length === 0) {
    return {
      status: "complete",
      scope: resolvedScope as OpenCodeResolvedScope,
      missing: [],
      resolvedFrom: resolvedFrom as Readonly<Record<OpenCodeScopeField, OpenCodeScopeSource>>,
    };
  }

  return {
    status: "incomplete",
    reason: "incomplete_scope_ids",
    scope: partialScope,
    missing,
    resolvedFrom,
  };
}

function resolveProjectId(context: OpenCodePluginContext): string | undefined {
  return resolveCanonicalProjectScopeIdentity({
    projectName: context.project?.name,
    projectId: context.project?.id,
  }).projectId;
}

function resolveProjectSource(
  context: OpenCodePluginContext,
): Partial<Record<"projectId", OpenCodeScopeSource>> {
  if (toNonEmptyString(context.project?.name)) {
    return { projectId: "context.project.name" };
  }

  if (toNonEmptyString(context.project?.id)) {
    return { projectId: "context.project.id" };
  }

  return {};
}

function resolveContainerId(context: OpenCodePluginContext): string | undefined {
  return resolveCanonicalProjectScopeIdentity({
    worktreePath: context.worktree,
    directoryPath: context.directory,
    projectDirectoryPath: context.project?.directory,
  }).containerId;
}

function resolveContainerSource(
  context: OpenCodePluginContext,
): Partial<Record<"containerId", OpenCodeScopeSource>> {
  if (toNonEmptyString(context.worktree)) {
    return { containerId: "context.worktree" };
  }

  if (toNonEmptyString(context.directory)) {
    return { containerId: "context.directory" };
  }

  if (toNonEmptyString(context.project?.directory)) {
    return { containerId: "context.project.directory" };
  }

  return {};
}

function resolveSessionId(event: OpenCodePluginEvent): string | undefined {
  const properties = asRecord(event.properties);

  return toNonEmptyString(properties?.sessionID) ?? toNonEmptyString(asRecord(properties?.info)?.id);
}

function resolveSessionSource(
  event: OpenCodePluginEvent,
): Partial<Record<"sessionId", OpenCodeScopeSource>> {
  const properties = asRecord(event.properties);

  if (toNonEmptyString(properties?.sessionID)) {
    return { sessionId: "event.properties.sessionID" };
  }

  if (toNonEmptyString(asRecord(properties?.info)?.id)) {
    return { sessionId: "event.properties.info.id" };
  }

  return {};
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function toPartialScope(scope: {
  readonly projectId?: string;
  readonly containerId?: string;
  readonly sessionId?: string;
}): Partial<OpenCodeResolvedScope> {
  return {
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...(scope.containerId ? { containerId: scope.containerId } : {}),
    ...(scope.sessionId ? { sessionId: scope.sessionId } : {}),
  };
}
