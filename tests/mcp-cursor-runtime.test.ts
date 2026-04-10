import { beforeEach, describe, expect, it, vi } from "vitest";

import { mcpCursorRuntime } from "../src/features/cursor/runtime/mcp/mcp-cursor-runtime.js";
import type { CursorCommandRunResult, CursorWorkerResult } from "../src/features/cursor/types.js";

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

  it("starts an async Cursor worker and polls until a final result is available", async () => {
    const workerResult: CursorWorkerResult = {
      taskId: baseInput.taskId,
      status: "completed",
      requestedModel: baseInput.model,
      reportedModel: baseInput.model,
      response: "Cursor done.",
      raw: { type: "result", subtype: "success", result: "Cursor done.", model: baseInput.model },
      durationMs: 1000,
      startedAt: "2026-04-08T00:00:00.000Z",
      finishedAt: "2026-04-08T00:00:01.000Z",
    };
    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "cursor", status: "running", pollIntervalMs: 1, resultTool: "get_cursor_worker_result" }) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "cursor", status: "completed", workflowStatus: "completed", retryCount: 0, result: workerResult, summary: { totalJobs: 1, finishedJobs: 1, completedJobs: 1, failedJobs: 0, skippedJobs: 0, startedAt: "2026-04-08T00:00:00.000Z", finishedAt: "2026-04-08T00:00:01.000Z", durationMs: 1000 }, createdAt: "2026-04-08T00:00:00.000Z", updatedAt: "2026-04-08T00:00:01.000Z" }) }],
      });

    const result = await mcpCursorRuntime.run(baseInput);

    expect(result).toEqual(sampleCommandResult({ stdout: '{"type":"result","subtype":"success","result":"Cursor done.","model":"composer-2"}' }));
    expect(mockCallTool).toHaveBeenNthCalledWith(
      1,
      {
        name: "run_cursor_worker_async",
        arguments: {
          taskId: baseInput.taskId,
          prompt: baseInput.prompt,
          model: baseInput.model,
        },
      },
      undefined,
    );
    expect(mockCallTool).toHaveBeenNthCalledWith(
      2,
      {
        name: "get_cursor_worker_result",
        arguments: {
          requestId: "workflow_1234567890abcdef1234567890abcdef",
        },
      },
      undefined,
    );
  });

  it("maps async start tool errors to a failed command envelope", async () => {
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
