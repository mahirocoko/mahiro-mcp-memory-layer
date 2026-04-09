import { MemoryService } from "../memory/memory-service.js";
import type { ZodRawShape } from "zod";
import type { MemoryToolBackend } from "../memory/lib/tool-definitions.js";
import type {
  PrepareHostTurnMemoryResult,
  PrepareTurnMemoryResult,
  WakeUpMemoryResult,
} from "../memory/types.js";
import { resolveOpenCodeScope, type OpenCodeScopeResolution } from "./resolve-scope.js";
import type { OpenCodePluginContext, OpenCodePluginEvent } from "./resolve-scope.js";

export type OpenCodePluginMemoryBackend = MemoryToolBackend;

export interface OpenCodePluginCompactionInput {
  readonly sessionID?: unknown;
  readonly info?: unknown;
  readonly properties?: Record<string, unknown>;
}

export interface OpenCodePluginCompactionOutput {
  context?: unknown;
  prompt?: unknown;
}

export interface OpenCodePluginToolExecutionContext {
  readonly sessionID?: unknown;
  readonly info?: unknown;
  readonly properties?: Record<string, unknown>;
  readonly directory?: unknown;
  readonly worktree?: unknown;
}

export interface OpenCodePluginToolDefinition {
  readonly description: string;
  readonly args: ZodRawShape;
  readonly execute: (
    args: Record<string, unknown>,
    context: OpenCodePluginToolExecutionContext,
  ) => Promise<unknown>;
}

