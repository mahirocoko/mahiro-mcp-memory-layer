import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrchestrationResultRecord } from "../src/features/orchestration/observability/orchestration-result-store.js";

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

const orchestrationTraceStoreMock = {
  append: vi.fn(async () => undefined),
};

vi.mock("../src/features/orchestration/observability/orchestration-trace.js", async () => {
  const actual = await vi.importActual<typeof import("../src/features/orchestration/observability/orchestration-trace.js")>(
    "../src/features/orchestration/observability/orchestration-trace.js",
  );

  return {
    ...actual,
    OrchestrationTraceStore: vi.fn(() => orchestrationTraceStoreMock),
  };
});

const orchestrationResultStoreMock = {
  writeRunning: vi.fn(async ({ requestId, source, spec }) => ({
    requestId,
    source,
    metadata: { mode: spec.mode, taskIds: spec.jobs?.map((job: { input: { taskId: string } }) => job.input.taskId) ?? [] },
    status: "running",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  })),
  writeCompleted: vi.fn(async () => undefined),
  writeRunnerFailed: vi.fn(async () => undefined),
  read: vi.fn<() => Promise<OrchestrationResultRecord | null>>(async () => null),
};

vi.mock("../src/features/orchestration/observability/orchestration-result-store.js", () => ({
  OrchestrationResultStore: vi.fn(() => orchestrationResultStoreMock),
}));

vi.mock("../src/features/orchestration/run-orchestration-workflow.js", () => ({
  runOrchestrationWorkflow: vi.fn(async (spec, options) => ({
    requestId: options?.traceRequestId,
    mode: spec.mode,
    status: "completed",
    results: [],
    summary: {
      totalJobs: 1,
      finishedJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
      skippedJobs: 0,
      startedAt: "2026-04-10T00:00:00.000Z",
      finishedAt: "2026-04-10T00:00:00.100Z",
      durationMs: 100,
    },
  })),
}));

import { getRegisteredCursorWorkerTools } from "../src/features/cursor/mcp/register-cursor-worker-tools.js";
import { shellCursorRuntime } from "../src/features/cursor/runtime/shell/shell-cursor-runtime.js";
import { runOrchestrationWorkflow } from "../src/features/orchestration/run-orchestration-workflow.js";

describe("getRegisteredCursorWorkerTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers run_cursor_worker backed by the shell runtime", async () => {
    const tools = getRegisteredCursorWorkerTools();
    const tool = tools.find((item) => item.name === "run_cursor_worker");

    expect(tool).toBeDefined();
    expect(Object.keys(tool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["taskId", "prompt", "model"]),
    );

    const result = await tool?.execute({
      taskId: "t1",
      prompt: "ping",
      model: "composer-2",
    });

    expect(result).toMatchObject({
      executionMode: "sync",
      preferredAsyncTool: "run_cursor_worker_async",
      resultTool: "get_cursor_worker_result",
      warning:
        "This tool blocks until the worker finishes. For long-running Cursor jobs, prefer run_cursor_worker_async and poll get_cursor_worker_result with the returned workflow requestId.",
    });

    expect(shellCursorRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t1",
        prompt: "ping",
        model: "composer-2",
      }),
    );
  });

  it("registers an async Cursor worker start tool backed by orchestration", async () => {
    const tools = getRegisteredCursorWorkerTools();
    const tool = tools.find((item) => item.name === "run_cursor_worker_async");

    const result = await tool?.execute({
      taskId: "t1",
      prompt: "ping",
      model: "composer-2",
    });

    expect(result).toMatchObject({
      taskId: "t1",
      kind: "cursor",
      status: "running",
      resultTool: "get_cursor_worker_result",
    });
    expect(vi.mocked(runOrchestrationWorkflow)).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "parallel",
        jobs: [
          expect.objectContaining({
            kind: "cursor",
            input: expect.objectContaining({
              taskId: "t1",
              prompt: "ping",
              model: "composer-2",
            }),
          }),
        ],
      }),
      expect.objectContaining({
        traceSource: "mcp",
      }),
    );
  });
});
