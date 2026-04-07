import { describe, expect, it } from "vitest";

import { runParallelWorkers } from "../src/features/orchestration/run-parallel-workers.js";
import type { WorkerJob } from "../src/features/orchestration/types.js";
import type { GeminiCommandRunResult } from "../src/features/gemini/types.js";
import type { CursorCommandRunResult } from "../src/features/cursor/types.js";
import type { GeminiCacheStore } from "../src/features/gemini/core/gemini-cache-store.js";

function createGeminiCommandResult(
  overrides: Partial<GeminiCommandRunResult> = {},
): GeminiCommandRunResult {
  return {
    stdout: JSON.stringify({
      response: "Gemini done.",
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
      result: "Cursor done.",
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

describe("runParallelWorkers", () => {
  it("returns an empty array when there are no jobs", async () => {
    await expect(runParallelWorkers([])).resolves.toEqual({
      results: [],
      timedOut: false,
    });
  });

  it("runs mixed Gemini and Cursor jobs in parallel and preserves input order", async () => {
    let activeRuns = 0;
    let maxConcurrentRuns = 0;

    const waitForOverlap = async () => {
      activeRuns += 1;
      maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRuns -= 1;
    };

    const jobs: readonly WorkerJob[] = [
      {
        kind: "gemini",
        input: {
          taskId: "gemini-1",
          prompt: "Summarize this module.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => {
            await waitForOverlap();
            return createGeminiCommandResult();
          },
        },
      },
      {
        kind: "cursor",
        input: {
          taskId: "cursor-1",
          prompt: "Review this module.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => {
            await waitForOverlap();
            return createCursorCommandResult();
          },
        },
      },
    ];

    const parallelRun = await runParallelWorkers(jobs);
    const { results } = parallelRun;

    expect(results).toHaveLength(2);
    expect(results[0]?.kind).toBe("gemini");
    expect(results[1]?.kind).toBe("cursor");
    expect(results[0] && "result" in results[0] ? results[0].result.status : undefined).toBe("completed");
    expect(results[1] && "result" in results[1] ? results[1].result.status : undefined).toBe("completed");
    expect(parallelRun.timedOut).toBe(false);
    expect(maxConcurrentRuns).toBeGreaterThan(1);
  });

  it("fans out many same-kind workers in parallel", async () => {
    let activeRuns = 0;
    let maxConcurrentRuns = 0;

    const jobs: readonly WorkerJob[] = Array.from({ length: 5 }, (_unused, index) => ({
      kind: "cursor" as const,
      input: {
        taskId: `cursor-${index + 1}`,
        prompt: `Review module ${index + 1}.`,
        model: "composer-2",
      },
      dependencies: {
        runCommand: async () => {
          activeRuns += 1;
          maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeRuns -= 1;

          return createCursorCommandResult({
            stdout: JSON.stringify({
              type: "result",
              subtype: "success",
              result: `Cursor ${index + 1} done.`,
              model: "composer-2",
            }),
          });
        },
      },
    }));

    const parallelRun = await runParallelWorkers(jobs);
    const { results } = parallelRun;

    expect(results).toHaveLength(5);
    expect(results.every((item) => item.kind === "cursor")).toBe(true);
    expect(
      results.map((item) => ("result" in item ? item.result.response : item.error)),
    ).toEqual([
      "Cursor 1 done.",
      "Cursor 2 done.",
      "Cursor 3 done.",
      "Cursor 4 done.",
      "Cursor 5 done.",
    ]);
    expect(parallelRun.timedOut).toBe(false);
    expect(maxConcurrentRuns).toBeGreaterThan(1);
  });

  it("respects maxConcurrency while preserving input order", async () => {
    let activeRuns = 0;
    let maxConcurrentRuns = 0;

    const jobs: readonly WorkerJob[] = Array.from({ length: 5 }, (_unused, index) => ({
      kind: "cursor" as const,
      input: {
        taskId: `cursor-${index + 1}`,
        prompt: `Review module ${index + 1}.`,
        model: "composer-2",
      },
      dependencies: {
        runCommand: async () => {
          activeRuns += 1;
          maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeRuns -= 1;

          return createCursorCommandResult({
            stdout: JSON.stringify({
              type: "result",
              subtype: "success",
              result: `Cursor ${index + 1} done.`,
              model: "composer-2",
            }),
          });
        },
      },
    }));

    const parallelRun = await runParallelWorkers(jobs, { maxConcurrency: 2 });
    const { results } = parallelRun;

    expect(results).toHaveLength(5);
    expect(
      results.map((item) => ("result" in item ? item.result.response : item.error)),
    ).toEqual([
      "Cursor 1 done.",
      "Cursor 2 done.",
      "Cursor 3 done.",
      "Cursor 4 done.",
      "Cursor 5 done.",
    ]);
    expect(parallelRun.timedOut).toBe(false);
    expect(maxConcurrentRuns).toBe(2);
  });

  it("emits job completion events as jobs finish", async () => {
    const events: Array<{ mode: string; jobIndex: number; finishedJobs: number; totalJobs: number; status?: string }> = [];

    await runParallelWorkers(
      [
        {
          kind: "gemini",
          input: {
            taskId: "gemini-1",
            prompt: "Summarize this module.",
            model: "gemini-3-flash-preview",
          },
          dependencies: {
            cacheStore: createNoopCacheStore(),
            runCommand: async () => createGeminiCommandResult(),
          },
        },
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

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.mode === "parallel")).toBe(true);
    expect(events.map((event) => event.totalJobs)).toEqual([2, 2]);
    expect(events.map((event) => event.finishedJobs)).toEqual([1, 2]);
    expect(events.map((event) => event.status).sort()).toEqual(["command_failed", "completed"]);
  });

  it("stops launching new jobs when the workflow timeout expires", async () => {
    const parallelRun = await runParallelWorkers(
      Array.from({ length: 4 }, (_unused, index) => ({
        kind: "cursor" as const,
        input: {
          taskId: `cursor-${index + 1}`,
          prompt: `Review module ${index + 1}.`,
          model: "composer-2",
        },
        dependencies: {
          runCommand: async (input) => {
            await new Promise((resolve) => setTimeout(resolve, (input.timeoutMs ?? 0) + 5));
            return createCursorCommandResult({
              exitCode: null,
              signal: "SIGTERM",
              timedOut: true,
            });
          },
        },
      })),
      { maxConcurrency: 1, timeoutMs: 10 },
    );

    expect(parallelRun.timedOut).toBe(true);
    expect(parallelRun.results).toHaveLength(1);
    expect(parallelRun.results[0] && "result" in parallelRun.results[0] ? parallelRun.results[0].result.status : undefined).toBe("timeout");
  });

  it("keeps per-job worker failures without failing the whole orchestration", async () => {
    const parallelRun = await runParallelWorkers([
      {
        kind: "gemini",
        input: {
          taskId: "gemini-1",
          prompt: "Summarize this module.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => createGeminiCommandResult({ exitCode: 1, stderr: "api error" }),
        },
      },
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
    const { results } = parallelRun;

    expect(results).toHaveLength(2);
    expect(results[0] && "result" in results[0] ? results[0].result.status : undefined).toBe("command_failed");
    expect(results[1] && "result" in results[1] ? results[1].result.status : undefined).toBe("completed");
    expect(parallelRun.timedOut).toBe(false);
  });

  it("converts unexpected thrown worker errors into runner_failed results", async () => {
    const parallelRun = await runParallelWorkers([
      {
        kind: "cursor",
        input: {
          taskId: "cursor-1",
          prompt: "Review this module.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => {
            throw new Error("boom");
          },
        },
      },
    ]);
    const [result] = parallelRun.results;

    expect(result).toEqual({
      kind: "cursor",
      input: {
        taskId: "cursor-1",
        prompt: "Review this module.",
        model: "composer-2",
      },
      status: "runner_failed",
      retryCount: 0,
      error: "boom",
    });
    expect(parallelRun.timedOut).toBe(false);
  });
});
