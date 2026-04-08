import { describe, expect, it } from "vitest";

import type { GeminiCacheStore } from "../src/features/gemini/core/gemini-cache-store.js";
import type { CursorCommandRunResult } from "../src/features/cursor/types.js";
import type { GeminiCommandRunResult } from "../src/features/gemini/types.js";
import { hasOrchestrationFailures, runOrchestrationWorkflow } from "../src/features/orchestration/run-orchestration-workflow.js";

function createGeminiCommandResult(
  overrides: Partial<GeminiCommandRunResult> = {},
): GeminiCommandRunResult {
  return {
    stdout: JSON.stringify({
      response: "Gemini summary",
      stats: { model: "gemini-3-flash-preview" },
    }),
    stderr: "",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-04-05T04:00:00.000Z",
    finishedAt: "2026-04-05T04:00:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

function createCursorCommandResult(
  overrides: Partial<CursorCommandRunResult> = {},
): CursorCommandRunResult {
  return {
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      result: "Cursor plan",
      model: "composer-2",
    }),
    stderr: "",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-04-05T04:00:00.000Z",
    finishedAt: "2026-04-05T04:00:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

function createNoopCacheStore(): GeminiCacheStore {
  return {
    get: async () => undefined,
    set: async () => undefined,
  };
}

describe("runOrchestrationWorkflow", () => {
  it("returns a completed parallel envelope", async () => {
    const traceEntries: unknown[] = [];

    const result = await runOrchestrationWorkflow({
      mode: "parallel",
      maxConcurrency: 1,
      jobs: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: { run: async () => createGeminiCommandResult() },
          },
        },
      ],
    }, {
      traceStore: {
        append: async (entry) => {
          traceEntries.push(entry);
        },
      },
      traceSource: "cli",
      traceRequestId: "workflow-trace-1",
    });

    expect(result.mode).toBe("parallel");
    expect(result.status).toBe("completed");
    expect(result.requestId).toBe("workflow-trace-1");
    expect(result.results).toHaveLength(1);
    expect(result.summary).toMatchObject({
      totalJobs: 1,
      finishedJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
      skippedJobs: 0,
    });
    expect(result.summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(traceEntries).toEqual([
      expect.objectContaining({
        requestId: "workflow-trace-1",
        source: "cli",
        mode: "parallel",
        status: "completed",
        totalJobs: 1,
        completedJobs: 1,
        taskIds: ["gemini-1"],
        jobModels: [
          expect.objectContaining({
            kind: "gemini",
            taskId: "gemini-1",
            requestedModel: "gemini-3-flash-preview",
            reportedModel: "gemini-3-flash-preview",
            status: "completed",
            retryCount: 0,
            errorClass: "none",
          }),
        ],
      }),
    ]);
    expect(hasOrchestrationFailures(result)).toBe(false);
  });

  it("forwards parallel maxConcurrency into the worker runner", async () => {
    let activeRuns = 0;
    let maxConcurrentRuns = 0;

    const result = await runOrchestrationWorkflow({
      mode: "parallel",
      maxConcurrency: 2,
      jobs: Array.from({ length: 4 }, (_unused, index) => ({
        kind: "cursor" as const,
        input: {
          taskId: `cursor-${index + 1}`,
          prompt: `Review module ${index + 1}.`,
          model: "composer-2",
        },
        dependencies: {
          runtime: {
            run: async () => {
              activeRuns += 1;
              maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
              await new Promise((resolve) => setTimeout(resolve, 20));
              activeRuns -= 1;

              return createCursorCommandResult();
            },
          },
        },
      })),
    });

    expect(result.status).toBe("completed");
    expect(result.requestId).toBeUndefined();
    expect(result.results).toHaveLength(4);
    expect(result.summary).toMatchObject({
      totalJobs: 4,
      finishedJobs: 4,
      completedJobs: 4,
      failedJobs: 0,
      skippedJobs: 0,
    });
    expect(maxConcurrentRuns).toBe(2);
  });

  it("forwards onJobComplete through the workflow runner", async () => {
    const events: Array<{ mode: string; jobIndex: number; finishedJobs: number; totalJobs: number }> = [];

    await runOrchestrationWorkflow(
      {
        mode: "parallel",
        jobs: [
          {
            kind: "gemini",
            input: {
              taskId: "gemini-1",
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
            },
            dependencies: {
              cacheStore: createNoopCacheStore(),
              runtime: { run: async () => createGeminiCommandResult() },
            },
          },
        ],
      },
      {
        onJobComplete: async (event) => {
          events.push({
            mode: event.mode,
            jobIndex: event.jobIndex,
            finishedJobs: event.finishedJobs,
            totalJobs: event.totalJobs,
          });
        },
      },
    );

    expect(events).toEqual([
      {
        mode: "parallel",
        jobIndex: 0,
        finishedJobs: 1,
        totalJobs: 1,
      },
    ]);
  });

  it("marks the workflow as timed_out when the parallel deadline expires", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "parallel",
      timeoutMs: 10,
      maxConcurrency: 1,
      jobs: Array.from({ length: 3 }, (_unused, index) => ({
        kind: "cursor" as const,
        input: {
          taskId: `cursor-${index + 1}`,
          prompt: `Review module ${index + 1}.`,
          model: "composer-2",
        },
        dependencies: {
          runtime: {
            run: async (input) => {
              await new Promise((resolve) => setTimeout(resolve, (input.timeoutMs ?? 0) + 5));
              return createCursorCommandResult({
                exitCode: null,
                signal: "SIGTERM",
                timedOut: true,
              });
            },
          },
        },
      })),
    });

    expect(result).toMatchObject({
      mode: "parallel",
      status: "timed_out",
      summary: {
        totalJobs: 3,
        finishedJobs: 1,
        completedJobs: 0,
        failedJobs: 1,
        skippedJobs: 2,
      },
    });
    expect(result.results[0] && "result" in result.results[0] ? result.results[0].result.status : undefined).toBe("timeout");
    expect(hasOrchestrationFailures(result)).toBe(true);
  });

  it("marks orchestration as failed when any parallel job fails", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "parallel",
      jobs: [
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Review this diff.",
            model: "composer-2",
          },
          dependencies: {
            runtime: { run: async () => createCursorCommandResult({ exitCode: 1, stderr: "bad diff" }) },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "parallel",
      status: "failed",
    });
    expect(result.summary).toMatchObject({
      totalJobs: 1,
      finishedJobs: 1,
      completedJobs: 0,
      failedJobs: 1,
      skippedJobs: 0,
    });
    expect(hasOrchestrationFailures(result)).toBe(true);
  });

  it("marks sequential workflows as failed when a step fails but later steps still run", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      steps: [
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Review this diff.",
            model: "composer-2",
          },
          dependencies: {
            runtime: { run: async () => createCursorCommandResult({ exitCode: 1, stderr: "bad diff" }) },
          },
        },
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize anyway.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: { run: async () => createGeminiCommandResult() },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "sequential",
      status: "failed",
      summary: {
        totalJobs: 2,
        finishedJobs: 2,
        completedJobs: 1,
        failedJobs: 1,
        skippedJobs: 0,
      },
    });
    expect(hasOrchestrationFailures(result)).toBe(true);
  });

  it("returns a sequential envelope and forwards step failures", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      steps: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: { run: async () => createGeminiCommandResult() },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "sequential",
      status: "completed",
      summary: {
        totalJobs: 1,
        finishedJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        skippedJobs: 0,
      },
    });
    expect(hasOrchestrationFailures(result)).toBe(false);
  });

  it("interpolates sequential prompts from earlier results", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      steps: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: { run: async () => createGeminiCommandResult() },
          },
        },
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Plan from summary: {{last.result.response}}",
            model: "composer-2",
          },
          dependencies: {
            runtime: {
              run: async (input) => {
                expect(input.prompt).toBe("Plan from summary: Gemini summary");
                return createCursorCommandResult();
              },
            },
          },
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toMatchObject({
      totalJobs: 2,
      finishedJobs: 2,
      completedJobs: 2,
      failedJobs: 0,
      skippedJobs: 0,
    });
    expect(hasOrchestrationFailures(result)).toBe(false);
  });

  it("counts skipped steps when a sequential step is conditionally skipped", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      steps: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: { run: async () => createGeminiCommandResult() },
          },
        },
        ({ lastResult }) => {
          if (lastResult && "result" in lastResult && lastResult.result.response === "Gemini summary") {
            return null;
          }

          return {
            kind: "cursor" as const,
            input: {
              taskId: "cursor-skip-check",
              prompt: "This should never run.",
              model: "composer-2",
            },
          };
        },
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Review this diff.",
            model: "composer-2",
          },
          dependencies: {
            runtime: { run: async () => createCursorCommandResult() },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "sequential",
      status: "completed",
      summary: {
        totalJobs: 3,
        finishedJobs: 2,
        completedJobs: 2,
        failedJobs: 0,
        skippedJobs: 1,
      },
    });
  });

  it("stops sequential workflows on failed jobs when continueOnFailure is false", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      steps: [
        {
          kind: "cursor",
          continueOnFailure: false,
          input: {
            taskId: "cursor-1",
            prompt: "Review this diff.",
            model: "composer-2",
          },
          dependencies: {
            runtime: { run: async () => createCursorCommandResult({ exitCode: 1, stderr: "bad diff" }) },
          },
        },
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "This should never run.",
            model: "gemini-3-flash-preview",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "sequential",
      status: "step_failed",
      failedStepIndex: 0,
      summary: {
        totalJobs: 2,
        finishedJobs: 1,
        completedJobs: 0,
        failedJobs: 1,
        skippedJobs: 1,
      },
    });
    expect(result.error).toBe("Workflow stopped after step 1 returned status 'command_failed'.");
    expect(hasOrchestrationFailures(result)).toBe(true);
  });

  it("fails the sequential workflow when a template cannot be resolved", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      steps: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: { run: async () => createGeminiCommandResult() },
          },
        },
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Plan from summary: {{results.9.result.response}}",
            model: "composer-2",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "sequential",
      status: "step_failed",
      failedStepIndex: 1,
      summary: {
        totalJobs: 2,
        finishedJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        skippedJobs: 1,
      },
    });
    expect(result.error).toContain("could not be resolved");
    expect(hasOrchestrationFailures(result)).toBe(true);
  });

  it("marks the workflow as timed_out when a sequential deadline expires", async () => {
    const result = await runOrchestrationWorkflow({
      mode: "sequential",
      timeoutMs: 10,
      steps: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runtime: {
              run: async (input) => {
                await new Promise((resolve) => setTimeout(resolve, (input.timeoutMs ?? 0) + 5));
                return createGeminiCommandResult({
                  exitCode: null,
                  signal: "SIGTERM",
                  timedOut: true,
                });
              },
            },
          },
        },
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Review this diff.",
            model: "composer-2",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      mode: "sequential",
      status: "timed_out",
      summary: {
        totalJobs: 2,
        finishedJobs: 1,
        completedJobs: 0,
        failedJobs: 1,
        skippedJobs: 1,
      },
    });
    expect(result.error).toContain("timed out");
    expect(result.results[0] && "result" in result.results[0] ? result.results[0].result.status : undefined).toBe("timeout");
    expect(hasOrchestrationFailures(result)).toBe(true);
  });
});