export interface OpenCodePluginHooks {
  readonly event: (input: { readonly event: OpenCodePluginEvent }) => Promise<void>;
  readonly "session.created": (input: { readonly event: OpenCodePluginEvent }) => Promise<void>;
  readonly "message.updated": (input: { readonly event: OpenCodePluginEvent }) => Promise<void>;
  readonly "session.idle": (input: { readonly event: OpenCodePluginEvent }) => Promise<void>;
  readonly "experimental.session.compacting": (
    input: OpenCodePluginCompactionInput,
    output: OpenCodePluginCompactionOutput,
  ) => Promise<void>;
  readonly tool: Record<string, OpenCodePluginToolDefinition>;
}

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
  readonly cached: {
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

interface OpenCodePluginSessionState {
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
  wakeUp?: WakeUpMemoryResult;
  prepareTurn?: PrepareTurnMemoryResult;
  prepareHostTurn?: PrepareHostTurnMemoryResult;
}

interface OpenCodePluginRuntimeState {
  readonly sessions: Map<string, OpenCodePluginSessionState>;
  latestSessionId?: string;
}

export interface OpenCodePluginTestOptions {
  readonly memory?: OpenCodePluginMemoryBackend;
  readonly createMemoryBackend?: () => Promise<OpenCodePluginMemoryBackend>;
  readonly messageDebounceMs?: number;
}

export interface OpenCodePluginServerOptions {
  readonly __test?: OpenCodePluginTestOptions;
}

export interface OpenCodePluginRuntime {
  readonly messageDebounceMs: number;
  readonly ensureBackend: () => Promise<OpenCodePluginMemoryBackend>;
  readonly handleEvent: (event: OpenCodePluginEvent) => Promise<void>;
  readonly handleSessionCreated: (event: OpenCodePluginEvent) => Promise<void>;
  readonly handleMessageUpdated: (event: OpenCodePluginEvent) => Promise<void>;
  readonly handleSessionIdle: (event: OpenCodePluginEvent) => Promise<void>;
  readonly handleExperimentalSessionCompacting: (
    input: OpenCodePluginCompactionInput,
    output: OpenCodePluginCompactionOutput,
  ) => Promise<void>;
  readonly readMemoryContext: (
    context: OpenCodePluginToolExecutionContext,
  ) => Promise<OpenCodePluginMemoryContextResult>;
}

let singletonMemoryBackendPromise: Promise<OpenCodePluginMemoryBackend> | undefined;
let singletonRuntimeState: OpenCodePluginRuntimeState | undefined;

export function createOpenCodePluginRuntime(
  context: OpenCodePluginContext,
  options: OpenCodePluginServerOptions,
  messageDebounceMs: number,
): OpenCodePluginRuntime {
  const runtimeState = getOrCreateSingletonRuntimeState();

  const routeEvent = async (
    event: OpenCodePluginEvent,
    sourceHook: "event" | "session.created" | "message.updated" | "session.idle" | "experimental.session.compacting",
  ): Promise<OpenCodePluginSessionState | undefined> => {
    void getOpenCodePluginMemoryBackend(options).catch((error) =>
      logPluginLifecycle(context, {
        service: "opencode-memory-plugin",
        level: "warn",
        message: "OpenCode plugin backend initialization failed open.",
        extra: {
          eventType: event.type,
          sourceHook,
          error: toErrorMessage(error),
        },
      }),
    );
    const sessionState = syncSessionStateFromEvent(runtimeState, context, event, messageDebounceMs);
    await logPluginLifecycle(context, {
      service: "opencode-memory-plugin",
      level: "debug",
      message: "OpenCode plugin runtime shell ready.",
      extra: {
        eventType: event.type,
        sourceHook,
        messageDebounceMs,
        sessionId: sessionState?.sessionId,
      },
    });

    return sessionState;
  };

  const startSessionWakeUp = (sessionState: OpenCodePluginSessionState | undefined): void => {
    if (!sessionState || sessionState.hasStartedWakeUp || sessionState.wakeUp) {
      return;
    }

    const wakeUpScope = sessionState.scopeResolution.scope;
    let pendingWakeUp: Promise<void>;

    sessionState.hasStartedWakeUp = true;
    pendingWakeUp = getOpenCodePluginMemoryBackend(options)
      .then((backend) =>
        backend.wakeUpMemory({
          userId: wakeUpScope.userId,
          projectId: wakeUpScope.projectId,
          containerId: wakeUpScope.containerId,
          sessionId: wakeUpScope.sessionId ?? sessionState.sessionId,
        }),
      )
      .then((wakeUp) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState) {
          return;
        }

        latestSessionState.wakeUp = wakeUp;
      })
      .catch((error) =>
        logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "warn",
          message: "OpenCode plugin session.created wake-up failed open.",
          extra: {
            sessionId: sessionState.sessionId,
            error: toErrorMessage(error),
          },
        }),
      )
      .finally(() => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState || latestSessionState.pendingWakeUp !== pendingWakeUp) {
          return;
        }

        latestSessionState.pendingWakeUp = undefined;
      });

    sessionState.pendingWakeUp = pendingWakeUp;
  };

  const handleSessionCreatedEvent = async (
    event: OpenCodePluginEvent,
    sourceHook: "event" | "session.created",
  ): Promise<void> => {
    const sessionState = await routeEvent(event, sourceHook);
    startSessionWakeUp(sessionState);
  };

  const runMessageUpdatedPrecompute = async (
    sessionId: string,
    scheduledVersion: number,
    recentConversation: string,
    timer: ReturnType<typeof setTimeout>,
  ): Promise<void> => {
    const currentSessionState = runtimeState.sessions.get(sessionId);

    if (!currentSessionState || currentSessionState.pendingMessageDebounce !== timer) {
      return;
    }

    currentSessionState.pendingMessageDebounce = undefined;

    const scope = currentSessionState.scopeResolution.scope;

    try {
      const backend = await getOpenCodePluginMemoryBackend(options);
      const prepareTurn = await backend.prepareTurnMemory({
        task: "Summarize relevant memory context for the latest OpenCode turn.",
        mode: "query",
        recentConversation,
        userId: scope.userId,
        projectId: scope.projectId,
        containerId: scope.containerId,
        sessionId: scope.sessionId ?? sessionId,
      });
      const latestSessionState = runtimeState.sessions.get(sessionId);

      if (!latestSessionState || latestSessionState.messageVersion !== scheduledVersion) {
        return;
      }

      latestSessionState.prepareTurn = prepareTurn;
    } catch (error) {
      await logPluginLifecycle(context, {
        service: "opencode-memory-plugin",
        level: "warn",
        message: "OpenCode plugin message.updated precompute failed open.",
        extra: {
          sessionId,
          scheduledVersion,
          error: toErrorMessage(error),
        },
      });
    }
  };

  const scheduleMessageUpdatedPrecompute = (
    sessionState: OpenCodePluginSessionState | undefined,
    event: OpenCodePluginEvent,
  ): void => {
    if (!sessionState) {
      return;
    }

    if (sessionState.pendingMessageDebounce) {
      clearTimeout(sessionState.pendingMessageDebounce);
      sessionState.pendingMessageDebounce = undefined;
    }

    const recentConversation = extractRecentConversation(event);

    if (!recentConversation) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => {
      void runMessageUpdatedPrecompute(
        sessionState.sessionId,
        sessionState.messageVersion,
        recentConversation,
        timer,
      );
    }, sessionState.messageDebounceMs);

    sessionState.pendingMessageDebounce = timer;
  };

  const handleMessageUpdatedEvent = async (
    event: OpenCodePluginEvent,
    sourceHook: "event" | "message.updated",
  ): Promise<void> => {
    const sessionState = await routeEvent(event, sourceHook);
    scheduleMessageUpdatedPrecompute(sessionState, event);
  };

  const handleSessionIdleEvent = async (
    event: OpenCodePluginEvent,
    sourceHook: "event" | "session.idle",
  ): Promise<void> => {
    const sessionState = await routeEvent(event, sourceHook);

    if (!sessionState) {
      return;
    }

    const turnKey = buildPrepareHostTurnKey(sessionState);

    if (!turnKey) {
      return;
    }

    if (
      sessionState.pendingPrepareHostTurnKey === turnKey ||
      sessionState.lastHandledPrepareHostTurnKey === turnKey
    ) {
      return;
    }

    const recentConversation = sessionState.recentConversation;

    if (!recentConversation) {
      return;
    }

    const scope = sessionState.scopeResolution.scope;
    sessionState.pendingPrepareHostTurnKey = turnKey;

    void getOpenCodePluginMemoryBackend(options)
      .then((backend) =>
        backend.prepareHostTurnMemory({
          task: "Summarize relevant memory context for the latest OpenCode turn.",
          mode: "query",
          recentConversation,
          userId: scope.userId,
          projectId: scope.projectId,
          containerId: scope.containerId,
          sessionId: scope.sessionId ?? sessionState.sessionId,
        }),
      )
      .then((prepareHostTurn) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState || latestSessionState.pendingPrepareHostTurnKey !== turnKey) {
          return;
        }

        latestSessionState.prepareHostTurn = prepareHostTurn;
        latestSessionState.lastHandledPrepareHostTurnKey = turnKey;
      })
      .catch((error) =>
        logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "warn",
          message: "OpenCode plugin session.idle persistence failed open.",
          extra: {
            sessionId: sessionState.sessionId,
            turnKey,
            error: toErrorMessage(error),
          },
        }),
      )
      .finally(() => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState || latestSessionState.pendingPrepareHostTurnKey !== turnKey) {
          return;
        }

        latestSessionState.pendingPrepareHostTurnKey = undefined;
      });
  };

  return {
    messageDebounceMs,
    ensureBackend: () => getOpenCodePluginMemoryBackend(options),
    handleEvent: async (event) => {
      switch (event.type) {
        case "session.created": {
          await handleSessionCreatedEvent(event, "event");
          return;
        }

        case "message.updated": {
          await handleMessageUpdatedEvent(event, "event");
          return;
        }

        case "session.idle": {
          await handleSessionIdleEvent(event, "event");
          return;
        }

        default: {
          await routeEvent(event, "event");
        }
      }
    },
    handleSessionCreated: (event) => handleSessionCreatedEvent(event, "session.created"),
    handleMessageUpdated: (event) => handleMessageUpdatedEvent(event, "message.updated"),
    handleSessionIdle: (event) => handleSessionIdleEvent(event, "session.idle"),
    handleExperimentalSessionCompacting: async (input, _output) => {
      const event = createCompactionEvent(input);
      const sessionState = await routeEvent(event, "experimental.session.compacting");

      if (!sessionState) {
        await logCompactionOutcome(context, "skipped", {
          reason: "missing_session_state",
        });
        return;
      }

      const continuityBlock = buildCompactionContinuityBlock(sessionState);

      if (!continuityBlock) {
        await logCompactionOutcome(context, "skipped", {
          sessionId: sessionState.sessionId,
          reason: "missing_cached_session_state",
        });
        return;
      }

      if (toNonEmptyString(_output.prompt)) {
        await logCompactionOutcome(context, "degraded", {
          sessionId: sessionState.sessionId,
          reason: "output_prompt_already_set",
        });
        return;
      }

      const contextAppender = asCompactionContextAppender(_output.context);

      if (!contextAppender) {
        await logCompactionOutcome(context, "degraded", {
          sessionId: sessionState.sessionId,
          reason: "output_context_not_appendable",
        });
        return;
      }

      try {
        contextAppender.push(continuityBlock);
        await logCompactionOutcome(context, "invoked", {
          sessionId: sessionState.sessionId,
          reason: "cached_session_state_appended",
        });
      } catch (error) {
        await logCompactionOutcome(context, "error", {
          sessionId: sessionState.sessionId,
          reason: "context_append_failed",
          error: toErrorMessage(error),
        });
      }
    },
    readMemoryContext: async (toolContext) => {
      const sessionId =
        resolveSessionIdFromUnknown(toolContext) ??
        resolveSessionIdFromUnknown(toolContext.properties);

      return buildMemoryContextResult(runtimeState, sessionId);
    },
  };
}

