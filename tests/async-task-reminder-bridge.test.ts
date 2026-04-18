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

import { createOpenCodeAsyncTaskTracker } from "../src/features/opencode-plugin/async-task-reminder-bridge.js";

describe("createOpenCodeAsyncTaskTracker", () => {
  const capabilities = {
    mode: "plugin-native+mcp" as const,
    memory: {
      toolNames: ["memory_context"],
      sessionStartWakeUpAvailable: true as const,
      turnPreflightAvailable: true as const,
      idlePersistenceAvailable: true as const,
      memoryContextToolAvailable: true as const,
    },
    orchestration: {
      available: true,
      serverName: "mahiro-mcp-memory-layer",
      toolNames: ["start_agent_task", "get_orchestration_result"],
      activation: "source-checkout-mcp-injection" as const,
    },
    facade: {
      categoryRoutingAvailable: true as const,
      categoryRoutes: {},
      remindersConfigured: true,
      sessionVisibleRemindersAvailable: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits a host log reminder for a tracked running workflow request", async () => {
    const log = vi.fn().mockResolvedValue(undefined);
    const promptAsync = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn().mockResolvedValue(true);
    const onReminder = vi.fn();
    const tracker = createOpenCodeAsyncTaskTracker({
      context: {
        directory: "/repo",
        client: {
          session: {
            promptAsync,
          },
          tui: {
            showToast,
          },
          app: {
            log,
          },
        },
      } as never,
      capabilities: async () => capabilities,
      remindersEnabled: true,
      onReminder,
    });

    await tracker.trackAsyncTask({
      parentSessionId: "session-1",
      requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      taskId: "quick_aaaaaaaaaaaa",
      status: "running",
      resultTool: "get_orchestration_result",
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(promptAsync).toHaveBeenCalledWith({
      path: {
        id: "session-1",
      },
      body: {
        parts: [
          {
            type: "text",
            text: `<system-reminder>
[BACKGROUND TASK COMPLETED]
requestId: workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
taskId: quick_aaaaaaaaaaaa
status: completed
Use get_orchestration_result with this requestId to inspect the stored result and continue the operator loop in this same session.
</system-reminder>`,
            synthetic: true,
            metadata: {
              source: "mahiro-mcp-memory-layer",
              kind: "async-task-reminder",
              requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              reminderToken: "session-1:workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:completed",
              taskId: "quick_aaaaaaaaaaaa",
            },
          },
        ],
      },
      query: {
        directory: "/repo",
      },
    });
    expect(showToast).toHaveBeenCalled();
  });

  it("stays dormant when reminders are disabled or session-visible reminders are unavailable", async () => {
    const log = vi.fn().mockResolvedValue(undefined);
    const promptAsync = vi.fn().mockResolvedValue(undefined);
    const tracker = createOpenCodeAsyncTaskTracker({
      context: {
        directory: "/repo",
        client: {
          session: {
            promptAsync,
          },
          app: {
            log,
          },
        },
      } as never,
      capabilities: async () => ({
        ...capabilities,
        facade: {
          ...capabilities.facade,
          sessionVisibleRemindersAvailable: false,
        },
      }),
      remindersEnabled: false,
    });

    await tracker.trackAsyncTask({
      parentSessionId: "session-1",
      requestId: "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      status: "running",
      resultTool: "get_orchestration_result",
    });

    await Promise.resolve();
    expect(log).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();
  });
});
