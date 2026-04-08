import { describe, expect, it } from "vitest";

import {
  buildOrchestrationTraceEntry,
  buildRunnerFailedOrchestrationTraceEntry,
} from "../src/features/orchestration/observability/orchestration-trace.js";
import type { OrchestrationRunResult } from "../src/features/orchestration/run-orchestration-workflow.js";

const sampleSummary = {
  totalJobs: 1,
  finishedJobs: 1,
  completedJobs: 1,
  failedJobs: 0,
  skippedJobs: 0,
  startedAt: "2026-04-05T00:00:00.000Z",
  finishedAt: "2026-04-05T00:00:01.000Z",
  durationMs: 1000,
} as const;

describe("buildOrchestrationTraceEntry jobModels", () => {
  it("records requestedModel for runner_failed jobs", () => {
    const spec = {
      mode: "parallel" as const,
      maxConcurrency: 1,
      jobs: [
        {
          kind: "cursor" as const,
          input: { taskId: "t1", prompt: "x", model: "composer-2" },
        },
      ],
    };

    const result: OrchestrationRunResult = {
      mode: "parallel",
      status: "failed",
      results: [
        {
          kind: "cursor",
          input: { taskId: "t1", prompt: "x", model: "composer-2" },
          retryCount: 1,
          status: "runner_failed",
          error: "spawn failed",
        },
      ],
      summary: { ...sampleSummary, completedJobs: 0, failedJobs: 1 },
    };

    expect(buildOrchestrationTraceEntry("r1", "cli", spec, result).jobModels).toEqual([
      { kind: "cursor", taskId: "t1", status: "runner_failed", retryCount: 1, errorClass: "infra_failure", requestedModel: "composer-2" },
    ]);
    expect(buildOrchestrationTraceEntry("r1", "cli", spec, result).status).toBe("failed");
  });

  it("records requested and reported model from worker results", () => {
    const spec = {
      mode: "parallel" as const,
      maxConcurrency: 1,
      jobs: [
        {
          kind: "gemini" as const,
          input: { taskId: "g1", prompt: "p", model: "gemini-3-flash-preview" },
        },
      ],
    };

    const result: OrchestrationRunResult = {
      mode: "parallel",
      status: "completed",
      results: [
        {
          kind: "gemini",
          input: { taskId: "g1", prompt: "p", model: "gemini-3-flash-preview" },
          retryCount: 2,
          result: {
            status: "completed",
            requestedModel: "gemini-3-flash-preview",
            reportedModel: "gemini-3.1-pro-preview",
            durationMs: 1,
            startedAt: "2026-04-05T00:00:00.000Z",
            finishedAt: "2026-04-05T00:00:01.000Z",
            cached: true,
            cachedTokens: 120,
          },
        },
      ],
      summary: sampleSummary,
    };

    expect(buildOrchestrationTraceEntry("r2", "mcp", spec, result).jobModels).toEqual([
      {
        kind: "gemini",
        taskId: "g1",
        status: "completed",
        retryCount: 2,
        durationMs: 1,
        cached: true,
        cachedTokens: 120,
        errorClass: "none",
        requestedModel: "gemini-3-flash-preview",
        reportedModel: "gemini-3.1-pro-preview",
      },
    ]);
  });

  it("builds runner-failed traces from workflow spec", () => {
    const trace = buildRunnerFailedOrchestrationTraceEntry({
      requestId: "r3",
      source: "mcp",
      spec: {
        mode: "parallel",
        jobs: [
          {
            kind: "cursor",
            input: { taskId: "c1", prompt: "review", model: "composer-2" },
          },
        ],
      },
      error: "unexpected failure",
      startedAt: "2026-04-05T00:00:00.000Z",
      finishedAt: "2026-04-05T00:00:05.000Z",
    });

    expect(trace).toMatchObject({
      requestId: "r3",
      source: "mcp",
      mode: "parallel",
      status: "runner_failed",
      jobKinds: ["cursor"],
      taskIds: ["c1"],
      totalJobs: 1,
      finishedJobs: 0,
      completedJobs: 0,
      failedJobs: 1,
      skippedJobs: 0,
      error: "unexpected failure",
      durationMs: 5000,
    });
    expect(trace.jobModels).toEqual([
      {
        kind: "cursor",
        taskId: "c1",
        status: "runner_failed",
        retryCount: 0,
        errorClass: "infra_failure",
        requestedModel: "composer-2",
      },
    ]);
  });

  it("normalizes stale completed timeout traces to timed_out", () => {
    const spec = {
      mode: "parallel" as const,
      jobs: [
        {
          kind: "gemini" as const,
          input: { taskId: "g1", prompt: "p", model: "gemini-3-flash-preview" },
        },
      ],
    };

    const trace = buildOrchestrationTraceEntry("r4", "mcp", spec, {
      mode: "parallel",
      status: "completed",
      results: [
        {
          kind: "gemini",
          input: { taskId: "g1", prompt: "p", model: "gemini-3-flash-preview" },
          retryCount: 0,
          result: {
            status: "timeout",
            requestedModel: "gemini-3-flash-preview",
            durationMs: 10,
            startedAt: "2026-04-05T00:00:00.000Z",
            finishedAt: "2026-04-05T00:00:00.010Z",
          },
        },
      ],
      summary: { ...sampleSummary, completedJobs: 0, failedJobs: 1 },
    });

    expect(trace.status).toBe("timed_out");
  });
});
