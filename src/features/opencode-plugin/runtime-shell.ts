import type { ZodRawShape } from "zod";
import type { Hooks, PluginOptions } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import type { RegisteredTool } from "../../lib/mcp/registered-tool.js";

import type { OpenCodePluginContext, OpenCodePluginEvent } from "./resolve-scope.js";
import type { OpenCodePluginConfig } from "./config.js";
import { createOpenCodeAsyncTaskTracker, type OpenCodeAsyncTaskTracker } from "./async-task-reminder-bridge.js";
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
  buildOpenCodePluginStartupBrief,
  resolveOpenCodePluginRuntimeCapabilities,
  resolveOpenCodePluginRuntimeCapabilitiesSync,
  type OpenCodePluginRuntimeCapabilities,
} from "./runtime-capabilities.js";
import { detectOpenCodePluginSessionReminderSupport } from "./session-reminder-support.js";
import { deliverSessionTaskStart } from "./session-task-presenter.js";
import { resolveOpenCodePluginOrchAutoDispatchRequest } from "./orch-auto-dispatch.js";
import { getRegisteredOrchestrationTools } from "../orchestration/mcp/register-tools.js";
import {
  buildMemoryContextResult,
  buildPrepareHostTurnKey,
  extractRecentConversation,
  getOrCreateSingletonRuntimeState,
  resetOpenCodePluginRuntimeStateForTests,
  resolveSessionIdFromUnknown,
  syncSessionStateFromEvent,
  type OpenCodePluginMemoryContextResult,
  type OpenCodePluginOperatorState,
  type OpenCodePluginOperatorTaskLedgerEntry,
  type OpenCodePluginOrchMode,
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
  readonly orchestrationFacadeAvailable: boolean;
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
  readonly trackAsyncTaskStart: (
    result: unknown,
    context: OpenCodePluginToolExecutionContext,
    metadata?: {
      readonly toolName: string;
      readonly args: Record<string, unknown>;
    },
  ) => Promise<void>;
  readonly markOrchestrationTaskVerification: (
    args: Record<string, unknown>,
    context: OpenCodePluginToolExecutionContext,
  ) => Promise<unknown>;
  readonly readRuntimeCapabilities: () => Promise<OpenCodePluginRuntimeCapabilities>;
}

