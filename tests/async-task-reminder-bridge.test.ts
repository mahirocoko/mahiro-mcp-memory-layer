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
    const tracker = createOpenCodeAsyncTaskTracker({
      context: {
        directory: "/repo",
        client: {
          app: {
            log,
          },
        },
      } as never,
      capabilities: async () => capabilities,
      remindersEnabled: true,
    });

    await tracker.trackAsyncTask({
      parentSessionId: "session-1",
      requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "running",
      resultTool: "get_orchestration_result",
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "opencode-async-task-reminder",
        level: "info",
        message:
          "Background task workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa completed. Use get_orchestration_result with this requestId to inspect the stored result.",
        extra: {
          parentSessionId: "session-1",
          requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          status: "completed",
          resultTool: "get_orchestration_result",
        },
      },
      query: {
        directory: "/repo",
      },
    });
  });

  it("stays dormant when reminders are disabled or session-visible reminders are unavailable", async () => {
    const log = vi.fn().mockResolvedValue(undefined);
    const tracker = createOpenCodeAsyncTaskTracker({
      context: {
        directory: "/repo",
        client: {
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
  });
});
