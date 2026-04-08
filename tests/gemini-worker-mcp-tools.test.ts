import { describe, expect, it, vi } from "vitest";

vi.mock("../src/features/gemini/runtime/shell/shell-gemini-runtime.js", () => ({
  shellGeminiRuntime: {
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

import { getRegisteredGeminiWorkerTools } from "../src/features/gemini/mcp/register-gemini-worker-tools.js";
import { shellGeminiRuntime } from "../src/features/gemini/runtime/shell/shell-gemini-runtime.js";

describe("getRegisteredGeminiWorkerTools", () => {
  it("registers run_gemini_worker backed by the shell runtime", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "run_gemini_worker");

    expect(tool).toBeDefined();
    expect(Object.keys(tool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["taskId", "prompt", "model"]),
    );

    await tool?.execute({
      taskId: "t1",
      prompt: "ping",
      model: "gemini-3-flash-preview",
    });

    expect(shellGeminiRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t1",
        prompt: "ping",
        model: "gemini-3-flash-preview",
      }),
    );
  });
});
