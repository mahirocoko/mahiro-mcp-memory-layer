import { describe, expect, it, vi } from "vitest";

import type { OrchestrationResultRecord } from "../src/features/orchestration/observability/orchestration-result-store.js";
import type { OrchestrationSupervisionRecord } from "../src/features/orchestration/observability/orchestration-supervision-store.js";
import { getOrchestrationSupervisionResult, startOrchestrationSupervision } from "../src/features/orchestration/supervise-orchestration-result.js";

const WORKFLOW_REQUEST_ID = "workflow_0123456789abcdef0123456789abcdef";
const SUPERVISOR_REQUEST_ID = "supervisor_0123456789abcdef0123456789abcdef";

describe("startOrchestrationSupervision", () => {
  it("returns an async supervisor request id immediately", async () => {
    const workflowStore = {
      read: vi.fn(async () => buildCompletedRecord()),
    };
    const supervisionStore = createSupervisionStore();

    const result = await startOrchestrationSupervision(workflowStore, supervisionStore, WORKFLOW_REQUEST_ID, {
      sleep: vi.fn(async () => undefined),
    });

    expect(result).toMatchObject({
      requestId: expect.stringMatching(/^supervisor_/),
      targetRequestId: WORKFLOW_REQUEST_ID,
      status: "running",
      resultTool: "get_orchestration_supervision_result",
    });
    expect(supervisionStore.writeRunning).toHaveBeenCalled();
  });

  it("polls until a running workflow reaches terminal state and persists a concise summary", async () => {
    const workflowStore = {
      read: vi
        .fn<() => Promise<OrchestrationResultRecord | null>>()
        .mockResolvedValueOnce(buildRunningRecord())
        .mockResolvedValueOnce(buildCompletedRecord()),
    };
    const supervisionStore = createSupervisionStore();

    await startOrchestrationSupervision(workflowStore, supervisionStore, WORKFLOW_REQUEST_ID, {
      pollIntervalMs: 50,
      sleep: vi.fn(async () => undefined),
    });

    expect(workflowStore.read).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(supervisionStore.writeCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          targetRequestId: WORKFLOW_REQUEST_ID,
          workflowStatus: "completed",
          summary: "completed — 1/1 jobs succeeded, 0 failed, 0 skipped in 10ms",
        }),
      );
    });
  });

  it("persists runner_failed workflow errors", async () => {
    const workflowStore = {
      read: vi.fn(async () => buildRunnerFailedRecord()),
    };
    const supervisionStore = createSupervisionStore();

    await startOrchestrationSupervision(workflowStore, supervisionStore, WORKFLOW_REQUEST_ID, {
      sleep: vi.fn(async () => undefined),
    });

    expect(supervisionStore.writeCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowStatus: "runner_failed",
        error: "workflow crashed",
      }),
    );
  });

  it("writes supervisor_failed when the supervision timeout is hit", async () => {
    const workflowStore = {
      read: vi.fn(async () => buildRunningRecord()),
    };
    const supervisionStore = createSupervisionStore();
    const nowValues = [0, 0, 5, 10, 15, 20, 25];
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowValues.shift() ?? 25);

    await startOrchestrationSupervision(workflowStore, supervisionStore, WORKFLOW_REQUEST_ID, {
      pollIntervalMs: 10,
      timeoutMs: 20,
      sleep: vi.fn(async () => undefined),
    });

    await vi.waitFor(() => {
      expect(supervisionStore.writeSupervisorFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          targetRequestId: WORKFLOW_REQUEST_ID,
          error: `Timed out supervising orchestration result ${WORKFLOW_REQUEST_ID} after 20ms.`,
        }),
      );
    });

    dateNow.mockRestore();
  });

  it("writes supervisor_failed when the detached loop throws unexpectedly", async () => {
    const workflowStore = {
      read: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const supervisionStore = createSupervisionStore();

    await startOrchestrationSupervision(workflowStore, supervisionStore, WORKFLOW_REQUEST_ID, {
      sleep: vi.fn(async () => undefined),
    });

    await vi.waitFor(() => {
      expect(supervisionStore.writeSupervisorFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          targetRequestId: WORKFLOW_REQUEST_ID,
          error: "Supervisor loop failed: boom",
        }),
      );
    });
  });
});

describe("getOrchestrationSupervisionResult", () => {
  it("reads the latest stored supervision record", async () => {
    const record = buildSupervisionRecord();
    const supervisionStore = createSupervisionStore(record);

    await expect(getOrchestrationSupervisionResult(supervisionStore, SUPERVISOR_REQUEST_ID)).resolves.toEqual(record);
  });
});

function buildRunningRecord(): OrchestrationResultRecord {
  return {
    requestId: WORKFLOW_REQUEST_ID,
    source: "mcp",
    metadata: {
      mode: "parallel",
      taskIds: ["g1"],
    },
    status: "running",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
  };
}

function buildCompletedRecord(): OrchestrationResultRecord {
  return {
    requestId: WORKFLOW_REQUEST_ID,
    source: "mcp",
    metadata: {
      mode: "parallel",
      taskIds: ["g1"],
    },
    status: "completed",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:10.000Z",
    result: {
      requestId: WORKFLOW_REQUEST_ID,
      mode: "parallel",
      status: "completed",
      results: [],
      summary: {
        totalJobs: 1,
        finishedJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        skippedJobs: 0,
        startedAt: "2026-04-12T00:00:00.000Z",
        finishedAt: "2026-04-12T00:00:10.000Z",
        durationMs: 10,
      },
    },
  };
}

function buildRunnerFailedRecord(): OrchestrationResultRecord {
  return {
    requestId: WORKFLOW_REQUEST_ID,
    source: "mcp",
    metadata: {
      mode: "parallel",
      taskIds: ["g1"],
    },
    status: "runner_failed",
    error: "workflow crashed",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:01.000Z",
  };
}

function buildSupervisionRecord(): OrchestrationSupervisionRecord {
  return {
    requestId: SUPERVISOR_REQUEST_ID,
    targetRequestId: WORKFLOW_REQUEST_ID,
    source: "mcp",
    status: "completed",
    workflowStatus: "completed",
    taskIds: ["g1"],
    summary: "completed — 1/1 jobs succeeded, 0 failed, 0 skipped in 10ms",
    pollIntervalMs: 1000,
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:10.000Z",
    pollCount: 2,
  };
}

function createSupervisionStore(readBack: OrchestrationSupervisionRecord | null = null) {
  return {
    writeRunning: vi.fn(async (input) => ({
      ...input,
      status: "running" as const,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z",
    })),
    writeCompleted: vi.fn(async (input) => ({
      ...input,
      status: input.workflowStatus,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:10.000Z",
    })),
    writeSupervisorFailed: vi.fn(async (input) => ({
      ...input,
      status: "supervisor_failed" as const,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:20.000Z",
    })),
    read: vi.fn(async () => readBack),
  };
}