export function getOpenCodePluginMemoryBackend(
  options: OpenCodePluginServerOptions = {},
): Promise<OpenCodePluginMemoryBackend> {
  if (options.__test?.memory) {
    return Promise.resolve(options.__test.memory);
  }

  return getOrCreateSingletonMemoryBackend(options.__test?.createMemoryBackend ?? createDefaultMemoryBackend);
}

export function resetOpenCodePluginMemoryBackendSingletonForTests(): void {
  singletonMemoryBackendPromise = undefined;

  if (singletonRuntimeState) {
    for (const sessionState of singletonRuntimeState.sessions.values()) {
      if (sessionState.pendingMessageDebounce) {
        clearTimeout(sessionState.pendingMessageDebounce);
      }
    }
  }

  singletonRuntimeState = undefined;
}

async function createDefaultMemoryBackend(): Promise<OpenCodePluginMemoryBackend> {
  return await MemoryService.create();
}

function getOrCreateSingletonMemoryBackend(
  createMemoryBackend: () => Promise<OpenCodePluginMemoryBackend>,
): Promise<OpenCodePluginMemoryBackend> {
  if (!singletonMemoryBackendPromise) {
    singletonMemoryBackendPromise = createMemoryBackend().catch((error) => {
      singletonMemoryBackendPromise = undefined;
      throw error;
    });
  }

  return singletonMemoryBackendPromise;
}

