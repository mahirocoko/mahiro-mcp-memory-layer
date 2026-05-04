import type {
  PrepareHostTurnMemoryResult,
  PrepareTurnMemoryResult,
  WakeUpMemoryResult,
} from "../memory/types.js";
import {
  buildOpenCodePluginMemoryProtocol,
  type OpenCodePluginMemoryProtocol,
  type OpenCodePluginRuntimeCapabilities,
} from "./runtime-capabilities.js";
import {
  resolveOpenCodeScope,
  type OpenCodePluginContext,
  type OpenCodePluginEvent,
  type OpenCodeScopeResolution,
} from "./resolve-scope.js";

const openCodePluginMemoryLifecycleStages = [
  "session-start-wake-up",
  "turn-preflight",
  "idle-persistence",
  "compaction-continuity",
] as const;

export type OpenCodePluginMemoryLifecycleStage = (typeof openCodePluginMemoryLifecycleStages)[number];

const memoryLifecycleStagesByEventType: Readonly<Record<string, readonly OpenCodePluginMemoryLifecycleStage[]>> = {
  "session.created": ["session-start-wake-up"],
  "message.updated": ["turn-preflight"],
  "message.part.updated": ["session-start-wake-up", "turn-preflight"],
  "session.idle": ["idle-persistence"],
  "experimental.session.compacting": ["compaction-continuity"],
};

export type OpenCodePluginMemoryLifecycleDiagnosticStatus =
  | "not_run"
  | "skipped"
  | "succeeded"
  | "failed_open";

export type OpenCodePluginMemoryLifecycleDiagnosticReasonCode =
  | "awaiting_lifecycle_signal"
  | "already_started_or_cached"
  | "backend_error"
  | "backend_failed_open"
  | "auto_save_skipped_incomplete_scope"
  | "auto_saved"
  | "cache_write_completed"
  | "cached_checkpoint_reused"
  | "cached_session_state_appended"
  | "context_append_failed"
  | "deduped_turn"
  | "empty_recent_conversation"
  | "incomplete_scope"
  | "incomplete_scope_ids"
  | "likely_skip"
  | "missing_cached_session_state"
  | "missing_session_state"
  | "missing_turn_key"
  | "no_candidates"
  | "no_recent_conversation"
  | "output_context_not_appendable"
  | "output_prompt_already_set"
  | "preflight_not_needed"
  | "review_only"
  | "small_talk"
  | "stale_lifecycle_result"
  | "turn_already_handled";

export interface OpenCodePluginMemoryLifecycleSummaryCounts {
  readonly retrieved?: number;
  readonly candidates?: number;
  readonly autoSaved?: number;
  readonly reviewOnly?: number;
  readonly skipped?: number;
}

export interface OpenCodePluginMemoryLifecycleDiagnostic {
  readonly stage: OpenCodePluginMemoryLifecycleStage;
  readonly status: OpenCodePluginMemoryLifecycleDiagnosticStatus;
  readonly lastAttemptedAt?: string;
  readonly reasonCode?: OpenCodePluginMemoryLifecycleDiagnosticReasonCode;
  readonly scopeUsed?: OpenCodeScopeResolution["scope"];
  readonly summaryCounts?: OpenCodePluginMemoryLifecycleSummaryCounts;
}

export type OpenCodePluginMemoryLifecycleDiagnostics = Readonly<
  Record<OpenCodePluginMemoryLifecycleStage, OpenCodePluginMemoryLifecycleDiagnostic>
>;

export interface OpenCodePluginCachedSession {
  readonly sessionId: string;
  readonly scopeResolution: OpenCodeScopeResolution;
  readonly lastEventType?: string;
  readonly lastMemoryLifecycleStages?: readonly OpenCodePluginMemoryLifecycleStage[];
  readonly lifecycleDiagnostics: OpenCodePluginMemoryLifecycleDiagnostics;
  readonly lastUpdatedAt: string;
  readonly lastMessageId?: string;
  readonly coordination: {
    readonly messageDebounceMs: number;
    readonly messageVersion: number;
    readonly hasPendingMessageDebounce: boolean;
  };
  readonly startupBrief?: string;
  readonly capabilities?: OpenCodePluginRuntimeCapabilities;
  readonly memoryProtocol?: OpenCodePluginMemoryProtocol;
  readonly continuityCache: {
    readonly wakeUp?: WakeUpMemoryResult;
    readonly prepareTurn?: PrepareTurnMemoryResult;
    readonly prepareHostTurn?: PrepareHostTurnMemoryResult;
  };
}

