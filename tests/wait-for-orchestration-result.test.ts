import { describe, expect, it, vi } from "vitest";

import type { OrchestrationResultRecord } from "../src/features/orchestration/observability/orchestration-result-store.js";
import { summarizeCompletion, waitForOrchestrationResult } from "../src/features/orchestration/wait-for-orchestration-result.js";

const REQUEST_ID = "workflow_0123456789abcdef0123456789abcdef";

describe("waitForOrchestrationResult", () => {
  it("returns immediately when the stored record is already terminal", async () => {
    const store = {
      read: vi.fn(async () => buildCompletedRecord()),
    };

    const result = await waitForOrchestrationResult(store, REQUEST_ID, {
      includeCompletionSummary: true,
      sleep: vi.fn(async () => undefined),
    });

    expect(result.status).toBe("completed");
    expect(result.completionSummary).toBe("completed — 1/1 jobs succeeded, 0 failed, 0 skipped in 10ms");
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it("polls until the record reaches a terminal state", async () => {
    const store = {
      read: vi
        .fn<() => Promise<OrchestrationResultRecord | null>>()
        .mockResolvedValueOnce(buildRunningRecord())
        .mockResolvedValueOnce(buildRunningRecord())
        .mockResolvedValueOnce(buildCompletedRecord()),
    };
    const sleep = vi.fn(async () => undefined);

    const result = await waitForOrchestrationResult(store, REQUEST_ID, {
      pollIntervalMs: 25,
      sleep,
    });

    expect(result.status).toBe("completed");
    expect(store.read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 25);
    expect(sleep).toHaveBeenNthCalledWith(2, 25);
  });

  it("throws if the request id cannot be found", async () => {
    const store = {
      read: vi.fn(async () => null),
    };

    await expect(
      waitForOrchestrationResult(store, REQUEST_ID, {
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow(`No orchestration result found for requestId ${REQUEST_ID}.`);
  });

  it("times out locally without mutating workflow state", async () => {
    const store = {
      read: vi.fn(async () => buildRunningRecord()),
    };
    const nowValues = [0, 0, 5, 10, 15, 20, 25];
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowValues.shift() ?? 25);

    await expect(
      waitForOrchestrationResult(store, REQUEST_ID, {
        pollIntervalMs: 10,
        timeoutMs: 20,
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow(`Timed out waiting for orchestration result ${REQUEST_ID} after 20ms. Last observed status was running.`);

    dateNow.mockRestore();
  });
});

describe("summarizeCompletion", () => {
  it("includes the failed step index for step_failed sequential results", () => {
    expect(summarizeCompletion(buildStepFailedRecord())).toBe(
      "step_failed — 1/2 jobs succeeded, 1 failed, 0 skipped in 42ms; failed step index 1",
    );
  });

  it("surfaces runner_failed errors directly", () => {
    expect(summarizeCompletion(buildRunnerFailedRecord())).toBe("runner_failed — workflow crashed");
  });
});

function buildRunningRecord(): OrchestrationResultRecord {
  return {
    requestId: REQUEST_ID,
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
    requestId: REQUEST_ID,
    source: "mcp",
    metadata: {
      mode: "parallel",
      taskIds: ["g1"],
    },
    status: "completed",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:10.000Z",
    result: {
      requestId: REQUEST_ID,
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

function buildStepFailedRecord(): OrchestrationResultRecord {
  return {
    requestId: REQUEST_ID,
    source: "mcp",
    metadata: {
      mode: "sequential",
      taskIds: ["g1", "g2"],
    },
    status: "step_failed",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:42.000Z",
    result: {
      requestId: REQUEST_ID,
      mode: "sequential",
      status: "step_failed",
      results: [],
      failedStepIndex: 1,
      error: "step failed",
      summary: {
        totalJobs: 2,
        finishedJobs: 2,
        completedJobs: 1,
        failedJobs: 1,
        skippedJobs: 0,
        startedAt: "2026-04-12T00:00:00.000Z",
        finishedAt: "2026-04-12T00:00:42.000Z",
        durationMs: 42,
      },
    },
  };
}

function buildRunnerFailedRecord(): OrchestrationResultRecord {
  return {
    requestId: REQUEST_ID,
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
