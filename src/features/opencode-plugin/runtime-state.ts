import type {
  PrepareHostTurnMemoryResult,
  PrepareTurnMemoryResult,
  WakeUpMemoryResult,
} from "../memory/types.js";
import type { OpenCodePluginRuntimeCapabilities } from "./runtime-capabilities.js";
import { resolveOpenCodeScope, type OpenCodePluginContext, type OpenCodePluginEvent, type OpenCodeScopeResolution } from "./resolve-scope.js";

export interface OpenCodePluginCachedSession {
  readonly sessionId: string;
  readonly scopeResolution: OpenCodeScopeResolution;
  readonly lastEventType?: string;
  readonly lastUpdatedAt: string;
  readonly lastMessageId?: string;
  readonly coordination: {
    readonly messageDebounceMs: number;
    readonly messageVersion: number;
    readonly hasPendingMessageDebounce: boolean;
  };
  readonly startupBrief?: string;
  readonly capabilities?: OpenCodePluginRuntimeCapabilities;
  readonly cached: {
    readonly wakeUp?: WakeUpMemoryResult;
    readonly prepareTurn?: PrepareTurnMemoryResult;
    readonly prepareHostTurn?: PrepareHostTurnMemoryResult;
  };
  readonly operator?: OpenCodePluginOperatorState;
}

export type OpenCodePluginOrchMode = "off" | "request-only" | "sticky-on";

export type OpenCodePluginOperatorTaskStatus =
  | "running"
  | "awaiting_resume"
  | "awaiting_verification"
  | "completed"
  | "needs_attention";

export type OpenCodePluginVerificationPolicy = "default-repo";

export interface OpenCodePluginOperatorTaskLedgerEntry {
  readonly requestId: string;
  readonly taskId?: string;
  readonly resultTool: string;
  readonly verificationPolicy: OpenCodePluginVerificationPolicy;
  readonly verificationRequired: boolean;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly workflowStatus?: string;
  readonly operatorStatus: OpenCodePluginOperatorTaskStatus;
  readonly reminderToken?: string;
  readonly reminderStatus?: string;
  readonly attentionReason?: string;
  readonly verificationNote?: string;
}

export interface OpenCodePluginOperatorState {
  readonly stickyModeEnabled: boolean;
  readonly currentMode: OpenCodePluginOrchMode;
  readonly lastOperatorUpdateAt?: string;
  readonly tasks: Record<string, OpenCodePluginOperatorTaskLedgerEntry>;
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
  wakeUp?: WakeUpMemoryResult;
  prepareTurn?: PrepareTurnMemoryResult;
  prepareHostTurn?: PrepareHostTurnMemoryResult;
  operator?: OpenCodePluginOperatorState;
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
    for (const sessionState of singletonRuntimeState.sessions.values()) {
      if (sessionState.pendingMessageDebounce) {
        clearTimeout(sessionState.pendingMessageDebounce);
      }
    }
  }

  singletonRuntimeState = undefined;
}

export function syncSessionStateFromEvent(
  runtimeState: OpenCodePluginRuntimeState,
  context: OpenCodePluginContext,
  event: OpenCodePluginEvent,
  messageDebounceMs: number,
  providedUserId: string,
): OpenCodePluginSessionState | undefined {
  const scopeResolution = resolveOpenCodeScope({
    context,
    event,
    providedUserId,
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
    lastUpdatedAt: new Date().toISOString(),
    lastMessageId: nextMessageId,
    recentConversation: resolveRecentConversationForEvent(event, existingState, nextMessageId),
    messageVersion:
      isTurnUpdateEvent
        ? (existingState?.messageVersion ?? 0) + 1
        : (existingState?.messageVersion ?? 0),
    messageDebounceMs,
    hasStartedWakeUp: existingState?.hasStartedWakeUp ?? false,
    pendingMessageDebounce: existingState?.pendingMessageDebounce,
    pendingWakeUp: existingState?.pendingWakeUp,
    pendingPrepareHostTurnKey: existingState?.pendingPrepareHostTurnKey,
    lastHandledPrepareHostTurnKey: existingState?.lastHandledPrepareHostTurnKey,
    startupBrief: existingState?.startupBrief,
    capabilities: existingState?.capabilities,
    wakeUp: existingState?.wakeUp,
    prepareTurn: isTurnUpdateEvent ? undefined : existingState?.prepareTurn,
    prepareHostTurn: existingState?.prepareHostTurn,
    operator: existingState?.operator,
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
      lastUpdatedAt: sessionState.lastUpdatedAt,
      lastMessageId: sessionState.lastMessageId,
      coordination: {
        messageDebounceMs: sessionState.messageDebounceMs,
        messageVersion: sessionState.messageVersion,
        hasPendingMessageDebounce: Boolean(sessionState.pendingMessageDebounce),
      },
      ...(sessionState.startupBrief ? { startupBrief: sessionState.startupBrief } : {}),
      ...(sessionState.capabilities ? { capabilities: sessionState.capabilities } : {}),
      cached: {
        ...(sessionState.wakeUp ? { wakeUp: sessionState.wakeUp } : {}),
        ...(sessionState.prepareTurn ? { prepareTurn: sessionState.prepareTurn } : {}),
        ...(sessionState.prepareHostTurn ? { prepareHostTurn: sessionState.prepareHostTurn } : {}),
      },
      ...(sessionState.operator ? { operator: sessionState.operator } : {}),
    },
  };
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
