import { describe, expect, it } from "vitest";

import { classifyWorkerJobError } from "../src/features/orchestration/job-error-class.js";

describe("classifyWorkerJobError", () => {
  it("classifies infrastructure failures from runner crashes", () => {
    expect(
      classifyWorkerJobError({
        kind: "cursor",
        input: { taskId: "c1", prompt: "review", model: "composer-2" },
        retryCount: 0,
        status: "runner_failed",
        error: "spawn failed",
      }),
    ).toBe("infra_failure");
  });

  it("classifies capacity exhaustion ahead of generic rate limits", () => {
    expect(
      classifyWorkerJobError({
        kind: "gemini",
        input: { taskId: "g1", prompt: "summarize", model: "gemini-3-flash-preview" },
        retryCount: 0,
        result: {
          status: "command_failed",
          durationMs: 1000,
          startedAt: "2026-04-06T00:00:00.000Z",
          finishedAt: "2026-04-06T00:00:01.000Z",
          error: "MODEL_CAPACITY_EXHAUSTED: no capacity available",
          stderr: "429 RESOURCE_EXHAUSTED",
        },
      }),
    ).toBe("capacity_exhausted");
  });

  it("classifies generic command failures with 429 signals as rate limited", () => {
    expect(
      classifyWorkerJobError({
        kind: "gemini",
        input: { taskId: "g2", prompt: "summarize", model: "gemini-3-flash-preview" },
        retryCount: 1,
        result: {
          status: "command_failed",
          durationMs: 1000,
          startedAt: "2026-04-06T00:00:00.000Z",
          finishedAt: "2026-04-06T00:00:01.000Z",
          error: "429 rate limit exceeded",
        },
      }),
    ).toBe("rate_limited");
  });

  it("classifies unrecognized command failures as provider errors", () => {
    expect(
      classifyWorkerJobError({
        kind: "cursor",
        input: { taskId: "c2", prompt: "review", model: "composer-2" },
        retryCount: 0,
        result: {
          status: "command_failed",
          durationMs: 1000,
          startedAt: "2026-04-06T00:00:00.000Z",
          finishedAt: "2026-04-06T00:00:01.000Z",
          error: "upstream returned a malformed tool envelope",
        },
      }),
    ).toBe("provider_error");
  });
});
