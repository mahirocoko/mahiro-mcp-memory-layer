import { describe, expect, it } from "vitest";

import {
  formatOrchestrationTraceStatus,
  getEffectiveOrchestrationTraceStatus,
  normalizeOrchestrationTraceEntry,
} from "../src/features/orchestration/observability/effective-orchestration-trace-status.js";
import type { OrchestrationTraceEntry } from "../src/features/orchestration/types.js";

const baseTrace: OrchestrationTraceEntry = {
  requestId: "workflow_0123456789abcdef0123456789abcdef",
  source: "cli",
  mode: "parallel",
  status: "completed",
  jobKinds: ["cursor"],
  taskIds: ["cursor-1"],
  totalJobs: 1,
  finishedJobs: 1,
  completedJobs: 1,
  failedJobs: 0,
  skippedJobs: 0,
  startedAt: "2026-04-05T00:00:00.000Z",
  finishedAt: "2026-04-05T00:00:01.000Z",
  durationMs: 1000,
  createdAt: "2026-04-05T00:00:01.000Z",
};

describe("getEffectiveOrchestrationTraceStatus", () => {
  it("returns completed when all jobs succeeded", () => {
    expect(
      getEffectiveOrchestrationTraceStatus({
        status: "completed",
        failedJobs: 0,
        jobModels: [{ status: "completed" }],
      }),
    ).toBe("completed");
  });

  it("returns failed when status is completed but failedJobs > 0", () => {
    expect(
      getEffectiveOrchestrationTraceStatus({
        status: "completed",
        failedJobs: 1,
        jobModels: [{ status: "command_failed" }],
      }),
    ).toBe("failed");
  });

  it("returns timed_out when status is completed but a job has timeout status", () => {
    expect(
      getEffectiveOrchestrationTraceStatus({
        status: "completed",
        failedJobs: 1,
        jobModels: [{ status: "timeout" }],
      }),
    ).toBe("timed_out");
  });

  it("returns the stored status unchanged for non-completed statuses", () => {
    expect(
      getEffectiveOrchestrationTraceStatus({ status: "failed", failedJobs: 1 }),
    ).toBe("failed");
    expect(
      getEffectiveOrchestrationTraceStatus({ status: "step_failed", failedJobs: 1 }),
    ).toBe("step_failed");
    expect(
      getEffectiveOrchestrationTraceStatus({ status: "timed_out", failedJobs: 1 }),
    ).toBe("timed_out");
    expect(
      getEffectiveOrchestrationTraceStatus({ status: "runner_failed", failedJobs: 1 }),
    ).toBe("runner_failed");
  });
});

describe("normalizeOrchestrationTraceEntry", () => {
  it("returns the original trace when status is already accurate", () => {
    const trace = { ...baseTrace, status: "completed" as const, failedJobs: 0 };
    expect(normalizeOrchestrationTraceEntry(trace)).toBe(trace);
  });

  it("returns a new trace with corrected status when completed masks failures", () => {
    const trace: OrchestrationTraceEntry = {
      ...baseTrace,
      status: "completed",
      failedJobs: 1,
      completedJobs: 0,
      jobModels: [{ kind: "cursor", taskId: "cursor-1", status: "command_failed", requestedModel: "composer-2" }],
    };
    const normalized = normalizeOrchestrationTraceEntry(trace);
    expect(normalized).not.toBe(trace);
    expect(normalized.status).toBe("failed");
    expect(normalized.failedJobs).toBe(1);
  });
});

describe("formatOrchestrationTraceStatus", () => {
  it("returns the status string when stored and effective match", () => {
    expect(
      formatOrchestrationTraceStatus({ status: "completed", failedJobs: 0 }),
    ).toBe("completed");
    expect(
      formatOrchestrationTraceStatus({ status: "failed", failedJobs: 1 }),
    ).toBe("failed");
  });

  it("includes stored status annotation when effective differs from stored", () => {
    expect(
      formatOrchestrationTraceStatus({
        status: "completed",
        failedJobs: 1,
        jobModels: [{ status: "command_failed" }],
      }),
    ).toBe("failed (stored: completed)");
  });
});