export interface OpenCodePluginReadyMemoryContextResult {
  readonly status: "ready";
  readonly latestSessionId?: string;
  readonly session: OpenCodePluginCachedSession;
}

export interface OpenCodePluginEmptyMemoryContextResult {
  readonly status: "empty";
  readonly latestSessionId?: string;
}

export type OpenCodePluginMemoryContextResult =
  | OpenCodePluginReadyMemoryContextResult
  | OpenCodePluginEmptyMemoryContextResult;

export interface OpenCodePluginSessionState {
  readonly sessionId: string;
  scopeResolution: OpenCodeScopeResolution;
  lastEventType?: string;
  lastMemoryLifecycleStages?: readonly OpenCodePluginMemoryLifecycleStage[];
  lifecycleDiagnostics: Partial<Record<OpenCodePluginMemoryLifecycleStage, OpenCodePluginMemoryLifecycleDiagnostic>>;
  lastUpdatedAt: string;
  lastMessageId?: string;
  recentConversation?: string;
  messageVersion: number;
  messageDebounceMs: number;
  hasStartedWakeUp: boolean;
  pendingMessageDebounce?: ReturnType<typeof setTimeout>;
  pendingWakeUp?: Promise<void>;
  pendingPrepareHostTurnKey?: string;
  lastHandledPrepareHostTurnKey?: string;
  startupBrief?: string;
  capabilities?: OpenCodePluginRuntimeCapabilities;
  memoryProtocol?: OpenCodePluginMemoryProtocol;
  wakeUp?: WakeUpMemoryResult;
  prepareTurn?: PrepareTurnMemoryResult;
  prepareHostTurnKey?: string;
  prepareHostTurn?: PrepareHostTurnMemoryResult;
}

export interface OpenCodePluginRuntimeState {
  readonly sessions: Map<string, OpenCodePluginSessionState>;
  latestSessionId?: string;
}

let singletonRuntimeState: OpenCodePluginRuntimeState | undefined;

export function getOrCreateSingletonRuntimeState(): OpenCodePluginRuntimeState {
  if (!singletonRuntimeState) {
    singletonRuntimeState = {
      sessions: new Map<string, OpenCodePluginSessionState>(),
    };
  }

  return singletonRuntimeState;
}

export function resetOpenCodePluginRuntimeStateForTests(): void {
  if (singletonRuntimeState) {
    clearOpenCodePluginRuntimeState(singletonRuntimeState);
  }

  singletonRuntimeState = undefined;
}

export function resetOpenCodePluginRuntimeState(): void {
  resetOpenCodePluginRuntimeStateForTests();
}

export function clearOpenCodePluginRuntimeState(runtimeState: OpenCodePluginRuntimeState): void {
  for (const sessionState of runtimeState.sessions.values()) {
    if (sessionState.pendingMessageDebounce) {
      clearTimeout(sessionState.pendingMessageDebounce);
    }
  }

  runtimeState.sessions.clear();
  runtimeState.latestSessionId = undefined;
}