interface OpenCodePluginStartAgentTaskExecutor {
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export function createOpenCodePluginRuntime(
  context: OpenCodePluginContext,
  options: OpenCodePluginServerOptions,
  config: OpenCodePluginConfig,
): OpenCodePluginRuntime {
  const runtimeState = getOrCreateSingletonRuntimeState();
  const sessionReminderSupport = detectOpenCodePluginSessionReminderSupport(context, {
    sessionVisibleRemindersAvailable: options.__test?.sessionVisibleRemindersAvailable,
  });
  const startAgentTaskTool = getStartAgentTaskExecutor();
  const syncCapabilities = resolveOpenCodePluginRuntimeCapabilitiesSync({
    standaloneMcpAvailable: options.__test?.standaloneMcpAvailable,
    sessionReminderSupport,
    facadeConfig: {
      remindersEnabled: config.runtime.remindersEnabled,
      categoryRoutes: config.routing.categoryRoutes,
    },
  });
  const runtimeCapabilitiesPromise = resolveOpenCodePluginRuntimeCapabilities({
    standaloneMcpAvailable: syncCapabilities.orchestration.available,
    sessionReminderSupport,
    facadeConfig: {
      remindersEnabled: config.runtime.remindersEnabled,
      categoryRoutes: config.routing.categoryRoutes,
    },
  });
  const asyncTaskTracker: OpenCodeAsyncTaskTracker = createOpenCodeAsyncTaskTracker({
    context,
    capabilities: () => runtimeCapabilitiesPromise,
    remindersEnabled: config.runtime.remindersEnabled,
    onReminder: async (reminder) => {
      const sessionState = runtimeState.sessions.get(reminder.parentSessionId);

      if (!sessionState) {
        return;
      }

      const operator = getOrCreateOperatorState(sessionState);
      const existingTask = operator.tasks[reminder.requestId];

      if (!existingTask) {
        return;
      }

      const updatedAt = new Date().toISOString();
      const operatorStatus = reminder.status === "completed" ? "awaiting_resume" : "needs_attention";

      sessionState.operator = {
        ...operator,
        lastOperatorUpdateAt: updatedAt,
        tasks: {
          ...operator.tasks,
          [reminder.requestId]: {
            requestId: reminder.requestId,
            ...(existingTask.taskId || reminder.taskId ? { taskId: existingTask.taskId ?? reminder.taskId } : {}),
            resultTool: reminder.resultTool,
            verificationPolicy: existingTask.verificationPolicy,
            verificationRequired: existingTask.verificationRequired,
            startedAt: existingTask.startedAt,
            updatedAt,
            workflowStatus: reminder.status,
            operatorStatus,
            reminderToken: reminder.reminderToken,
            reminderStatus: reminder.status,
            ...(operatorStatus === "needs_attention"
              ? { attentionReason: `workflow_terminal_status:${reminder.status}` }
              : {}),
          },
        },
      };
    },
  });

  const trackAutoDispatchedTaskStart = async (
    sessionState: OpenCodePluginSessionState,
    result: unknown,
    prompt: string,
    sourceMessageId: string,
  ): Promise<void> => {
    const resultRecord =
      typeof result === "object" && result !== null ? (result as Record<string, unknown>) : undefined;
    const requestId = typeof resultRecord?.requestId === "string" ? resultRecord.requestId : undefined;
    const taskId = typeof resultRecord?.taskId === "string" ? resultRecord.taskId : undefined;

    applyOperatorTaskUpdate(sessionState, resultRecord, {
      toolName: "start_agent_task",
      args: {
        category: "unspecified-high",
        prompt,
        cwd: context.directory,
      },
    });

    if (requestId && sessionState.lastPresentedTaskStartMessageId !== sourceMessageId) {
      try {
        await deliverSessionTaskStart({
          context,
          support: sessionReminderSupport,
          sessionId: sessionState.sessionId,
          requestId,
          taskId,
          prompt,
        });
      } catch {
        // fail open: the task already started and should not respawn on a repeated same-message event
      } finally {
        sessionState.lastPresentedTaskStartMessageId = sourceMessageId;
      }
    }

    await asyncTaskTracker.trackAsyncTask({
      parentSessionId: sessionState.sessionId,
      requestId,
      taskId,
      status: typeof resultRecord?.status === "string" ? resultRecord.status : undefined,
      resultTool: typeof resultRecord?.pollWith === "string" ? resultRecord.pollWith : undefined,
    });
  };

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
    const sessionState = syncSessionStateFromEvent(
      runtimeState,
        context,
        event,
        config.runtime.messageDebounceMs,
        config.runtime.userId,
      );
    return sessionState;
  };

