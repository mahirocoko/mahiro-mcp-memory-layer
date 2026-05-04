import type { ZodRawShape } from "zod";
import type { Hooks, PluginOptions } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";

import type { OpenCodePluginContext, OpenCodePluginEvent } from "./resolve-scope.js";
import type { OpenCodePluginConfig } from "./config.js";
import {
  applyCompactionContinuity,
  createCompactionEvent,
  type OpenCodePluginCompactionInput,
  type OpenCodePluginCompactionOutput,
} from "./runtime-compaction.js";
import {
  getOpenCodePluginMemoryBackend,
  resetOpenCodePluginMemoryBackendSingleton,
  resetOpenCodePluginMemoryBackendSingletonForTests as resetMemoryBackendSingletonForTests,
  type OpenCodePluginMemoryBackend,
  type OpenCodePluginTestOptions,
} from "./runtime-backend.js";
import { logPluginLifecycle, toErrorMessage } from "./runtime-logging.js";
import {
  buildOpenCodePluginStartupBrief,
  resolveOpenCodePluginRuntimeCapabilities,
  type OpenCodePluginRuntimeCapabilities,
} from "./runtime-capabilities.js";
import {
  buildMemoryContextResult,
  buildPrepareHostTurnKey,
  clearOpenCodePluginRuntimeState,
  extractRecentConversation,
  getOrCreateSingletonRuntimeState,
  markMemoryLifecycleDiagnostic,
  resetOpenCodePluginRuntimeStateForTests,
  resolveSessionIdFromUnknown,
  syncSessionStateFromEvent,
  type OpenCodePluginMemoryContextResult,
  type OpenCodePluginMemoryLifecycleDiagnosticReasonCode,
  type OpenCodePluginMemoryLifecycleSummaryCounts,
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
  readonly config: OpenCodePluginConfig;
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
  readonly inspectMemoryRetrieval: (
    args: Record<string, unknown>,
    context: OpenCodePluginToolExecutionContext,
  ) => Promise<unknown>;
  readonly readRuntimeCapabilities: () => Promise<OpenCodePluginRuntimeCapabilities>;
  readonly resetMemoryStorage: () => Promise<unknown>;
}