export function syncSessionStateFromEvent(
  runtimeState: OpenCodePluginRuntimeState,
  context: OpenCodePluginContext,
  event: OpenCodePluginEvent,
  messageDebounceMs: number,
): OpenCodePluginSessionState | undefined {
  const scopeResolution = resolveOpenCodeScope({
    context,
    event,
  });
  const sessionId = scopeResolution.scope.sessionId;

  if (!sessionId) {
    return undefined;
  }

  const existingState = runtimeState.sessions.get(sessionId);
  const nextMessageId = resolveMessageId(event) ?? existingState?.lastMessageId;
  const isTurnUpdateEvent = isTurnTextUpdateEvent(event);
  const nextState: OpenCodePluginSessionState = {
    sessionId,
    scopeResolution,
    lastEventType: event.type,
    lastMemoryLifecycleStages: resolveOpenCodePluginMemoryLifecycleStages(event.type),
    lifecycleDiagnostics: existingState?.lifecycleDiagnostics ?? {},
    lastUpdatedAt: new Date().toISOString(),
    lastMessageId: nextMessageId,
    recentConversation: resolveRecentConversationForEvent(event, existingState, nextMessageId),
    messageVersion: isTurnUpdateEvent ? (existingState?.messageVersion ?? 0) + 1 : (existingState?.messageVersion ?? 0),
    messageDebounceMs,
    hasStartedWakeUp: existingState?.hasStartedWakeUp ?? false,
    pendingMessageDebounce: existingState?.pendingMessageDebounce,
    pendingWakeUp: existingState?.pendingWakeUp,
    pendingPrepareHostTurnKey: isTurnUpdateEvent ? undefined : existingState?.pendingPrepareHostTurnKey,
    lastHandledPrepareHostTurnKey: existingState?.lastHandledPrepareHostTurnKey,
    startupBrief: existingState?.startupBrief,
    capabilities: existingState?.capabilities,
    memoryProtocol: existingState?.memoryProtocol ?? buildOpenCodePluginMemoryProtocol(),
    wakeUp: existingState?.wakeUp,
    prepareTurn: isTurnUpdateEvent ? undefined : existingState?.prepareTurn,
    prepareHostTurnKey: isTurnUpdateEvent ? undefined : existingState?.prepareHostTurnKey,
    prepareHostTurn: isTurnUpdateEvent ? undefined : existingState?.prepareHostTurn,
  };

  runtimeState.sessions.set(sessionId, nextState);
  runtimeState.latestSessionId = sessionId;

  return nextState;
}

export function buildMemoryContextResult(
  runtimeState: OpenCodePluginRuntimeState,
  sessionId: string | undefined,
): OpenCodePluginMemoryContextResult {
  if (!sessionId) {
    return {
      status: "empty",
      latestSessionId: runtimeState.latestSessionId,
    };
  }

  const sessionState = runtimeState.sessions.get(sessionId);

  if (!sessionState) {
    return {
      status: "empty",
      latestSessionId: runtimeState.latestSessionId,
    };
  }

  return {
    status: "ready",
    latestSessionId: runtimeState.latestSessionId,
    session: {
      sessionId: sessionState.sessionId,
      scopeResolution: sessionState.scopeResolution,
      lastEventType: sessionState.lastEventType,
      ...(sessionState.lastMemoryLifecycleStages && sessionState.lastMemoryLifecycleStages.length > 0
        ? { lastMemoryLifecycleStages: sessionState.lastMemoryLifecycleStages }
        : {}),
      lifecycleDiagnostics: buildMemoryLifecycleDiagnostics(sessionState),
      lastUpdatedAt: sessionState.lastUpdatedAt,
      lastMessageId: sessionState.lastMessageId,
      coordination: {
        messageDebounceMs: sessionState.messageDebounceMs,
        messageVersion: sessionState.messageVersion,
        hasPendingMessageDebounce: Boolean(sessionState.pendingMessageDebounce),
      },
      ...(sessionState.startupBrief ? { startupBrief: sessionState.startupBrief } : {}),
      ...(sessionState.capabilities ? { capabilities: sessionState.capabilities } : {}),
      ...(sessionState.memoryProtocol ? { memoryProtocol: sessionState.memoryProtocol } : {}),
      continuityCache: {
        ...(sessionState.wakeUp ? { wakeUp: sessionState.wakeUp } : {}),
        ...(sessionState.prepareTurn ? { prepareTurn: sessionState.prepareTurn } : {}),
        ...(sessionState.prepareHostTurn ? { prepareHostTurn: sessionState.prepareHostTurn } : {}),
      },
    },
  };
}