  const startSessionWakeUp = (sessionState: OpenCodePluginSessionState | undefined): void => {
    if (!sessionState || sessionState.hasStartedWakeUp || sessionState.wakeUp) {
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
        userId: wakeUpScope.userId,
        projectId: wakeUpScope.projectId,
        containerId: wakeUpScope.containerId,
        scopeSessionId: wakeUpScope.sessionId ?? sessionState.sessionId,
        hasStartedWakeUpBeforeStart: false,
      },
    });
    const wakeUpPromise = getOpenCodePluginMemoryBackend(options.__test).then((backend) =>
      backend.wakeUpMemory({
        userId: wakeUpScope.userId,
        projectId: wakeUpScope.projectId,
        containerId: wakeUpScope.containerId,
        sessionId: wakeUpScope.sessionId ?? sessionState.sessionId,
      }, {
        surface: "opencode-plugin",
        trigger: "session-start",
        phase: "wake-up",
      }),
    );

    void runtimeCapabilitiesPromise
      .then((capabilities) => {
        const latestSessionState = runtimeState.sessions.get(sessionState.sessionId);

        if (!latestSessionState) {
          return;
        }

        const startupBrief = buildOpenCodePluginStartupBrief(capabilities);
        latestSessionState.capabilities = capabilities;
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
      .catch((error) =>
        logPluginLifecycle(context, {
          service: "opencode-memory-plugin",
          level: "warn",
          message: "OpenCode plugin session-start wake-up failed open.",
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
    trigger: "message.updated" | "message.part.updated",
  ): Promise<void> => {
    const currentSessionState = runtimeState.sessions.get(sessionId);

    if (!currentSessionState || currentSessionState.pendingMessageDebounce !== timer) {
      return;
    }

    currentSessionState.pendingMessageDebounce = undefined;

    const scope = currentSessionState.scopeResolution.scope;
    const routing = resolveMemoryPreflightRouting(recentConversation);

    if (!routing.shouldRun) {
      return;
    }

    try {
      const backend = await getOpenCodePluginMemoryBackend(options.__test);
      const prepareTurn = await backend.prepareTurnMemory({
        task: routing.task,
        mode: "query",
        recentConversation,
        userId: scope.userId,
        projectId: scope.projectId,
        containerId: scope.containerId,
        sessionId: scope.sessionId ?? sessionId,
      }, {
        surface: "opencode-plugin",
        trigger,
        phase: "turn-preflight",
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
    updateOperatorModeFromRecentConversation(sessionState, extractRecentConversation(event));
    await maybeAutoDispatchOrchTask(
      sessionState,
      startAgentTaskTool,
      syncCapabilities.orchestration.available,
      context.directory,
      sessionReminderSupport,
      trackAutoDispatchedTaskStart,
    );
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

    const routing = resolveMemoryPreflightRouting(recentConversation);

    if (!routing.shouldRun) {
      return;
    }

    const scope = sessionState.scopeResolution.scope;
    sessionState.pendingPrepareHostTurnKey = turnKey;

    void getOpenCodePluginMemoryBackend(options.__test)
      .then((backend) =>
        backend.prepareHostTurnMemory({
          task: routing.task,
          mode: "query",
          recentConversation,
          userId: scope.userId,
          projectId: scope.projectId,
          containerId: scope.containerId,
          sessionId: scope.sessionId ?? sessionState.sessionId,
        }, {
          surface: "opencode-plugin",
          trigger: event.type === "session.idle" ? "session.idle" : "session.idle:event",
          phase: "host-turn-persistence",
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
    messageDebounceMs: config.runtime.messageDebounceMs,
    config,
    orchestrationFacadeAvailable: syncCapabilities.orchestration.available,
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
      await applyCompactionContinuity(context, sessionState, output);
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
          userId: scope.userId,
          projectId: scope.projectId,
          containerId: scope.containerId,
          sessionId: scope.sessionId,
        },
      });
    },
    trackAsyncTaskStart: async (result, toolContext, metadata) => {
      const resultRecord =
        typeof result === "object" && result !== null ? (result as Record<string, unknown>) : undefined;
      const parentSessionId =
        resolveSessionIdFromUnknown(toolContext) ?? resolveSessionIdFromUnknown(toolContext.properties);

      if (parentSessionId) {
        const sessionState = runtimeState.sessions.get(parentSessionId);

        if (sessionState) {
          applyOperatorTaskUpdate(sessionState, resultRecord, metadata);
        }
      }

      await asyncTaskTracker.trackAsyncTask({
        parentSessionId,
        requestId: typeof resultRecord?.requestId === "string" ? resultRecord.requestId : undefined,
        taskId: typeof resultRecord?.taskId === "string" ? resultRecord.taskId : undefined,
        status: typeof resultRecord?.status === "string" ? resultRecord.status : undefined,
        resultTool: typeof resultRecord?.pollWith === "string" ? resultRecord.pollWith : undefined,
      });
    },
    markOrchestrationTaskVerification: async (args, toolContext) => {
      const sessionId =
        resolveSessionIdFromUnknown(toolContext) ?? resolveSessionIdFromUnknown(toolContext.properties);

      if (!sessionId) {
        return {
          status: "missing_session",
        };
      }

      const sessionState = runtimeState.sessions.get(sessionId);

      if (!sessionState?.operator) {
        return {
          status: "missing_operator_state",
          sessionId,
        };
      }

      const requestId = typeof args.requestId === "string" ? args.requestId.trim() : "";
      const outcome = typeof args.outcome === "string" ? args.outcome.trim() : "";
      const note = typeof args.note === "string" ? args.note.trim() : undefined;

      if (!requestId || (outcome !== "completed" && outcome !== "needs_attention")) {
        return {
          status: "invalid_input",
          sessionId,
        };
      }

      const existingTask = sessionState.operator.tasks[requestId];

      if (!existingTask) {
        return {
          status: "task_not_found",
          sessionId,
          requestId,
        };
      }

      const updatedAt = new Date().toISOString();
      sessionState.operator = {
        ...sessionState.operator,
        lastOperatorUpdateAt: updatedAt,
        tasks: {
          ...sessionState.operator.tasks,
          [requestId]: {
            ...existingTask,
            updatedAt,
            operatorStatus: outcome,
            ...(note ? { verificationNote: note } : {}),
            ...(outcome === "needs_attention" ? { attentionReason: note ?? "verification_failed" } : {}),
          },
        },
      };

      return {
        status: "updated",
        sessionId,
        requestId,
        operatorStatus: outcome,
        updatedAt,
        ...(note ? { note } : {}),
      };
    },
    readRuntimeCapabilities: () => runtimeCapabilitiesPromise,
  };
}

function getOrCreateOperatorState(sessionState: OpenCodePluginSessionState): OpenCodePluginOperatorState {
  if (sessionState.operator) {
    return sessionState.operator;
  }

  const operator: OpenCodePluginOperatorState = {
    stickyModeEnabled: false,
    currentMode: "off",
    tasks: {},
  };
  sessionState.operator = operator;
  return operator;
}

function updateOperatorModeFromRecentConversation(
  sessionState: OpenCodePluginSessionState | undefined,
  recentConversation: string | undefined,
): void {
  if (!sessionState || !recentConversation) {
    return;
  }

  const normalizedConversation = recentConversation.trim().toLowerCase();

  if (!normalizedConversation.startsWith("orch:")) {
    if (!sessionState.operator) {
      return;
    }

    const updatedAt = new Date().toISOString();
    sessionState.operator = {
      ...sessionState.operator,
      currentMode: sessionState.operator.stickyModeEnabled ? "sticky-on" : "off",
      lastOperatorUpdateAt: updatedAt,
    };
    return;
  }

  const operator = getOrCreateOperatorState(sessionState);
  const updatedAt = new Date().toISOString();

  if (normalizedConversation === "orch: on") {
    sessionState.operator = {
      ...operator,
      stickyModeEnabled: true,
      currentMode: "sticky-on",
      lastOperatorUpdateAt: updatedAt,
    };
    return;
  }

  if (normalizedConversation === "orch: off") {
    sessionState.operator = {
      ...operator,
      stickyModeEnabled: false,
      currentMode: "off",
      lastOperatorUpdateAt: updatedAt,
    };
    return;
  }

  if (normalizedConversation === "orch: status") {
    sessionState.operator = {
      ...operator,
      currentMode: operator.stickyModeEnabled ? "sticky-on" : "off",
      lastOperatorUpdateAt: updatedAt,
    };
    return;
  }

  sessionState.operator = {
    ...operator,
    currentMode: operator.stickyModeEnabled ? "sticky-on" : "request-only",
    lastOperatorUpdateAt: updatedAt,
  };
}

function applyOperatorTaskUpdate(
  sessionState: OpenCodePluginSessionState,
  resultRecord: Record<string, unknown> | undefined,
  metadata: { readonly toolName: string; readonly args: Record<string, unknown> } | undefined,
): void {
  if (!resultRecord || !metadata) {
    return;
  }

  const requestId = typeof resultRecord.requestId === "string" ? resultRecord.requestId : undefined;

  if (!requestId) {
    return;
  }

  const operator = getOrCreateOperatorState(sessionState);
  const existingTask = operator.tasks[requestId];
  const currentMode = resolveEffectiveOperatorMode(operator);

  if (metadata.toolName === "start_agent_task" || metadata.toolName === "call_worker") {
    if (currentMode === "off") {
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextTask: OpenCodePluginOperatorTaskLedgerEntry = {
      requestId,
      ...(typeof resultRecord.taskId === "string" ? { taskId: resultRecord.taskId } : {}),
      resultTool: typeof resultRecord.pollWith === "string" ? resultRecord.pollWith : "get_orchestration_result",
      verificationPolicy: "default-repo",
      verificationRequired: true,
      startedAt: updatedAt,
      updatedAt,
      workflowStatus: typeof resultRecord.status === "string" ? resultRecord.status : undefined,
      operatorStatus: "running",
    };

    sessionState.operator = {
      ...operator,
      lastOperatorUpdateAt: updatedAt,
      tasks: {
        ...operator.tasks,
        [requestId]: nextTask,
      },
    };
    return;
  }

  if (metadata.toolName === "get_orchestration_result" && existingTask) {
    const workflowStatus = typeof resultRecord.status === "string" ? resultRecord.status : existingTask.workflowStatus;

    if (!workflowStatus || workflowStatus === "running") {
      return;
    }

    const updatedAt = new Date().toISOString();
    sessionState.operator = {
      ...operator,
      lastOperatorUpdateAt: updatedAt,
      tasks: {
        ...operator.tasks,
        [requestId]: {
          ...existingTask,
          updatedAt,
          workflowStatus,
          operatorStatus: workflowStatus === "completed" ? "awaiting_verification" : "needs_attention",
          ...(workflowStatus === "completed"
            ? {}
            : { attentionReason: `workflow_status:${workflowStatus}` }),
        },
      },
    };
  }
}

function resolveEffectiveOperatorMode(operator: OpenCodePluginOperatorState | undefined): OpenCodePluginOrchMode {
  if (!operator) {
    return "off";
  }

  if (operator.stickyModeEnabled) {
    return "sticky-on";
  }

  return operator.currentMode;
}

function getStartAgentTaskExecutor(): OpenCodePluginStartAgentTaskExecutor | undefined {
  return getRegisteredOrchestrationTools().find(
    (tool): tool is RegisteredTool & OpenCodePluginStartAgentTaskExecutor => tool.name === "start_agent_task",
  );
}

async function maybeAutoDispatchOrchTask(
  sessionState: OpenCodePluginSessionState | undefined,
  startAgentTaskTool: OpenCodePluginStartAgentTaskExecutor | undefined,
  orchestrationFacadeAvailable: boolean,
  contextDirectory: string,
  sessionReminderSupport: ReturnType<typeof detectOpenCodePluginSessionReminderSupport>,
  trackAutoDispatchedTaskStart: (
    sessionState: OpenCodePluginSessionState,
    result: unknown,
    prompt: string,
    sourceMessageId: string,
  ) => Promise<void>,
): Promise<void> {
  if (!sessionState || !startAgentTaskTool || !orchestrationFacadeAvailable || !sessionReminderSupport.sessionPromptAsyncAvailable) {
    return;
  }

  const dispatchRequest = resolveOpenCodePluginOrchAutoDispatchRequest(sessionState);

  if (!dispatchRequest || sessionState.lastAutoDispatchMessageId === dispatchRequest.sourceMessageId) {
    return;
  }

  const result = await startAgentTaskTool.execute({
    category: "unspecified-high",
    prompt: dispatchRequest.prompt,
    cwd: contextDirectory,
  });

  await trackAutoDispatchedTaskStart(
    sessionState,
    result,
    dispatchRequest.prompt,
    dispatchRequest.sourceMessageId,
  );
  sessionState.lastAutoDispatchMessageId = dispatchRequest.sourceMessageId;
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
    };
  }

  if (smallTalkPattern.test(normalizedConversation)) {
    return {
      shouldRun: false,
      task: defaultMemoryPreflightTask,
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
