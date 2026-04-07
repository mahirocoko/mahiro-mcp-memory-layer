import { describe, expect, it } from "vitest";

import type { GeminiCacheStore } from "../src/features/gemini/core/gemini-cache-store.js";
import type { CursorCommandRunResult } from "../src/features/cursor/types.js";
import type { GeminiCommandRunResult } from "../src/features/gemini/types.js";
import { runSequentialWorkers } from "../src/features/orchestration/run-sequential-workers.js";
import type { SequentialWorkerStep } from "../src/features/orchestration/types.js";

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

describe("runSequentialWorkers", () => {
  it("returns completed with no results when there are no steps", async () => {
    await expect(runSequentialWorkers([])).resolves.toEqual({
      status: "completed",
      results: [],
    });
  });

  it("runs steps in order and lets later steps derive jobs from earlier results", async () => {
    const steps: readonly SequentialWorkerStep[] = [
      {
        kind: "gemini",
        input: {
          taskId: "gemini-1",
          prompt: "Summarize retrieval flow.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => createGeminiCommandResult(),
        },
      },
      ({ lastResult, stepIndex, results }) => {
        expect(stepIndex).toBe(1);
        expect(results).toHaveLength(1);
        expect(lastResult && "result" in lastResult ? lastResult.result.response : undefined).toBe("Gemini summary");

        return {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: `Plan next step from: ${lastResult && "result" in lastResult ? lastResult.result.response : "missing"}`,
            model: "composer-2",
          },
          dependencies: {
            runCommand: async (input) => {
              expect(input.prompt).toContain("Gemini summary");
              return createCursorCommandResult();
            },
          },
        };
      },
    ];

    const result = await runSequentialWorkers(steps);

    expect(result.status).toBe("completed");
    expect(result.results).toHaveLength(2);
    expect(result.results[0] && "result" in result.results[0] ? result.results[0].result.status : undefined).toBe("completed");
    expect(result.results[1] && "result" in result.results[1] ? result.results[1].result.status : undefined).toBe("completed");
  });

  it("keeps worker failures as results and continues to later static steps", async () => {
    const result = await runSequentialWorkers([
      {
        kind: "cursor",
        input: {
          taskId: "cursor-1",
          prompt: "Review this diff.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => createCursorCommandResult({ exitCode: 1, stderr: "bad diff" }),
        },
      },
      {
        kind: "gemini",
        input: {
          taskId: "gemini-1",
          prompt: "Summarize the failure.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => createGeminiCommandResult(),
        },
      },
    ]);

    expect(result.status).toBe("completed");
    expect(result.results).toHaveLength(2);
    expect(result.results[0] && "result" in result.results[0] ? result.results[0].result.status : undefined).toBe("command_failed");
    expect(result.results[1] && "result" in result.results[1] ? result.results[1].result.status : undefined).toBe("completed");
  });

  it("skips steps when a step builder returns null", async () => {
    const result = await runSequentialWorkers([
      {
        kind: "gemini",
        input: {
          taskId: "gemini-1",
          prompt: "Summarize retrieval flow.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => createGeminiCommandResult(),
        },
      },
      () => null,
      {
        kind: "cursor",
        input: {
          taskId: "cursor-1",
          prompt: "Review this module.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => createCursorCommandResult(),
        },
      },
    ]);

    expect(result.status).toBe("completed");
    expect(result.results).toHaveLength(2);
    expect(result.results[0] && "result" in result.results[0] ? result.results[0].result.status : undefined).toBe("completed");
    expect(result.results[1] && "result" in result.results[1] ? result.results[1].result.status : undefined).toBe("completed");
  });

  it("emits job completion events for executed sequential steps only", async () => {
    const events: Array<{ mode: string; jobIndex: number; finishedJobs: number; totalJobs: number; status?: string }> = [];

    await runSequentialWorkers(
      [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize retrieval flow.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runCommand: async () => createGeminiCommandResult(),
          },
        },
        () => null,
        {
          kind: "cursor",
          input: {
            taskId: "cursor-1",
            prompt: "Review this module.",
            model: "composer-2",
          },
          dependencies: {
            runCommand: async () => createCursorCommandResult({ exitCode: 1, stderr: "bad diff" }),
          },
        },
      ],
      {
        onJobComplete: async (event) => {
          events.push({
            mode: event.mode,
            jobIndex: event.jobIndex,
            finishedJobs: event.finishedJobs,
            totalJobs: event.totalJobs,
            status: "result" in event.result ? event.result.result.status : event.result.status,
          });
        },
      },
    );

    expect(events).toEqual([
      {
        mode: "sequential",
        jobIndex: 0,
        finishedJobs: 1,
        totalJobs: 3,
        status: "completed",
      },
      {
        mode: "sequential",
        jobIndex: 2,
        finishedJobs: 2,
        totalJobs: 3,
        status: "command_failed",
      },
    ]);
  });

  it("stops on failed steps when continueOnFailure is false", async () => {
    const result = await runSequentialWorkers([
      {
        kind: "cursor",
        continueOnFailure: false,
        input: {
          taskId: "cursor-1",
          prompt: "Review this diff.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => createCursorCommandResult({ exitCode: 1, stderr: "bad diff" }),
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
    ]);

    expect(result).toMatchObject({
      status: "step_failed",
      failedStepIndex: 0,
      error: "Workflow stopped after step 1 returned status 'command_failed'.",
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0] && "result" in result.results[0] ? result.results[0].result.status : undefined).toBe("command_failed");
  });

  it("stops with step_failed when a step builder throws", async () => {
    const result = await runSequentialWorkers([
      {
        kind: "gemini",
        input: {
          taskId: "gemini-1",
          prompt: "Summarize retrieval flow.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => createGeminiCommandResult(),
        },
      },
      () => {
        throw new Error("cannot build next prompt");
      },
      {
        kind: "cursor",
        input: {
          taskId: "cursor-2",
          prompt: "This should never run.",
          model: "composer-2",
        },
      },
    ]);

    expect(result).toEqual({
      status: "step_failed",
      results: [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize retrieval flow.",
            model: "gemini-3-flash-preview",
          },
          retryCount: 0,
          result: expect.objectContaining({
            status: "completed",
            response: "Gemini summary",
          }),
        },
      ],
      failedStepIndex: 1,
      error: "cannot build next prompt",
    });
  });
});
