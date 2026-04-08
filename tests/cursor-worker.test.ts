import { describe, expect, it } from "vitest";

import { runCursorWorker } from "../src/features/cursor/cursor-worker-service.js";
import type { CursorCommandRunResult, CursorWorkerInput } from "../src/features/cursor/types.js";

const baseInput: CursorWorkerInput = {
  taskId: "task-123",
  prompt: "Review this file.",
  model: "composer-2",
};

function createCommandResult(overrides: Partial<CursorCommandRunResult> = {}): CursorCommandRunResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-04-04T07:20:00.000Z",
    finishedAt: "2026-04-04T07:20:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

describe("runCursorWorker", () => {
  it("returns a completed normalized result for valid Cursor JSON", async () => {
    const result = await runCursorWorker(baseInput, {
      runtime: {
        run: async () =>
          createCommandResult({
            stdout: JSON.stringify({
              type: "result",
              subtype: "success",
              result: "Done.",
              session_id: "session-1",
              model: "gpt-5",
            }),
          }),
      },
    });

    expect(result.status).toBe("completed");
    expect(result.response).toBe("Done.");
    expect(result.requestedModel).toBe("composer-2");
    expect(result.reportedModel).toBe("gpt-5");
  });

  it("returns invalid_input when model is missing from the worker payload", async () => {
    const result = await runCursorWorker(
      { taskId: "task-bad", prompt: "Review this.", model: "" } as unknown as typeof baseInput,
      { runtime: { run: async () => createCommandResult() } },
    );

    expect(result.status).toBe("invalid_input");
  });

  it("returns command_failed when Cursor exits non-zero", async () => {
    const result = await runCursorWorker(baseInput, {
      runtime: {
        run: async () =>
          createCommandResult({
            exitCode: 2,
            stderr: "permission denied",
            stdout: JSON.stringify({
              type: "result",
              subtype: "error",
              is_error: true,
            }),
          }),
      },
    });

    expect(result.status).toBe("command_failed");
    expect(result.error).toContain("permission denied");
  });

  it("returns invalid_json when stdout cannot be parsed", async () => {
    const result = await runCursorWorker(baseInput, {
      runtime: { run: async () => createCommandResult({ stdout: "not-json" }) },
    });

    expect(result.status).toBe("invalid_json");
  });

  it("returns empty_output when Cursor prints nothing", async () => {
    const result = await runCursorWorker(baseInput, {
      runtime: { run: async () => createCommandResult() },
    });

    expect(result.status).toBe("empty_output");
  });

  it("returns timeout when the command times out", async () => {
    const result = await runCursorWorker({ ...baseInput, timeoutMs: 5000 }, {
      runtime: { run: async () => createCommandResult({ timedOut: true }) },
    });

    expect(result.status).toBe("timeout");
    expect(result.error).toContain("5000ms");
  });

  it("returns spawn_error when the binary cannot be launched", async () => {
    const result = await runCursorWorker(baseInput, {
      runtime: {
        run: async () => createCommandResult({ spawnError: "spawn agent ENOENT", exitCode: null }),
      },
    });

    expect(result.status).toBe("spawn_error");
    expect(result.error).toContain("ENOENT");
  });
});