function resolveOpenCodePluginMemoryLifecycleStages(
  eventType: string,
): readonly OpenCodePluginMemoryLifecycleStage[] {
  return memoryLifecycleStagesByEventType[eventType] ?? [];
}

export function markMemoryLifecycleDiagnostic(
  sessionState: OpenCodePluginSessionState,
  stage: OpenCodePluginMemoryLifecycleStage,
  diagnostic: Omit<OpenCodePluginMemoryLifecycleDiagnostic, "stage" | "lastAttemptedAt"> & {
    readonly lastAttemptedAt?: string;
  },
): void {
  sessionState.lifecycleDiagnostics = {
    ...sessionState.lifecycleDiagnostics,
    [stage]: {
      stage,
      lastAttemptedAt: diagnostic.lastAttemptedAt ?? new Date().toISOString(),
      status: diagnostic.status,
      ...(diagnostic.reasonCode ? { reasonCode: diagnostic.reasonCode } : {}),
      ...(diagnostic.scopeUsed ? { scopeUsed: diagnostic.scopeUsed } : {}),
      ...(diagnostic.summaryCounts ? { summaryCounts: diagnostic.summaryCounts } : {}),
    },
  };
}

function buildMemoryLifecycleDiagnostics(
  sessionState: OpenCodePluginSessionState,
): OpenCodePluginMemoryLifecycleDiagnostics {
  return Object.fromEntries(
    openCodePluginMemoryLifecycleStages.map((stage) => [
      stage,
      sessionState.lifecycleDiagnostics[stage] ?? {
        stage,
        status: "not_run" as const,
        reasonCode: "awaiting_lifecycle_signal" as const,
        scopeUsed: sessionState.scopeResolution.scope,
      },
    ]),
  ) as OpenCodePluginMemoryLifecycleDiagnostics;
}

export function resolveSessionIdFromUnknown(value: unknown): string | undefined {
  const record = asRecord(value);

  return (
    toNonEmptyString(record?.sessionID) ??
    toNonEmptyString(asRecord(record?.info)?.id) ??
    toNonEmptyString(asRecord(record?.properties)?.sessionID) ??
    toNonEmptyString(asRecord(asRecord(record?.properties)?.info)?.id)
  );
}

export function buildPrepareHostTurnKey(sessionState: OpenCodePluginSessionState): string | undefined {
  if (sessionState.lastMessageId) {
    return `message:${sessionState.lastMessageId}`;
  }

  if (sessionState.messageVersion > 0) {
    return `version:${sessionState.messageVersion}`;
  }

  return undefined;
}

function resolveMessageId(event: OpenCodePluginEvent): string | undefined {
  return toNonEmptyString(asRecord(event.properties)?.messageID);
}

function resolveRecentConversationForEvent(
  event: OpenCodePluginEvent,
  existingState: OpenCodePluginSessionState | undefined,
  nextMessageId: string | undefined,
): string | undefined {
  if (!isTurnTextUpdateEvent(event)) {
    return existingState?.recentConversation;
  }

  const recentConversation = extractRecentConversation(event);

  if (recentConversation) {
    return recentConversation;
  }

  if (nextMessageId && nextMessageId === existingState?.lastMessageId) {
    return existingState?.recentConversation;
  }

  return undefined;
}

export function extractRecentConversation(event: OpenCodePluginEvent): string | undefined {
  const properties = asRecord(event.properties);
  const singlePartText = toNonEmptyString(asRecord(properties?.part)?.text);

  if (singlePartText) {
    return singlePartText;
  }

  const parts = Array.isArray(properties?.parts) ? properties.parts : [];
  const textParts = parts
    .map((part) => {
      const record = asRecord(part);
      return toNonEmptyString(record?.text);
    })
    .filter((part): part is string => Boolean(part));

  if (textParts.length > 0) {
    return textParts.join("\n\n");
  }

  return toNonEmptyString(properties?.message);
}

function isTurnTextUpdateEvent(event: OpenCodePluginEvent): boolean {
  return event.type === "message.updated" || event.type === "message.part.updated";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
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
