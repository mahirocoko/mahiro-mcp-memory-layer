import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/features/orchestration/wait-for-orchestration-result.js", () => ({
  waitForOrchestrationResult: vi.fn(async (_store, requestId: string) => ({
    requestId,
    status: "completed",
    record: {
      requestId,
      status: "completed",
    },
  })),
}));

vi.mock("../src/features/orchestration/run-orchestration-workflow.js", () => ({
  runOrchestrationWorkflow: vi.fn(async () => ({
    status: "completed",
  })),
}));

import type { OpenCodePluginConfig } from "../src/features/opencode-plugin/config.js";
import { createOpenCodePluginRuntime, resetOpenCodePluginMemoryBackendSingletonForTests } from "../src/features/opencode-plugin/runtime-shell.js";

function createConfig(): OpenCodePluginConfig {
  return {
    packageName: "mahiro-mcp-memory-layer",
    install: {
      opencodeConfigField: "plugin",
      defaultPluginEntry: "mahiro-mcp-memory-layer",
      requiresManualMcpConfig: false,
      advancedOverrideChannel: "config_files_and_environment_variables",
    },
    runtime: {
      messageDebounceMs: 250,
      userId: "local:test",
      remindersEnabled: true,
    },
    routing: {
      categoryRoutes: {},
    },
    env: {
      messageDebounceMs: "MAHIRO_OPENCODE_PLUGIN_MESSAGE_DEBOUNCE_MS",
      userId: "MAHIRO_OPENCODE_PLUGIN_USER_ID",
      remindersEnabled: "MAHIRO_OPENCODE_PLUGIN_REMINDERS_ENABLED",
    },
  };
}

function createMemoryBackend() {
  return {
    remember: vi.fn(),
    search: vi.fn(),
    buildContext: vi.fn(),
    upsertDocument: vi.fn(),
    list: vi.fn(),
    suggestMemoryCandidates: vi.fn(),
    applyConservativeMemoryPolicy: vi.fn(),
    inspectMemoryRetrieval: vi.fn().mockResolvedValue({ status: "empty" }),
    prepareHostTurnMemory: vi.fn().mockResolvedValue({ context: "host", items: [], truncated: false, degraded: false, memorySuggestions: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [] }, conservativePolicy: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [], autoSaved: [], autoSaveSkipped: [], reviewOnlySuggestions: [] } }),
    wakeUpMemory: vi.fn().mockResolvedValue({ wakeUpContext: "wake", profile: { context: "profile", items: [], truncated: false, degraded: false }, recent: { context: "recent", items: [], truncated: false, degraded: false }, truncated: false, degraded: false }),
    prepareTurnMemory: vi.fn().mockResolvedValue({ context: "turn", items: [], truncated: false, degraded: false, memorySuggestions: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [] }, conservativePolicy: { recommendation: "likely_skip", signals: { durable: [], ephemeral: [] }, candidates: [], autoSaved: [], autoSaveSkipped: [], reviewOnlySuggestions: [] } }),
  };
}

function createSessionCreatedEvent(sessionId = "session-1") {
  return {
    type: "session.created" as const,
    properties: {
      sessionID: sessionId,
      info: { id: sessionId },
    },
  };
}