function getOrCreateSingletonRuntimeState(): OpenCodePluginRuntimeState {
  if (!singletonRuntimeState) {
    singletonRuntimeState = {
      sessions: new Map<string, OpenCodePluginSessionState>(),
    };
  }

  return singletonRuntimeState;
}

function syncSessionStateFromEvent(
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
  const nextState: OpenCodePluginSessionState = {
    sessionId,
    scopeResolution,
    lastEventType: event.type,
    lastUpdatedAt: new Date().toISOString(),
    lastMessageId: nextMessageId,
    recentConversation: resolveRecentConversationForEvent(event, existingState, nextMessageId),
    messageVersion:
      event.type === "message.updated"
        ? (existingState?.messageVersion ?? 0) + 1
        : (existingState?.messageVersion ?? 0),
    messageDebounceMs,
    hasStartedWakeUp: existingState?.hasStartedWakeUp ?? false,
    pendingMessageDebounce: existingState?.pendingMessageDebounce,
    pendingWakeUp: existingState?.pendingWakeUp,
    pendingPrepareHostTurnKey: existingState?.pendingPrepareHostTurnKey,
    lastHandledPrepareHostTurnKey: existingState?.lastHandledPrepareHostTurnKey,
    wakeUp: existingState?.wakeUp,
    prepareTurn: event.type === "message.updated" ? undefined : existingState?.prepareTurn,
    prepareHostTurn: existingState?.prepareHostTurn,
  };

  runtimeState.sessions.set(sessionId, nextState);
  runtimeState.latestSessionId = sessionId;

  return nextState;
}

