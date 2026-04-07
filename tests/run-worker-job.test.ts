import { describe, expect, it, vi } from "vitest";

import type { CursorCommandRunResult } from "../src/features/cursor/types.js";
import type { GeminiCommandRunResult } from "../src/features/gemini/types.js";
import type { GeminiCacheStore } from "../src/features/gemini/core/gemini-cache-store.js";
import { runWorkerJob } from "../src/features/orchestration/run-worker-job.js";

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

describe("runWorkerJob", () => {
  it("retries retryable worker failures and returns the later success", async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;

    const result = await runWorkerJob(
      {
        kind: "gemini",
        retries: 2,
        retryDelayMs: 10,
        input: {
          taskId: "gemini-1",
          prompt: "Summarize this repo.",
          model: "gemini-3-flash-preview",
        },
        dependencies: {
          cacheStore: createNoopCacheStore(),
          runCommand: async () => {
            attempts += 1;

            if (attempts < 3) {
              return createGeminiCommandResult({ exitCode: 1, stderr: "rate limit" });
            }

            return createGeminiCommandResult();
          },
        },
      },
      { sleep },
    );

    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
    expect(result && "result" in result ? result.result.status : undefined).toBe("completed");
    expect(result ? result.retryCount : undefined).toBe(2);
  });

  it("does not retry invalid input failures", async () => {
    const sleep = vi.fn(async () => undefined);

    const result = await runWorkerJob(
      {
        kind: "cursor",
        retries: 3,
        input: {
          taskId: "cursor-1",
          prompt: "Review this repo.",
          model: "",
        },
      },
      { sleep },
    );

    expect(result && "result" in result ? result.result.status : undefined).toBe("invalid_input");
    expect(result ? result.retryCount : undefined).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries runner failures and returns the final failure when retries are exhausted", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await runWorkerJob(
      {
        kind: "cursor",
        retries: 1,
        retryDelayMs: 5,
        input: {
          taskId: "cursor-1",
          prompt: "Review this repo.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => {
            throw new Error("spawn crash");
          },
        },
      },
      { sleep },
    );

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      kind: "cursor",
      input: {
        taskId: "cursor-1",
        prompt: "Review this repo.",
        model: "composer-2",
      },
      retryCount: 1,
      status: "runner_failed",
      error: "spawn crash",
    });
  });

  it("returns the first successful result without sleeping", async () => {
    const sleep = vi.fn(async () => undefined);

    const result = await runWorkerJob(
      {
        kind: "cursor",
        retries: 2,
        input: {
          taskId: "cursor-1",
          prompt: "Review this repo.",
          model: "composer-2",
        },
        dependencies: {
          runCommand: async () => createCursorCommandResult(),
        },
      },
      { sleep },
    );

    expect(result && "result" in result ? result.result.status : undefined).toBe("completed");
    expect(result ? result.retryCount : undefined).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
  });
});