function createMessageUpdatedEvent(sessionId = "session-1", message = "orch: on") {
  return {
    type: "message.updated" as const,
    properties: {
      sessionID: sessionId,
      messageID: `${sessionId}-message-1`,
      parts: [{ type: "text" as const, text: message }],
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("OpenCode plugin operator loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetOpenCodePluginMemoryBackendSingletonForTests();
  });

  it("stores sticky orch mode in session memory context", async () => {
    const runtime = createOpenCodePluginRuntime(
      {
        directory: "/repo",
        client: { app: { log: vi.fn().mockResolvedValue(undefined) } },
      } as never,
      {
        __test: {
          memory: createMemoryBackend() as never,
          standaloneMcpAvailable: true,
          sessionVisibleRemindersAvailable: true,
        },
      },
      createConfig(),
    );

    await runtime.handleSessionCreated(createSessionCreatedEvent());
    await runtime.handleMessageUpdated(createMessageUpdatedEvent());

    const memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status).toBe("ready");
    expect(memoryContext.status === "ready" ? memoryContext.session.operator : undefined).toMatchObject({
      stickyModeEnabled: true,
      currentMode: "sticky-on",
    });
  });

  it("auto-dispatches explicit orch prompts into tracked start_agent_task execution", async () => {
    const runtime = createOpenCodePluginRuntime(
      {
        directory: "/repo",
        client: { app: { log: vi.fn().mockResolvedValue(undefined) } },
      } as never,
      {
        __test: {
          memory: createMemoryBackend() as never,
          standaloneMcpAvailable: true,
          sessionVisibleRemindersAvailable: true,
        },
      },
      createConfig(),
    );

    await runtime.handleSessionCreated(createSessionCreatedEvent());
    await runtime.handleMessageUpdated(createMessageUpdatedEvent("session-1", "orch: review this diff"));
    await flushMicrotasks();

    const memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status).toBe("ready");
    const tasks = memoryContext.status === "ready" ? Object.values(memoryContext.session.operator?.tasks ?? {}) : [];

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      operatorStatus: "awaiting_resume",
      resultTool: "get_orchestration_result",
    });
  });

  it("auto-dispatches the next actionable turn after orch: on without respawning the same message twice", async () => {
    const runtime = createOpenCodePluginRuntime(
      {
        directory: "/repo",
        client: { app: { log: vi.fn().mockResolvedValue(undefined) } },
      } as never,
      {
        __test: {
          memory: createMemoryBackend() as never,
          standaloneMcpAvailable: true,
          sessionVisibleRemindersAvailable: true,
        },
      },
      createConfig(),
    );

    await runtime.handleSessionCreated(createSessionCreatedEvent());
    await runtime.handleMessageUpdated(createMessageUpdatedEvent("session-1", "orch: on"));
    await runtime.handleMessageUpdated({
      type: "message.updated",
      properties: {
        sessionID: "session-1",
        messageID: "session-1-message-2",
        parts: [{ type: "text", text: "review this diff" }],
      },
    });
    await runtime.handleMessageUpdated({
      type: "message.updated",
      properties: {
        sessionID: "session-1",
        messageID: "session-1-message-2",
        parts: [{ type: "text", text: "review this diff" }],
      },
    });
    await flushMicrotasks();

    const memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status).toBe("ready");
    const tasks = memoryContext.status === "ready" ? Object.values(memoryContext.session.operator?.tasks ?? {}) : [];

    expect(memoryContext.status === "ready" ? memoryContext.session.operator : undefined).toMatchObject({
      stickyModeEnabled: true,
      currentMode: "sticky-on",
    });
    expect(tasks).toHaveLength(1);
  });

  it("does not auto-dispatch when orchestration facade is unavailable", async () => {
    const runtime = createOpenCodePluginRuntime(
      {
        directory: "/repo",
        client: { app: { log: vi.fn().mockResolvedValue(undefined) } },
      } as never,
      {
        __test: {
          memory: createMemoryBackend() as never,
          standaloneMcpAvailable: false,
          sessionVisibleRemindersAvailable: true,
        },
      },
      createConfig(),
    );

    await runtime.handleSessionCreated(createSessionCreatedEvent());
    await runtime.handleMessageUpdated(createMessageUpdatedEvent("session-1", "orch: review this diff"));
    await flushMicrotasks();

    const memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status).toBe("ready");
    expect(memoryContext.status === "ready" ? Object.keys(memoryContext.session.operator?.tasks ?? {}) : []).toHaveLength(0);
  });

  it("creates a tracked ledger entry for sticky or request-only orch tasks and transitions through resume and verification", async () => {
    const log = vi.fn().mockResolvedValue(undefined);
    const runtime = createOpenCodePluginRuntime(
      {
        directory: "/repo",
        client: { app: { log } },
      } as never,
      {
        __test: {
          memory: createMemoryBackend() as never,
          standaloneMcpAvailable: true,
          sessionVisibleRemindersAvailable: true,
        },
      },
      createConfig(),
    );

    await runtime.handleSessionCreated(createSessionCreatedEvent());
    await runtime.handleMessageUpdated(createMessageUpdatedEvent("session-1", "orch: review this diff"));

    await runtime.trackAsyncTaskStart(
      {
        requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        taskId: "quick_aaaaaaaaaaaa",
        status: "running",
        pollWith: "get_orchestration_result",
      },
      { sessionID: "session-1" },
      {
        toolName: "start_agent_task",
        args: {
          category: "quick",
          prompt: "Review this diff.",
        },
      },
    );

    await flushMicrotasks();

    let memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status).toBe("ready");
    expect(memoryContext.status === "ready" ? memoryContext.session.operator?.tasks.workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa : undefined).toMatchObject({
      taskId: "quick_aaaaaaaaaaaa",
      operatorStatus: "awaiting_resume",
      workflowStatus: "completed",
      reminderToken: "session-1:workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:completed",
    });
    expect(log).toHaveBeenCalled();

    await runtime.trackAsyncTaskStart(
      {
        requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "completed",
      },
      { sessionID: "session-1" },
      {
        toolName: "get_orchestration_result",
        args: {
          requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    );

    memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status === "ready" ? memoryContext.session.operator?.tasks.workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa : undefined).toMatchObject({
      operatorStatus: "awaiting_verification",
      workflowStatus: "completed",
    });

    await expect(
      runtime.markOrchestrationTaskVerification(
        {
          requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "completed",
          note: "Verified after repo checks.",
        },
        { sessionID: "session-1" },
      ),
    ).resolves.toMatchObject({
      status: "updated",
      operatorStatus: "completed",
    });

    memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status === "ready" ? memoryContext.session.operator?.tasks.workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa : undefined).toMatchObject({
      operatorStatus: "completed",
      verificationNote: "Verified after repo checks.",
    });
  });

  it("does not create a ledger entry when orch mode is off", async () => {
    const runtime = createOpenCodePluginRuntime(
      {
        directory: "/repo",
        client: { app: { log: vi.fn().mockResolvedValue(undefined) } },
      } as never,
      {
        __test: {
          memory: createMemoryBackend() as never,
          standaloneMcpAvailable: true,
          sessionVisibleRemindersAvailable: true,
        },
      },
      createConfig(),
    );

    await runtime.handleSessionCreated(createSessionCreatedEvent());
    await runtime.trackAsyncTaskStart(
      {
        requestId: "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        taskId: "quick_bbbbbbbbbbbb",
        status: "running",
        pollWith: "get_orchestration_result",
      },
      { sessionID: "session-1" },
      {
        toolName: "start_agent_task",
        args: {
          category: "quick",
          prompt: "Review this diff.",
        },
      },
    );

    await flushMicrotasks();

    const memoryContext = await runtime.readMemoryContext({ sessionID: "session-1" });
    expect(memoryContext.status).toBe("ready");
    expect(memoryContext.status === "ready" ? memoryContext.session.operator?.tasks.workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : undefined).toBeUndefined();
  });
});
