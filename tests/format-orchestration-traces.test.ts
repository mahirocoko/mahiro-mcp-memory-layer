import { describe, expect, it } from "vitest";

import {
  formatOrchestrationTracesAsDetail,
  formatOrchestrationTracesAsText,
} from "../src/features/orchestration/format-orchestration-traces.js";

describe("formatOrchestrationTracesAsText", () => {
  it("renders a markdown-style table for traces", () => {
    expect(
      formatOrchestrationTracesAsText([
        {
          requestId: "workflow-1",
          source: "cli",
          mode: "parallel",
          status: "completed",
          jobKinds: ["gemini", "cursor"],
          taskIds: ["gemini-1", "cursor-1"],
          totalJobs: 2,
          finishedJobs: 2,
          completedJobs: 2,
          failedJobs: 0,
          skippedJobs: 0,
          startedAt: "2026-04-05T00:00:00.000Z",
          finishedAt: "2026-04-05T00:00:02.000Z",
          durationMs: 2000,
          createdAt: "2026-04-05T00:00:02.000Z",
        },
      ]),
    ).toContain("| workflow-1 | cli | parallel | completed | 2 | 2 | 0 | 2000ms | 2026-04-05T00:00:02.000Z |");
  });

  it("renders a friendly empty-state message", () => {
    expect(formatOrchestrationTracesAsText([])).toBe("No orchestration traces found.");
  });

  it("renders a detailed block view for traces", () => {
    expect(
      formatOrchestrationTracesAsDetail([
        {
          requestId: "workflow-1",
          source: "mcp",
          mode: "sequential",
          status: "step_failed",
          jobKinds: ["gemini", "cursor"],
          taskIds: ["gemini-1", "cursor-1"],
          totalJobs: 2,
          finishedJobs: 1,
          completedJobs: 1,
          failedJobs: 0,
          skippedJobs: 1,
          failedStepIndex: 1,
          error: "Template path could not be resolved.",
          startedAt: "2026-04-05T00:00:00.000Z",
          finishedAt: "2026-04-05T00:00:02.000Z",
          durationMs: 2000,
          createdAt: "2026-04-05T00:00:02.000Z",
        },
      ]),
    ).toContain("Failed Step Index: 1");
  });

  it("includes per-job model telemetry in detail view when present", () => {
    const detail = formatOrchestrationTracesAsDetail([
      {
        requestId: "workflow-1",
        source: "cli",
        mode: "parallel",
        status: "completed",
        jobKinds: ["gemini", "cursor"],
        taskIds: ["g1", "c1"],
        jobModels: [
          {
            kind: "gemini",
            taskId: "g1",
            status: "completed",
            configuredRetries: 2,
            configuredRetryDelayMs: 500,
            retryCount: 0,
            durationMs: 800,
            cached: true,
            cachedTokens: 300,
            errorClass: "none",
            requestedModel: "gemini-3-flash-preview",
            reportedModel: "gemini-3-flash-preview",
          },
          {
            kind: "cursor",
            taskId: "c1",
            status: "command_failed",
            configuredRetries: 3,
            configuredRetryDelayMs: 750,
            retryCount: 2,
            durationMs: 1400,
            errorClass: "rate_limited",
            requestedModel: "composer-2",
            reportedModel: "composer-2",
          },
        ],
        totalJobs: 2,
        finishedJobs: 2,
        completedJobs: 2,
        failedJobs: 0,
        skippedJobs: 0,
        startedAt: "2026-04-05T00:00:00.000Z",
        finishedAt: "2026-04-05T00:00:02.000Z",
        durationMs: 2000,
        createdAt: "2026-04-05T00:00:02.000Z",
      },
    ]);
    
    expect(detail).toContain("Job models:");
    expect(detail).toContain("g1 (gemini) status=completed requested=gemini-3-flash-preview configuredRetries=2 configuredRetryDelayMs=500 retries=0 duration=800ms cached=true cachedTokens=300 errorClass=none reported=gemini-3-flash-preview");
    expect(detail).toContain("c1 (cursor) status=command_failed requested=composer-2 configuredRetries=3 configuredRetryDelayMs=750 retries=2 duration=1400ms errorClass=rate_limited reported=composer-2");
  });

  it("shows effective status for stale completed traces with failed jobs", () => {
    const detail = formatOrchestrationTracesAsDetail([
      {
        requestId: "workflow-stale",
        source: "cli",
        mode: "parallel",
        status: "completed",
        jobKinds: ["cursor"],
        taskIds: ["c1"],
        jobModels: [
          {
            kind: "cursor",
            taskId: "c1",
            status: "command_failed",
            requestedModel: "composer-2",
          },
        ],
        totalJobs: 1,
        finishedJobs: 1,
        completedJobs: 0,
        failedJobs: 1,
        skippedJobs: 0,
        startedAt: "2026-04-05T00:00:00.000Z",
        finishedAt: "2026-04-05T00:00:02.000Z",
        durationMs: 2000,
        createdAt: "2026-04-05T00:00:02.000Z",
      },
    ]);

    expect(detail).toContain("Status: failed (stored: completed)");
  });
});
