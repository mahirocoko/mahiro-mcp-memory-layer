import { beforeEach, describe, expect, it, vi } from "vitest";

import { mcpCursorRuntime } from "../src/features/cursor/runtime/mcp/mcp-cursor-runtime.js";
import type { CursorCommandRunResult } from "../src/features/cursor/types.js";

const { mockConnect, mockCallTool, mockClose } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockCallTool: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    callTool: mockCallTool,
    close: mockClose,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

const baseInput = {
  taskId: "task-mcp",
  prompt: "Hello",
  model: "composer-2",
} as const;

function sampleCommandResult(overrides: Partial<CursorCommandRunResult> = {}): CursorCommandRunResult {
  return {
    stdout: "{}",
    stderr: "",
    exitCode: 0,
    signal: null,
    timedOut: false,
    startedAt: "2026-04-08T00:00:00.000Z",
    finishedAt: "2026-04-08T00:00:01.000Z",
    durationMs: 1000,
    ...overrides,
  };
}

describe("mcpCursorRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  it("returns parsed command JSON from the run_cursor_worker tool payload", async () => {
    const cmd = sampleCommandResult({ stdout: '{"type":"result"}' });
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(cmd, null, 2) }],
    });

    const result = await mcpCursorRuntime.run(baseInput);

    expect(result).toEqual(cmd);
    expect(mockCallTool).toHaveBeenCalledWith(
      {
        name: "run_cursor_worker",
        arguments: {
          taskId: baseInput.taskId,
          prompt: baseInput.prompt,
          model: baseInput.model,
        },
      },
      undefined,
      undefined,
    );
  });

  it("maps isError tool results to a failed command envelope", async () => {
    mockCallTool.mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "bad input" }],
    });

    const result = await mcpCursorRuntime.run(baseInput);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("bad input");
  });

  it("returns spawn_error when connect throws", async () => {
    mockCallTool.mockRejectedValue(new Error("never"));
    mockConnect.mockRejectedValue(new Error("connect failed"));

    const result = await mcpCursorRuntime.run(baseInput);

    expect(result.spawnError).toContain("connect failed");
  });
});