function buildMemoryContextResult(
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
      cached: {
        ...(sessionState.wakeUp ? { wakeUp: sessionState.wakeUp } : {}),
        ...(sessionState.prepareTurn ? { prepareTurn: sessionState.prepareTurn } : {}),
        ...(sessionState.prepareHostTurn ? { prepareHostTurn: sessionState.prepareHostTurn } : {}),
      },
    },
  };
}

function createCompactionEvent(input: OpenCodePluginCompactionInput): OpenCodePluginEvent {
  const properties = asRecord(input.properties);
  const sessionId =
    toNonEmptyString(input.sessionID) ??
    toNonEmptyString(asRecord(input.info)?.id) ??
    toNonEmptyString(properties?.sessionID) ??
    toNonEmptyString(asRecord(properties?.info)?.id);

  return {
    type: "experimental.session.compacting",
    properties: {
      ...(sessionId ? { sessionID: sessionId } : {}),
    },
  };
}

function resolveSessionIdFromUnknown(value: unknown): string | undefined {
  const record = asRecord(value);

  return (
    toNonEmptyString(record?.sessionID) ??
    toNonEmptyString(asRecord(record?.info)?.id) ??
    toNonEmptyString(asRecord(record?.properties)?.sessionID) ??
    toNonEmptyString(asRecord(asRecord(record?.properties)?.info)?.id)
  );
}

function resolveMessageId(event: OpenCodePluginEvent): string | undefined {
  return toNonEmptyString(asRecord(event.properties)?.messageID);
}

function resolveRecentConversationForEvent(
  event: OpenCodePluginEvent,
  existingState: OpenCodePluginSessionState | undefined,
  nextMessageId: string | undefined,
): string | undefined {
  if (event.type !== "message.updated") {
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

function extractRecentConversation(event: OpenCodePluginEvent): string | undefined {
  const properties = asRecord(event.properties);
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

function buildPrepareHostTurnKey(sessionState: OpenCodePluginSessionState): string | undefined {
  if (sessionState.lastMessageId) {
    return `message:${sessionState.lastMessageId}`;
  }

  if (sessionState.messageVersion > 0) {
    return `version:${sessionState.messageVersion}`;
  }

  return undefined;
}

function buildCompactionContinuityBlock(sessionState: OpenCodePluginSessionState): string | undefined {
  const sections = [
    sessionState.wakeUp
      ? `### Session wake-up\n${sessionState.wakeUp.wakeUpContext}`
      : undefined,
    sessionState.prepareTurn
      ? `### Latest turn precompute\n${sessionState.prepareTurn.context}`
      : undefined,
    sessionState.prepareHostTurn
      ? `### Latest idle persistence\n${sessionState.prepareHostTurn.context}`
      : undefined,
  ].filter((section): section is string => Boolean(section));

  if (sections.length === 0) {
    return undefined;
  }

  return [`## Cached memory continuity`, ...sections].join("\n\n");
}

function asCompactionContextAppender(value: unknown): { push: (entry: string) => void } | undefined {
  if (Array.isArray(value)) {
    return {
      push: (entry) => {
        value.push(entry);
      },
    };
  }

  const record = asRecord(value);
  const push = record?.push;

  if (typeof push !== "function") {
    return undefined;
  }

  return {
    push: (entry) => {
      push.call(value, entry);
    },
  };
}

async function logCompactionOutcome(
  context: OpenCodePluginContext,
  outcome: "invoked" | "skipped" | "degraded" | "error",
  extra: Record<string, unknown>,
): Promise<void> {
  await logPluginLifecycle(context, {
    service: "opencode-memory-plugin",
    level: outcome === "error" ? "warn" : "info",
    message: `OpenCode plugin experimental.session.compacting ${outcome}.`,
    extra,
  });
}

async function logPluginLifecycle(
  context: OpenCodePluginContext,
  entry: {
    readonly service: string;
    readonly level: "debug" | "info" | "warn" | "error";
    readonly message: string;
    readonly extra?: Record<string, unknown>;
  },
): Promise<void> {
  const appClient = asRecord(context.client)?.app;
  const log = asRecord(appClient)?.log;

  if (typeof log !== "function") {
    return;
  }

  await log({
    body: entry,
  });
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
