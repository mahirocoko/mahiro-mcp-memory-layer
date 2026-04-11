import { beforeEach, describe, expect, it, vi } from "vitest";

import { mcpGeminiRuntime } from "../src/features/gemini/runtime/mcp/mcp-gemini-runtime.js";
import type { GeminiCommandRunResult, GeminiWorkerResult } from "../src/features/gemini/types.js";

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
  model: "gemini-3-flash-preview",
} as const;

function sampleCommandResult(overrides: Partial<GeminiCommandRunResult> = {}): GeminiCommandRunResult {
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

describe("mcpGeminiRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  it("starts an async Gemini worker and polls until a final result is available", async () => {
    const workerResult: GeminiWorkerResult = {
      taskId: baseInput.taskId,
      status: "completed",
      requestedModel: baseInput.model,
      reportedModel: baseInput.model,
      response: "ok",
      raw: { response: "ok", stats: { model: baseInput.model } },
      durationMs: 1000,
      startedAt: "2026-04-08T00:00:00.000Z",
      finishedAt: "2026-04-08T00:00:01.000Z",
    };
    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "gemini", status: "running", pollIntervalMs: 1, resultTool: "get_gemini_worker_result" }) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "gemini", status: "completed", workflowStatus: "completed", retryCount: 0, result: workerResult, summary: { totalJobs: 1, finishedJobs: 1, completedJobs: 1, failedJobs: 0, skippedJobs: 0, startedAt: "2026-04-08T00:00:00.000Z", finishedAt: "2026-04-08T00:00:01.000Z", durationMs: 1000 }, createdAt: "2026-04-08T00:00:00.000Z", updatedAt: "2026-04-08T00:00:01.000Z" }) }],
      });

    const result = await mcpGeminiRuntime.run(baseInput);

    expect(result).toEqual(sampleCommandResult({ stdout: '{"response":"ok","stats":{"model":"gemini-3-flash-preview"}}' }));
    expect(mockCallTool).toHaveBeenNthCalledWith(
      1,
      {
        name: "run_gemini_worker_async",
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
        name: "get_gemini_worker_result",
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

    const result = await mcpGeminiRuntime.run(baseInput);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("bad input");
  });

  it("passes timeoutMs through the async start tool input", async () => {
    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "gemini", status: "running", pollIntervalMs: 1, resultTool: "get_gemini_worker_result" }) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "gemini", status: "timeout", workflowStatus: "timed_out", retryCount: 0, result: { taskId: baseInput.taskId, status: "timeout", requestedModel: baseInput.model, durationMs: 300000, startedAt: "2026-04-08T00:00:00.000Z", finishedAt: "2026-04-08T00:05:00.000Z", error: "timed out" }, summary: { totalJobs: 1, finishedJobs: 1, completedJobs: 0, failedJobs: 1, skippedJobs: 0, startedAt: "2026-04-08T00:00:00.000Z", finishedAt: "2026-04-08T00:05:00.000Z", durationMs: 300000 }, createdAt: "2026-04-08T00:00:00.000Z", updatedAt: "2026-04-08T00:05:00.000Z" }) }],
      });

    await mcpGeminiRuntime.run({
      ...baseInput,
      timeoutMs: 300_000,
    });

    expect(mockCallTool).toHaveBeenNthCalledWith(
      1,
      {
        name: "run_gemini_worker_async",
        arguments: {
          taskId: baseInput.taskId,
          prompt: baseInput.prompt,
          model: baseInput.model,
          timeoutMs: 300_000,
        },
      },
      undefined,
    );
  });

  it("passes approval mode and MCP allowlist through the async start tool input", async () => {
    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "gemini", status: "running", pollIntervalMs: 1, resultTool: "get_gemini_worker_result" }) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ requestId: "workflow_1234567890abcdef1234567890abcdef", taskId: baseInput.taskId, kind: "gemini", status: "completed", workflowStatus: "completed", retryCount: 0, result: { taskId: baseInput.taskId, status: "completed", requestedModel: baseInput.model, reportedModel: baseInput.model, response: "ok", raw: { response: "ok", stats: { model: baseInput.model } }, durationMs: 1, startedAt: "2026-04-08T00:00:00.000Z", finishedAt: "2026-04-08T00:00:00.001Z" }, summary: { totalJobs: 1, finishedJobs: 1, completedJobs: 1, failedJobs: 0, skippedJobs: 0, startedAt: "2026-04-08T00:00:00.000Z", finishedAt: "2026-04-08T00:00:00.001Z", durationMs: 1 }, createdAt: "2026-04-08T00:00:00.000Z", updatedAt: "2026-04-08T00:00:00.001Z" }) }],
      });

    await mcpGeminiRuntime.run({
      ...baseInput,
      approvalMode: "plan",
      allowedMcpServerNames: "none",
    });

    expect(mockCallTool).toHaveBeenNthCalledWith(
      1,
      {
        name: "run_gemini_worker_async",
        arguments: {
          taskId: baseInput.taskId,
          prompt: baseInput.prompt,
          model: baseInput.model,
          approvalMode: "plan",
          allowedMcpServerNames: "none",
        },
      },
      undefined,
    );
  });

  it("returns spawn_error when connect throws", async () => {
    mockCallTool.mockRejectedValue(new Error("never"));
    mockConnect.mockRejectedValue(new Error("connect failed"));

    const result = await mcpGeminiRuntime.run(baseInput);

    expect(result.spawnError).toContain("connect failed");
  });
});
