import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrchestrationResultRecord } from "../src/features/orchestration/observability/orchestration-result-store.js";

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
    metadata: {
      mode: spec.mode,
      taskIds: spec.jobs?.map((job: { input: { taskId: string } }) => job.input.taskId) ?? [],
      jobs: spec.jobs?.map((job: { input: { taskId: string }, retries?: number, retryDelayMs?: number, workerRuntime?: "shell" | "mcp" }) => ({
        taskId: job.input.taskId,
        ...(typeof job.retries === "number" ? { configuredRetries: job.retries } : {}),
        ...(typeof job.retryDelayMs === "number" ? { configuredRetryDelayMs: job.retryDelayMs } : {}),
        ...(job.workerRuntime ? { workerRuntime: job.workerRuntime } : {}),
      })) ?? [],
    },
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

import { getRegisteredGeminiWorkerTools } from "../src/features/gemini/mcp/register-gemini-worker-tools.js";
import { shellGeminiRuntime } from "../src/features/gemini/runtime/shell/shell-gemini-runtime.js";
import { runOrchestrationWorkflow } from "../src/features/orchestration/run-orchestration-workflow.js";

describe("getRegisteredGeminiWorkerTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers run_gemini_worker backed by the shell runtime", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "run_gemini_worker");

    expect(tool).toBeDefined();
    expect(Object.keys(tool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["taskId", "prompt", "model"]),
    );

    const result = await tool?.execute({
      taskId: "t1",
      prompt: "ping",
      model: "gemini-3-flash-preview",
    });

    expect(result).toMatchObject({
      executionMode: "sync",
      preferredAsyncTool: "run_gemini_worker_async",
      resultTool: "get_gemini_worker_result",
      warning:
        "This tool blocks until the worker finishes. For long-running Gemini jobs, prefer run_gemini_worker_async and poll get_gemini_worker_result with the returned workflow requestId.",
    });

    expect(shellGeminiRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t1",
        prompt: "ping",
        model: "gemini-3-flash-preview",
      }),
    );
  });

  it("registers an async Gemini worker start tool backed by orchestration", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "run_gemini_worker_async");

    const result = await tool?.execute({
      taskId: "t1",
      prompt: "ping",
      model: "gemini-3-flash-preview",
      retries: 2,
      retryDelayMs: 500,
    });

    expect(result).toMatchObject({
      taskId: "t1",
      kind: "gemini",
      status: "running",
      resultTool: "get_gemini_worker_result",
    });
    expect(vi.mocked(runOrchestrationWorkflow)).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "parallel",
        jobs: [
          expect.objectContaining({
            kind: "gemini",
            workerRuntime: "shell",
            retries: 2,
            retryDelayMs: 500,
            input: expect.objectContaining({
              taskId: "t1",
              prompt: "ping",
              model: "gemini-3-flash-preview",
            }),
          }),
        ],
      }),
      expect.objectContaining({
        traceSource: "mcp",
      }),
    );
  });

  it("keeps retry controls on the async job envelope", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "run_gemini_worker_async");

    await tool?.execute({
      taskId: "t2",
      prompt: "ping",
      model: "gemini-3-flash-preview",
      retries: 1,
      retryDelayMs: 250,
    });

    expect(vi.mocked(runOrchestrationWorkflow)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jobs: [
          expect.objectContaining({
            input: {
              taskId: "t2",
              prompt: "ping",
              model: "gemini-3-flash-preview",
            },
            retries: 1,
            retryDelayMs: 250,
            workerRuntime: "shell",
          }),
        ],
      }),
      expect.anything(),
    );
  });

  it("maps async Gemini worker polling to the first orchestration job result", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "get_gemini_worker_result");

    orchestrationResultStoreMock.read.mockResolvedValueOnce({
      requestId: "workflow_1234567890abcdef1234567890abcdef",
      source: "mcp",
      metadata: {
        mode: "parallel",
        taskIds: ["t1"],
        jobs: [{ taskId: "t1", configuredRetries: 2, configuredRetryDelayMs: 500, workerRuntime: "shell" }],
      },
      status: "completed",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:01.000Z",
      result: {
        requestId: "workflow_1234567890abcdef1234567890abcdef",
        mode: "parallel",
        status: "completed",
        results: [
          {
            kind: "gemini",
            input: {
              taskId: "t1",
              prompt: "ping",
              model: "gemini-3-flash-preview",
            },
            retryCount: 0,
            result: {
              taskId: "t1",
              status: "completed",
              requestedModel: "gemini-3-flash-preview",
              reportedModel: "gemini-3-flash-preview",
              response: "ok",
              durationMs: 10,
              startedAt: "2026-04-10T00:00:00.000Z",
              finishedAt: "2026-04-10T00:00:00.010Z",
            },
          },
        ],
        summary: {
          totalJobs: 1,
          finishedJobs: 1,
          completedJobs: 1,
          failedJobs: 0,
          skippedJobs: 0,
          startedAt: "2026-04-10T00:00:00.000Z",
          finishedAt: "2026-04-10T00:00:00.010Z",
          durationMs: 10,
        },
      },
    } satisfies OrchestrationResultRecord);

    const result = await tool?.execute({
      requestId: "workflow_1234567890abcdef1234567890abcdef",
    });

    expect(result).toMatchObject({
      requestId: "workflow_1234567890abcdef1234567890abcdef",
      taskId: "t1",
      kind: "gemini",
      status: "completed",
      workflowStatus: "completed",
      configuredRetries: 2,
      configuredRetryDelayMs: 500,
      result: {
        response: "ok",
      },
    });
  });

  it("maps async Gemini worker polling while still running", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "get_gemini_worker_result");

    orchestrationResultStoreMock.read.mockResolvedValueOnce({
      requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      source: "mcp",
      metadata: {
        mode: "parallel",
        taskIds: ["t-running"],
        jobs: [{ taskId: "t-running", configuredRetries: 3, configuredRetryDelayMs: 750, workerRuntime: "shell" }],
      },
      status: "running",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:02.000Z",
    } satisfies OrchestrationResultRecord);

    const result = await tool?.execute({
      requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(result).toMatchObject({
      requestId: "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      taskId: "t-running",
      kind: "gemini",
      status: "running",
      workflowStatus: "running",
      pollIntervalMs: 1000,
      configuredRetries: 3,
      configuredRetryDelayMs: 750,
    });
  });

  it("maps async Gemini worker polling when orchestration runner fails before a job result", async () => {
    const tools = getRegisteredGeminiWorkerTools();
    const tool = tools.find((item) => item.name === "get_gemini_worker_result");

    orchestrationResultStoreMock.read.mockResolvedValueOnce({
      requestId: "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source: "mcp",
      metadata: {
        mode: "parallel",
        taskIds: ["t-runner-failed"],
        jobs: [{ taskId: "t-runner-failed", configuredRetries: 1, configuredRetryDelayMs: 250, workerRuntime: "shell" }],
      },
      status: "runner_failed",
      error: "worker process exited unexpectedly",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:03.000Z",
    } satisfies OrchestrationResultRecord);

    const result = await tool?.execute({
      requestId: "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    expect(result).toMatchObject({
      requestId: "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      taskId: "t-runner-failed",
      kind: "gemini",
      status: "runner_failed",
      workflowStatus: "runner_failed",
      error: "worker process exited unexpectedly",
      configuredRetries: 1,
      configuredRetryDelayMs: 250,
    });
  });
});
