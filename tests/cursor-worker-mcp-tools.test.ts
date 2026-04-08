import { describe, expect, it, vi } from "vitest";

vi.mock("../src/features/cursor/runtime/shell/shell-cursor-runtime.js", () => ({
  shellCursorRuntime: {
    run: vi.fn(async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      timedOut: false,
      startedAt: "2026-04-08T00:00:00.000Z",
      finishedAt: "2026-04-08T00:00:00.000Z",
      durationMs: 0,
    })),
  },
}));

import { getRegisteredCursorWorkerTools } from "../src/features/cursor/mcp/register-cursor-worker-tools.js";
import { shellCursorRuntime } from "../src/features/cursor/runtime/shell/shell-cursor-runtime.js";

describe("getRegisteredCursorWorkerTools", () => {
  it("registers run_cursor_worker backed by the shell runtime", async () => {
    const tools = getRegisteredCursorWorkerTools();
    const tool = tools.find((item) => item.name === "run_cursor_worker");

    expect(tool).toBeDefined();
    expect(Object.keys(tool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["taskId", "prompt", "model"]),
    );

    await tool?.execute({
      taskId: "t1",
      prompt: "ping",
      model: "composer-2",
    });

    expect(shellCursorRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t1",
        prompt: "ping",
        model: "composer-2",
      }),
    );
  });
});