export function createOpenCodePluginRuntime(
  context: OpenCodePluginContext,
  options: OpenCodePluginServerOptions,
  config: OpenCodePluginConfig,
): OpenCodePluginRuntime {
  const runtimeState = getOrCreateSingletonRuntimeState();
  const runtimeCapabilitiesPromise = resolveOpenCodePluginRuntimeCapabilities();

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

    return syncSessionStateFromEvent(
      runtimeState,
      context,
      event,
      config.runtime.messageDebounceMs,
    );
  };

  const startSessionWakeUp = (sessionState: OpenCodePluginSessionState | undefined): void => {
    if (!sessionState) {
      return;
    }

    if (sessionState.hasStartedWakeUp || sessionState.wakeUp) {
      markMemoryLifecycleDiagnostic(sessionState, "session-start-wake-up", {
        status: "skipped",
        reasonCode: "already_started_or_cached",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    const wakeUpScope = sessionState.scopeResolution.scope;
    let pendingWakeUp: Promise<void>;

    sessionState.hasStartedWakeUp = true;
    void logPluginLifecycle(context, {
      service: "opencode-memory-plugin",
      level: "debug",
      message: "OpenCode plugin session-start wake-up started.",
      extra: {
        sessionId: sessionState.sessionId,
        projectId: wakeUpScope.projectId,
        containerId: wakeUpScope.containerId,
        scopeSessionId: wakeUpScope.sessionId,
        hasStartedWakeUpBeforeStart: false,
      },
    });
    const wakeUpPromise = getOpenCodePluginMemoryBackend(options.__test).then((backend) =>
      backend.wakeUpMemory(
        {
          projectId: wakeUpScope.projectId,
          containerId: wakeUpScope.containerId,
        },
        {
          surface: "opencode-plugin",
          trigger: "session-start",
          phase: "wake-up",
        },
      ),
    );

    void runtimeCapabilitiesPromise
      .then((capabilities) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState) {
          return;
        }

        const startupBrief = buildOpenCodePluginStartupBrief(capabilities);
        latestSessionState.capabilities = capabilities;
        latestSessionState.memoryProtocol = capabilities.memory.memoryProtocol;
        latestSessionState.startupBrief = startupBrief;
        if (latestSessionState.wakeUp) {
          latestSessionState.wakeUp = {
            ...latestSessionState.wakeUp,
            wakeUpContext: prependStartupBrief(latestSessionState.wakeUp.wakeUpContext, startupBrief),
          };
        }
      })
      .catch((error) =>
        logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "warn",
          message: "OpenCode plugin runtime capability detection failed open.",
          extra: {
            sessionId: sessionState.sessionId,
            error: toErrorMessage(error),
          },
        }),
      );

    pendingWakeUp = wakeUpPromise
      .then((wakeUp) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState) {
          void logPluginLifecycle(context, {
            service: "opencode-memory-plugin",
            level: "debug",
            message: "OpenCode plugin session-start wake-up dropped before cache write.",
            extra: {
              sessionId: sessionState.sessionId,
              sessionStillPresent: false,
            },
          });
          return;
        }

        const hadCachedWakeUpBeforeWrite = Boolean(latestSessionState.wakeUp);
        latestSessionState.wakeUp = {
          ...wakeUp,
          wakeUpContext: prependStartupBrief(wakeUp.wakeUpContext, latestSessionState.startupBrief),
        };
        markMemoryLifecycleDiagnostic(latestSessionState, "session-start-wake-up", {
          status: "succeeded",
          reasonCode: "cache_write_completed",
          scopeUsed: wakeUpScope,
          summaryCounts: {
            retrieved: wakeUp.profile.items.length + wakeUp.recent.items.length,
          },
        });

        void logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "debug",
          message: "OpenCode plugin session-start wake-up cached.",
          extra: {
            sessionId: sessionState.sessionId,
            sessionStillPresent: true,
            hadCachedWakeUpBeforeWrite,
            hasCachedWakeUpAfterWrite: Boolean(latestSessionState.wakeUp),
          },
        });
      })
      .catch((error) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (latestSessionState) {
          markMemoryLifecycleDiagnostic(latestSessionState, "session-start-wake-up", {
            status: "failed_open",
            reasonCode: "backend_error",
            scopeUsed: wakeUpScope,
          });
        }

        return logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "warn",
          message: "OpenCode plugin session-start wake-up failed open.",
          extra: {
            sessionId: sessionState.sessionId,
            error: toErrorMessage(error),
          },
        });
      })
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
    trigger: "message.updated" | "message.part.updated",
  ): Promise<void> => {
    const currentSessionState = runtimeState.sessions.get(sessionId);

    if (!currentSessionState) {
      return;
    }

    if (currentSessionState.pendingMessageDebounce !== timer) {
      markMemoryLifecycleDiagnostic(currentSessionState, "turn-preflight", {
        status: "skipped",
        reasonCode: "stale_lifecycle_result",
        scopeUsed: currentSessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    currentSessionState.pendingMessageDebounce = undefined;

    const scope = currentSessionState.scopeResolution.scope;
    const routing = resolveMemoryPreflightRouting(recentConversation);

    if (!routing.shouldRun) {
      markMemoryLifecycleDiagnostic(currentSessionState, "turn-preflight", {
        status: "skipped",
        reasonCode: "preflight_not_needed",
        scopeUsed: scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    try {
      const backend = await getOpenCodePluginMemoryBackend(options.__test);
      const prepareTurn = await backend.prepareTurnMemory(
        {
          task: routing.task,
          mode: "query",
          recentConversation,
          projectId: scope.projectId,
          containerId: scope.containerId,
        },
        {
          surface: "opencode-plugin",
          trigger,
          phase: "turn-preflight",
        },
      );
      const latestSessionState = runtimeState.sessions.get(sessionId);

      if (!latestSessionState) {
        return;
      }

      if (latestSessionState.messageVersion !== scheduledVersion) {
        markMemoryLifecycleDiagnostic(latestSessionState, "turn-preflight", {
          status: "skipped",
          reasonCode: "stale_lifecycle_result",
          scopeUsed: latestSessionState.scopeResolution.scope,
          summaryCounts: { skipped: 1 },
        });
        return;
      }

      latestSessionState.prepareTurn = prepareTurn;
      markMemoryLifecycleDiagnostic(latestSessionState, "turn-preflight", {
        status: "succeeded",
        reasonCode: "cache_write_completed",
        scopeUsed: scope,
        summaryCounts: summarizePrepareTurnResult(prepareTurn),
      });
    } catch (error) {
      const latestSessionState = runtimeState.sessions.get(sessionId);

      if (latestSessionState) {
        markMemoryLifecycleDiagnostic(latestSessionState, "turn-preflight", {
          status: "failed_open",
          reasonCode: "backend_error",
          scopeUsed: scope,
        });
      }

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
      markMemoryLifecycleDiagnostic(sessionState, "turn-preflight", {
        status: "skipped",
        reasonCode: "empty_recent_conversation",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => {
      void runMessageUpdatedPrecompute(
        sessionState.sessionId,
        sessionState.messageVersion,
        recentConversation,
        timer,
        event.type === "message.part.updated" ? "message.part.updated" : "message.updated",
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
      markMemoryLifecycleDiagnostic(sessionState, "idle-persistence", {
        status: "skipped",
        reasonCode: "missing_turn_key",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    if (
      sessionState.pendingPrepareHostTurnKey === turnKey ||
      sessionState.lastHandledPrepareHostTurnKey === turnKey
    ) {
      markMemoryLifecycleDiagnostic(sessionState, "idle-persistence", {
        status: "skipped",
        reasonCode: "deduped_turn",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    const recentConversation = sessionState.recentConversation;

    if (!recentConversation) {
      markMemoryLifecycleDiagnostic(sessionState, "idle-persistence", {
        status: "skipped",
        reasonCode: "empty_recent_conversation",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    const routing = resolveMemoryPreflightRouting(recentConversation);

    if (!routing.shouldRun) {
      markMemoryLifecycleDiagnostic(sessionState, "idle-persistence", {
        status: "skipped",
        reasonCode: routing.skipReason ?? "preflight_not_needed",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    if (sessionState.scopeResolution.status !== "complete") {
      markMemoryLifecycleDiagnostic(sessionState, "idle-persistence", {
        status: "skipped",
        reasonCode: "incomplete_scope",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return;
    }

    const scope = sessionState.scopeResolution.scope;
    sessionState.pendingPrepareHostTurnKey = turnKey;

    void getOpenCodePluginMemoryBackend(options.__test)
      .then((backend) =>
        backend.prepareHostTurnMemory(
          {
            task: routing.task,
            mode: "query",
            recentConversation,
            projectId: scope.projectId,
            containerId: scope.containerId,
          },
          {
            surface: "opencode-plugin",
            trigger: event.type === "session.idle" ? "session.idle" : "session.idle:event",
            phase: "host-turn-persistence",
          },
        ),
      )
      .then((prepareHostTurn) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState) {
          return;
        }

        if (
          latestSessionState.pendingPrepareHostTurnKey !== turnKey ||
          buildPrepareHostTurnKey(latestSessionState) !== turnKey
        ) {
          markMemoryLifecycleDiagnostic(latestSessionState, "idle-persistence", {
            status: "skipped",
            reasonCode: "stale_lifecycle_result",
            scopeUsed: latestSessionState.scopeResolution.scope,
            summaryCounts: { skipped: 1 },
          });
          return;
        }

        latestSessionState.prepareHostTurn = prepareHostTurn;
        latestSessionState.prepareHostTurnKey = turnKey;
        latestSessionState.lastHandledPrepareHostTurnKey = turnKey;
        const persistenceDiagnostic = summarizePrepareHostTurnPersistenceResult(prepareHostTurn);
        markMemoryLifecycleDiagnostic(latestSessionState, "idle-persistence", {
          status: persistenceDiagnostic.status,
          reasonCode: persistenceDiagnostic.reasonCode,
          scopeUsed: scope,
          summaryCounts: persistenceDiagnostic.summaryCounts,
        });
      })
      .catch((error) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (latestSessionState) {
          markMemoryLifecycleDiagnostic(latestSessionState, "idle-persistence", {
            status: "failed_open",
            reasonCode: "backend_failed_open",
            scopeUsed: scope,
          });
        }

        return logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "warn",
          message: "OpenCode plugin session.idle persistence failed open.",
          extra: {
            sessionId: sessionState.sessionId,
            turnKey,
            error: toErrorMessage(error),
          },
        });
      })
      .finally(() => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState || latestSessionState.pendingPrepareHostTurnKey !== turnKey) {
          return;
        }

        latestSessionState.pendingPrepareHostTurnKey = undefined;
      });
  };

  const prepareCompactionCheckpoint = async (
    sessionState: OpenCodePluginSessionState | undefined,
  ): Promise<{ readonly preserveAppendDiagnostic: boolean }> => {
    if (!sessionState) {
      return { preserveAppendDiagnostic: false };
    }

    if (sessionState.scopeResolution.status !== "complete") {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "skipped",
        reasonCode: "incomplete_scope",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return { preserveAppendDiagnostic: true };
    }

    const turnKey = buildPrepareHostTurnKey(sessionState);

    if (!turnKey) {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "skipped",
        reasonCode: "missing_turn_key",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return { preserveAppendDiagnostic: true };
    }

    if (sessionState.prepareHostTurn && sessionState.prepareHostTurnKey === turnKey) {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "succeeded",
        reasonCode: "cached_checkpoint_reused",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: summarizePrepareTurnResult(sessionState.prepareHostTurn),
      });
      return { preserveAppendDiagnostic: false };
    }

    if (sessionState.prepareTurn) {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "succeeded",
        reasonCode: "cached_checkpoint_reused",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: summarizePrepareTurnResult(sessionState.prepareTurn),
      });
      return { preserveAppendDiagnostic: false };
    }

    if (
      sessionState.pendingPrepareHostTurnKey === turnKey ||
      sessionState.lastHandledPrepareHostTurnKey === turnKey
    ) {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "skipped",
        reasonCode: "deduped_turn",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return { preserveAppendDiagnostic: true };
    }

    const recentConversation = sessionState.recentConversation;

    if (!recentConversation) {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "skipped",
        reasonCode: "empty_recent_conversation",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return { preserveAppendDiagnostic: true };
    }

    const routing = resolveMemoryPreflightRouting(recentConversation);

    if (!routing.shouldRun) {
      markMemoryLifecycleDiagnostic(sessionState, "compaction-continuity", {
        status: "skipped",
        reasonCode: routing.skipReason ?? "preflight_not_needed",
        scopeUsed: sessionState.scopeResolution.scope,
        summaryCounts: { skipped: 1 },
      });
      return { preserveAppendDiagnostic: true };
    }

    const scope = sessionState.scopeResolution.scope;
    sessionState.pendingPrepareHostTurnKey = turnKey;

    try {
      const backend = await getOpenCodePluginMemoryBackend(options.__test);
      const prepareHostTurn = await backend.prepareHostTurnMemory(
        {
          task: routing.task,
          mode: "query",
          recentConversation,
          projectId: scope.projectId,
          containerId: scope.containerId,
        },
        {
          surface: "opencode-plugin",
          trigger: "experimental.session.compacting",
          phase: "compaction-checkpoint",
        },
      );
      const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

      if (!latestSessionState) {
        return { preserveAppendDiagnostic: false };
      }

      if (
        latestSessionState.pendingPrepareHostTurnKey !== turnKey ||
        buildPrepareHostTurnKey(latestSessionState) !== turnKey
      ) {
        markMemoryLifecycleDiagnostic(latestSessionState, "compaction-continuity", {
          status: "skipped",
          reasonCode: "stale_lifecycle_result",
          scopeUsed: latestSessionState.scopeResolution.scope,
          summaryCounts: { skipped: 1 },
        });
        return { preserveAppendDiagnostic: true };
      }

      latestSessionState.prepareHostTurn = prepareHostTurn;
      latestSessionState.prepareHostTurnKey = turnKey;
      latestSessionState.lastHandledPrepareHostTurnKey = turnKey;
      const persistenceDiagnostic = summarizePrepareHostTurnPersistenceResult(prepareHostTurn);
      markMemoryLifecycleDiagnostic(latestSessionState, "compaction-continuity", {
        status: persistenceDiagnostic.status,
        reasonCode: persistenceDiagnostic.reasonCode,
        scopeUsed: scope,
        summaryCounts: persistenceDiagnostic.summaryCounts,
      });
      return { preserveAppendDiagnostic: false };
    } catch (error) {
      const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

      if (latestSessionState) {
        markMemoryLifecycleDiagnostic(latestSessionState, "compaction-continuity", {
          status: "failed_open",
          reasonCode: "backend_failed_open",
          scopeUsed: latestSessionState.scopeResolution.scope,
        });
      }

      await logPluginLifecycle(context, {
        service: "opencode-memory-plugin",
        level: "warn",
        message: "OpenCode plugin compaction checkpoint failed open.",
        extra: {
          sessionId: sessionState.sessionId,
          turnKey,
          error: toErrorMessage(error),
        },
      });
      return { preserveAppendDiagnostic: true };
    } finally {
      const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

      if (latestSessionState?.pendingPrepareHostTurnKey === turnKey) {
        latestSessionState.pendingPrepareHostTurnKey = undefined;
      }
    }
  };

  return {
    messageDebounceMs: config.runtime.messageDebounceMs,
    config,
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

        case "message.part.updated": {
          const sessionState = await routeEvent(event, "event");
          startSessionWakeUp(sessionState);
          scheduleMessageUpdatedPrecompute(sessionState, event);
          return;
        }

        case "session.idle": {
          await handleSessionIdleEvent(event, "event");
          return;
        }

        default: {
          const sessionState = await routeEvent(event, "event");
          startSessionWakeUp(sessionState);
        }
      }
    },
    handleSessionCreated: (event) => handleSessionCreatedEvent(event, "session.created"),
    handleMessageUpdated: (event) => handleMessageUpdatedEvent(event, "message.updated"),
    handleSessionIdle: (event) => handleSessionIdleEvent(event, "session.idle"),
    handleExperimentalSessionCompacting: async (input, output) => {
      const event = createCompactionEvent(input);
      const sessionState = await routeEvent(event, "experimental.session.compacting");
      const checkpoint = await prepareCompactionCheckpoint(sessionState);
      const latestSessionState = sessionState
        ? runtimeState.sessions.get(sessionState.sessionId) ?? sessionState
        : undefined;
      await applyCompactionContinuity(context, latestSessionState, output, {
        preserveExistingDiagnostic: checkpoint.preserveAppendDiagnostic,
      });
    },
    readMemoryContext: async (toolContext) => {
      const sessionId =
        resolveSessionIdFromUnknown(toolContext) ??
        resolveSessionIdFromUnknown(toolContext.properties);

      return buildMemoryContextResult(runtimeState, sessionId);
    },
    inspectMemoryRetrieval: async (args, toolContext) => {
      const backend = await getOpenCodePluginMemoryBackend(options.__test);
      const requestId = typeof args.requestId === "string" ? args.requestId.trim() : undefined;

      if (requestId) {
        return backend.inspectMemoryRetrieval({ requestId });
      }

      const sessionId =
        resolveSessionIdFromUnknown(toolContext) ??
        resolveSessionIdFromUnknown(toolContext.properties);

      if (!sessionId) {
        return backend.inspectMemoryRetrieval({});
      }

      const sessionState = runtimeState.sessions.get(sessionId);
      const scope = sessionState?.scopeResolution.scope;

      if (!scope) {
        return backend.inspectMemoryRetrieval({});
      }

      return backend.inspectMemoryRetrieval({
        latestScopeFilter: {
          projectId: scope.projectId,
          containerId: scope.containerId,
        },
      });
    },
    readRuntimeCapabilities: () => runtimeCapabilitiesPromise,
    resetMemoryStorage: async () => {
      const backend = await getOpenCodePluginMemoryBackend(options.__test);
      const result = await backend.resetStorage();
      resetOpenCodePluginMemoryBackendSingleton();
      clearOpenCodePluginRuntimeState(runtimeState);
      return result;
    },
  };
}


function summarizePrepareTurnResult(
  result: Awaited<ReturnType<OpenCodePluginMemoryBackend["prepareTurnMemory"]>>,
): OpenCodePluginMemoryLifecycleSummaryCounts {
  return {
    retrieved: result.items.length,
    candidates: result.memorySuggestions.candidates.length,
    autoSaved: result.conservativePolicy.autoSaved.length,
    reviewOnly: result.conservativePolicy.reviewOnlySuggestions.length,
    skipped: result.conservativePolicy.autoSaveSkipped.length,
  };
}

function summarizePrepareHostTurnPersistenceResult(
  result: Awaited<ReturnType<OpenCodePluginMemoryBackend["prepareHostTurnMemory"]>>,
): {
  readonly status: "skipped" | "succeeded";
  readonly reasonCode: OpenCodePluginMemoryLifecycleDiagnosticReasonCode;
  readonly summaryCounts: OpenCodePluginMemoryLifecycleSummaryCounts;
} {
  const summaryCounts = summarizePrepareTurnResult(result);
  const policy = result.conservativePolicy;

  if (policy.autoSaved.length > 0) {
    return { status: "succeeded", reasonCode: "auto_saved", summaryCounts };
  }

  if (policy.autoSaveSkipped.length > 0) {
    return { status: "skipped", reasonCode: "auto_save_skipped_incomplete_scope", summaryCounts };
  }

  if (policy.reviewOnlySuggestions.length > 0) {
    return { status: "skipped", reasonCode: "review_only", summaryCounts };
  }

  if (policy.recommendation === "likely_skip") {
    return {
      status: "skipped",
      reasonCode: policy.candidates.length > 0 ? "likely_skip" : "no_candidates",
      summaryCounts,
    };
  }

  if (policy.candidates.length === 0) {
    return { status: "skipped", reasonCode: "no_candidates", summaryCounts };
  }

  return { status: "skipped", reasonCode: "likely_skip", summaryCounts };
}

function prependStartupBrief(wakeUpContext: string, startupBrief: string | undefined): string {
  if (!startupBrief) {
    return wakeUpContext;
  }

  if (wakeUpContext.startsWith("## Runtime startup brief")) {
    return wakeUpContext;
  }

  return `${startupBrief}\n\n---\n\n${wakeUpContext}`;
}

interface MemoryPreflightRouting {
  readonly shouldRun: boolean;
  readonly task: string;
  readonly skipReason?: OpenCodePluginMemoryLifecycleDiagnosticReasonCode;
}

const defaultMemoryPreflightTask =
  "Summarize relevant memory context for the latest OpenCode turn.";

const continuityMemoryPreflightTask =
  "Summarize relevant memory context, prior decisions, and earlier work that help continue the latest OpenCode turn.";

const continuityTaskExcerptMaxChars = 160;

const smallTalkPattern =
  /^(hi|hello|hey|thanks|thank you|thx|ok|okay|cool|nice|great|awesome|test|ping|yo|how are you)([!.?\s]+)?$/i;

const continuitySignalPattern =
  /\b(continue|continuing|continued|resume|resuming|previous|earlier|before|prior|follow[-\s]?up|recap|what happened|what did we|we decided|decision|remember|history|compare|comparison|last time|ongoing)\b/i;

function resolveMemoryPreflightRouting(recentConversation: string): MemoryPreflightRouting {
  const normalizedConversation = recentConversation.trim();

  if (normalizedConversation.length === 0) {
    return {
      shouldRun: false,
      task: defaultMemoryPreflightTask,
      skipReason: "empty_recent_conversation",
    };
  }

  if (smallTalkPattern.test(normalizedConversation)) {
    return {
      shouldRun: false,
      task: defaultMemoryPreflightTask,
      skipReason: "small_talk",
    };
  }

  if (continuitySignalPattern.test(normalizedConversation)) {
    return {
      shouldRun: true,
      task: buildContinuityMemoryPreflightTask(normalizedConversation),
    };
  }

  if (normalizedConversation.length < 5) {
    return {
      shouldRun: false,
      task: defaultMemoryPreflightTask,
      skipReason: "preflight_not_needed",
    };
  }

  return {
    shouldRun: true,
    task: defaultMemoryPreflightTask,
  };
}

function buildContinuityMemoryPreflightTask(recentConversation: string): string {
  const normalizedConversation = recentConversation.replace(/\s+/g, " ").trim();

  if (normalizedConversation.length <= continuityTaskExcerptMaxChars) {
    return `${continuityMemoryPreflightTask} Focus on this live turn: ${normalizedConversation}`;
  }

  return `${continuityMemoryPreflightTask} Focus on this live turn: ${normalizedConversation.slice(0, continuityTaskExcerptMaxChars).trimEnd()}…`;
}

export function resetOpenCodePluginMemoryBackendSingletonForTests(): void {
  resetMemoryBackendSingletonForTests();
  resetOpenCodePluginRuntimeStateForTests();
}
