import type { ZodRawShape } from "zod";
import type { Hooks, PluginOptions } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";

import type { OpenCodePluginContext, OpenCodePluginEvent } from "./resolve-scope.js";
import {
  applyCompactionContinuity,
  createCompactionEvent,
  type OpenCodePluginCompactionInput,
  type OpenCodePluginCompactionOutput,
} from "./runtime-compaction.js";
import {
  getOpenCodePluginMemoryBackend,
  resetOpenCodePluginMemoryBackendSingletonForTests as resetMemoryBackendSingletonForTests,
  type OpenCodePluginMemoryBackend,
  type OpenCodePluginTestOptions,
} from "./runtime-backend.js";
import { logPluginLifecycle, toErrorMessage } from "./runtime-logging.js";
import {
  buildMemoryContextResult,
  buildPrepareHostTurnKey,
  extractRecentConversation,
  getOrCreateSingletonRuntimeState,
  resetOpenCodePluginRuntimeStateForTests,
  resolveSessionIdFromUnknown,
  syncSessionStateFromEvent,
  type OpenCodePluginMemoryContextResult,
  type OpenCodePluginSessionState,
} from "./runtime-state.js";

export interface OpenCodePluginToolExecutionContext {
  readonly sessionID?: ToolContext["sessionID"];
  readonly messageID?: ToolContext["messageID"];
  readonly agent?: ToolContext["agent"];
  readonly directory?: ToolContext["directory"];
  readonly worktree?: ToolContext["worktree"];
  readonly abort?: ToolContext["abort"];
  readonly metadata?: ToolContext["metadata"];
  readonly ask?: ToolContext["ask"];
  readonly info?: unknown;
  readonly properties?: Record<string, unknown>;
}

export interface OpenCodePluginToolDefinition {
  readonly description: string;
  readonly args: ZodRawShape;
  readonly execute: (
    args: Record<string, unknown>,
    context: OpenCodePluginToolExecutionContext,
  ) => Promise<unknown>;
}

export interface OpenCodePluginHooks extends Omit<Hooks, "event" | "tool" | "experimental.session.compacting"> {
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

export interface OpenCodePluginServerOptions {
  readonly [key: string]: PluginOptions[string];
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
    void getOpenCodePluginMemoryBackend(options.__test).catch((error) =>
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
    pendingWakeUp = getOpenCodePluginMemoryBackend(options.__test)
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
      const backend = await getOpenCodePluginMemoryBackend(options.__test);
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

    void getOpenCodePluginMemoryBackend(options.__test)
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
    ensureBackend: () => getOpenCodePluginMemoryBackend(options.__test),
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
    handleExperimentalSessionCompacting: async (input, output) => {
      const event = createCompactionEvent(input);
      const sessionState = await routeEvent(event, "experimental.session.compacting");
      await applyCompactionContinuity(context, sessionState, output);
    },
    readMemoryContext: async (toolContext) => {
      const sessionId =
        resolveSessionIdFromUnknown(toolContext) ??
        resolveSessionIdFromUnknown(toolContext.properties);

      return buildMemoryContextResult(runtimeState, sessionId);
    },
  };
}

export function resetOpenCodePluginMemoryBackendSingletonForTests(): void {
  resetMemoryBackendSingletonForTests();
  resetOpenCodePluginRuntimeStateForTests();
}
