import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrchestrationResultRecord } from "../src/features/orchestration/observability/orchestration-result-store.js";

vi.mock("../src/features/orchestration/run-orchestration-workflow.js", () => ({
  runOrchestrationWorkflow: vi.fn(async (spec) => ({
    requestId: "workflow_mocked",
    mode: spec.mode,
    status: "completed",
    results: [],
    summary: {
      totalJobs: 0,
      finishedJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      skippedJobs: 0,
      startedAt: "2026-04-05T00:00:00.000Z",
      finishedAt: "2026-04-05T00:00:00.000Z",
      durationMs: 0,
    },
  })),
}));

vi.mock("../src/features/orchestration/observability/list-orchestration-traces.js", () => ({
  listOrchestrationTraces: vi.fn(async () => []),
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
      taskIds: [],
    },
    status: "running",
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
  })),
  writeCompleted: vi.fn(async ({ requestId, source, spec, result }) => ({
    requestId,
    source,
    metadata: {
      mode: spec.mode,
      taskIds: [],
    },
    status: result.status,
    result,
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
  })),
  writeRunnerFailed: vi.fn(async ({ requestId, source, spec, error }) => ({
    requestId,
    source,
    metadata: {
      mode: spec.mode,
      taskIds: [],
    },
    status: "runner_failed",
    error,
    createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
    })),
  read: vi.fn<() => Promise<OrchestrationResultRecord | null>>(async () => null),
};

vi.mock("../src/features/orchestration/observability/orchestration-result-store.js", () => ({
  OrchestrationResultStore: vi.fn(() => orchestrationResultStoreMock),
}));

import { getRegisteredOrchestrationTools } from "../src/features/orchestration/mcp/register-tools.js";
import { listOrchestrationTraces } from "../src/features/orchestration/observability/list-orchestration-traces.js";
import { runOrchestrationWorkflow } from "../src/features/orchestration/run-orchestration-workflow.js";

describe("getRegisteredOrchestrationTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the orchestration workflow MCP tool", () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("parallel or sequential worker workflow");
    expect(tool?.description).toContain("async-first");
    expect(Object.keys(tool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["spec", "cwd", "waitForCompletion"]),
    );
  });

  it("executes the orchestration tool with normalized workflow input", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");
    const runOrchestrationWorkflowMock = vi.mocked(runOrchestrationWorkflow);

    const result = await tool?.execute({
      spec: {
        mode: "parallel",
        jobs: [
          {
            kind: "gemini",
            input: {
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
            },
          },
        ],
      },
      cwd: "/tmp/project",
      waitForCompletion: true,
    });

    expect(runOrchestrationWorkflowMock).toHaveBeenCalledTimes(1);

    const forwardedSpec = runOrchestrationWorkflowMock.mock.calls[0]?.[0];
    const forwardedOptions = runOrchestrationWorkflowMock.mock.calls[0]?.[1];

    expect(forwardedSpec).toMatchObject({
      mode: "parallel",
      jobs: [
        {
          kind: "gemini",
          input: {
            prompt: "Summarize this repo.",
            model: "gemini-3-flash-preview",
            cwd: "/tmp/project",
          },
        },
      ],
    });
    expect(forwardedSpec?.mode).toBe("parallel");
    if (!forwardedSpec || forwardedSpec.mode !== "parallel") {
      throw new Error("expected parallel workflow spec");
    }
    expect(forwardedSpec.jobs[0]?.input.taskId).toMatch(/^gemini_/);
    expect(forwardedOptions).toMatchObject({
      traceSource: "mcp",
      traceRequestId: expect.stringMatching(/^workflow_/),
      traceStore: orchestrationTraceStoreMock,
    });
    expect(orchestrationResultStoreMock.writeRunning).toHaveBeenCalledTimes(1);
    expect(orchestrationResultStoreMock.writeCompleted).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      requestId: "workflow_mocked",
      mode: "parallel",
      status: "completed",
      results: [],
      summary: {
        totalJobs: 0,
        finishedJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        skippedJobs: 0,
        startedAt: "2026-04-05T00:00:00.000Z",
        finishedAt: "2026-04-05T00:00:00.000Z",
        durationMs: 0,
      },
    });
  });

  it("preserves explicit worker runtimes for orchestrate_workflow over mcp", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");
    const runOrchestrationWorkflowMock = vi.mocked(runOrchestrationWorkflow);

    await tool?.execute({
      spec: {
        mode: "parallel",
        jobs: [
          {
            kind: "cursor",
            workerRuntime: "shell",
            input: {
              prompt: "Review this repo.",
              model: "composer-2",
            },
          },
        ],
      },
      waitForCompletion: false,
    });

    const forwardedSpec = runOrchestrationWorkflowMock.mock.calls.at(-1)?.[0];

    expect(forwardedSpec).toMatchObject({
      mode: "parallel",
      jobs: [
        {
          kind: "cursor",
          workerRuntime: "shell",
        },
      ],
    });
  });

  it("allows synchronous execution for a single sequential Gemini step", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");

    const result = await tool?.execute({
      spec: {
        mode: "sequential",
        steps: [
          {
            kind: "gemini",
            input: {
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
            },
          },
        ],
      },
      waitForCompletion: true,
    });

    expect(vi.mocked(runOrchestrationWorkflow)).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      requestId: "workflow_mocked",
      mode: "sequential",
      status: "completed",
    });
  });

  it("can start orchestration in background and return a request ID immediately", async () => {
    let resolveRun: ((value: Awaited<ReturnType<typeof runOrchestrationWorkflow>>) => void) | undefined;

    vi.mocked(runOrchestrationWorkflow).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");

    const result = await tool?.execute({
      spec: {
        mode: "parallel",
        jobs: [
          {
            kind: "gemini",
            input: {
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
            },
          },
        ],
      },
      waitForCompletion: false,
    });

    expect(result).toMatchObject({
      requestId: expect.stringMatching(/^workflow_/),
      status: "running",
      executionMode: "async",
      waitMode: "explicit_async",
      pollWith: "get_orchestration_result",
      superviseWith: "supervise_orchestration_result",
      waitWith: "wait_for_orchestration_result",
      recommendedFollowUp: "get_orchestration_result",
      nextArgs: {
        requestId: expect.stringMatching(/^workflow_/),
      },
    });
    expect(result).toHaveProperty(
      "warning",
      "Prefer background polling in production hosts. Use supervise_orchestration_result or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes.",
    );
    expect(result).toHaveProperty(
      "message",
      "Workflow started in background because waitForCompletion was false. Hand this requestId to supervise_orchestration_result or a host-side poller that calls get_orchestration_result until terminal. Use wait_for_orchestration_result only for short blocking checks.",
    );
    expect(result).not.toHaveProperty("autoAsync");
    expect(orchestrationResultStoreMock.writeRunning).toHaveBeenCalledTimes(1);
    expect(orchestrationResultStoreMock.writeCompleted).not.toHaveBeenCalled();

    resolveRun?.({
      requestId: "workflow_async",
      mode: "parallel",
      status: "completed",
      results: [],
      summary: {
        totalJobs: 0,
        finishedJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        skippedJobs: 0,
        startedAt: "2026-04-05T00:00:00.000Z",
        finishedAt: "2026-04-05T00:00:00.000Z",
        durationMs: 0,
      },
    });

    await Promise.resolve();

    expect(orchestrationResultStoreMock.writeCompleted).toHaveBeenCalledTimes(1);
  });

  it("defaults omitted waitForCompletion to async execution", async () => {
    let resolveRun: ((value: Awaited<ReturnType<typeof runOrchestrationWorkflow>>) => void) | undefined;

    vi.mocked(runOrchestrationWorkflow).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");

    const result = await tool?.execute({
      spec: {
        mode: "parallel",
        jobs: [
          {
            kind: "gemini",
            input: {
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      requestId: expect.stringMatching(/^workflow_/),
      status: "running",
      executionMode: "async",
      waitMode: "auto_async",
      pollWith: "get_orchestration_result",
      superviseWith: "supervise_orchestration_result",
      waitWith: "wait_for_orchestration_result",
      recommendedFollowUp: "get_orchestration_result",
      nextArgs: {
        requestId: expect.stringMatching(/^workflow_/),
      },
      autoAsync: true,
    });
    expect(result).toHaveProperty(
      "warning",
      "Prefer background polling in production hosts. Use supervise_orchestration_result or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes.",
    );
    expect(result).toHaveProperty(
      "message",
      "Workflow started in background because waitForCompletion was omitted. Hand this requestId to supervise_orchestration_result or a host-side poller that calls get_orchestration_result until terminal. Use wait_for_orchestration_result only for short blocking checks.",
    );
    expect(orchestrationResultStoreMock.writeRunning).toHaveBeenCalledTimes(1);
    expect(orchestrationResultStoreMock.writeCompleted).not.toHaveBeenCalled();

    resolveRun?.({
      requestId: "workflow_auto_async",
      mode: "parallel",
      status: "completed",
      results: [],
      summary: {
        totalJobs: 0,
        finishedJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        skippedJobs: 0,
        startedAt: "2026-04-05T00:00:00.000Z",
        finishedAt: "2026-04-05T00:00:00.000Z",
        durationMs: 0,
      },
    });

    await Promise.resolve();

    expect(orchestrationResultStoreMock.writeCompleted).toHaveBeenCalledTimes(1);
  });

  it("rejects synchronous wait for cursor workflows", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");
    const runOrchestrationWorkflowMock = vi.mocked(runOrchestrationWorkflow);

    await expect(
      tool?.execute({
        spec: {
          mode: "parallel",
          jobs: [
            {
              kind: "cursor",
              input: {
                prompt: "Review this repo.",
                model: "composer-2",
              },
            },
          ],
        },
        waitForCompletion: true,
      }),
    ).rejects.toThrowError(
      "Synchronous wait (waitForCompletion: true) is only allowed for a single Gemini job or step with no retries. MCP orchestration is background-first: omit waitForCompletion for auto_async, or set it false for explicit_async, then hand the requestId to supervise_orchestration_result or a host-side poller that calls get_orchestration_result. wait_for_orchestration_result is only for short blocking checks.",
    );

    expect(runOrchestrationWorkflowMock).not.toHaveBeenCalled();
  });

  it("rejects synchronous wait for retried Gemini workflows", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");
    const runOrchestrationWorkflowMock = vi.mocked(runOrchestrationWorkflow);

    await expect(
      tool?.execute({
        spec: {
          mode: "parallel",
          jobs: [
            {
              kind: "gemini",
              retries: 1,
              input: {
                prompt: "Summarize this repo.",
                model: "gemini-3-flash-preview",
              },
            },
          ],
        },
        waitForCompletion: true,
      }),
    ).rejects.toThrowError(/explicit_async/);

    expect(runOrchestrationWorkflowMock).not.toHaveBeenCalled();
  });

  it("rejects invalid orchestration tool input before runtime execution", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");
    const runOrchestrationWorkflowMock = vi.mocked(runOrchestrationWorkflow);

    await expect(
      tool?.execute({
        spec: {
          mode: "parallel",
          jobs: [],
        },
      }),
    ).rejects.toThrowError();

    expect(runOrchestrationWorkflowMock).not.toHaveBeenCalled();
  });

  it("appends a runner-failed trace when synchronous orchestration throws unexpectedly", async () => {
    vi.mocked(runOrchestrationWorkflow).mockRejectedValueOnce(new Error("boom"));

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");

    await expect(
      tool?.execute({
        spec: {
          mode: "parallel",
          jobs: [
            {
              kind: "gemini",
              input: {
                prompt: "Summarize this diff.",
                model: "gemini-3-flash-preview",
              },
            },
          ],
        },
        waitForCompletion: true,
      }),
    ).rejects.toThrowError("boom");

    expect(orchestrationTraceStoreMock.append).toHaveBeenCalledTimes(1);
    expect(orchestrationResultStoreMock.writeRunnerFailed).toHaveBeenCalledTimes(1);
  });

  it("persists runner_failed when omitted waitForCompletion async execution rejects", async () => {
    vi.mocked(runOrchestrationWorkflow).mockRejectedValueOnce(new Error("async boom"));

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");

    const result = await tool?.execute({
      spec: {
        mode: "parallel",
        jobs: [
          {
            kind: "gemini",
            input: {
              prompt: "Summarize this repo.",
              model: "gemini-3-flash-preview",
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      requestId: expect.stringMatching(/^workflow_/),
      status: "running",
      autoAsync: true,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(orchestrationTraceStoreMock.append).toHaveBeenCalledTimes(1);
    expect(orchestrationResultStoreMock.writeRunnerFailed).toHaveBeenCalledTimes(1);
  });

  it("executes the orchestration trace listing tool", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "list_orchestration_traces");
    const listOrchestrationTracesMock = vi.mocked(listOrchestrationTraces);

    await tool?.execute({
      source: "mcp",
      limit: 5,
    });

    expect(listOrchestrationTracesMock).toHaveBeenCalledTimes(1);
    expect(listOrchestrationTracesMock.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        source: "mcp",
        limit: 5,
      },
      filePath: expect.stringContaining("orchestration-trace.jsonl"),
    });
  });

  it("reads a stored orchestration result by request ID", async () => {
    const requestId = "workflow_0123456789abcdef0123456789abcdef";
    orchestrationResultStoreMock.read.mockResolvedValueOnce({
      requestId,
      source: "mcp",
      metadata: {
        mode: "parallel",
        taskIds: ["cursor_123"],
      },
      status: "running",
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
    });

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "get_orchestration_result");

    const result = await tool?.execute({
      requestId,
    });

    expect(orchestrationResultStoreMock.read).toHaveBeenCalledWith(requestId);
    expect(result).toMatchObject({
      requestId,
      status: "running",
    });
  });

  it("surfaces a failed workflow status when get_orchestration_result reads a failed result", async () => {
    const requestId = "workflow_0123456789abcdef0123456789abcdef";
    orchestrationResultStoreMock.read.mockResolvedValueOnce({
      requestId,
      source: "mcp",
      metadata: {
        mode: "parallel",
        taskIds: ["cursor_fail"],
      },
      status: "failed",
      result: {
        requestId,
        mode: "parallel",
        status: "failed",
        results: [],
        summary: {
          totalJobs: 1,
          finishedJobs: 1,
          completedJobs: 0,
          failedJobs: 1,
          skippedJobs: 0,
          startedAt: "2026-04-05T00:00:00.000Z",
          finishedAt: "2026-04-05T00:00:01.000Z",
          durationMs: 1000,
        },
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:01.000Z",
    });

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "get_orchestration_result");

    const result = await tool?.execute({ requestId });

    expect(orchestrationResultStoreMock.read).toHaveBeenCalledWith(requestId);
    expect(result).toMatchObject({
      requestId,
      status: "failed",
      result: expect.objectContaining({
        status: "failed",
        summary: expect.objectContaining({
          failedJobs: 1,
          completedJobs: 0,
        }),
      }),
    });
  });

  it("waits for orchestration completion through the dedicated wait tool", async () => {
    const requestId = "workflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    orchestrationResultStoreMock.read
      .mockResolvedValueOnce({
        requestId,
        source: "mcp",
        metadata: {
          mode: "parallel",
          taskIds: ["g1"],
        },
        status: "running",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        requestId,
        source: "mcp",
        metadata: {
          mode: "parallel",
          taskIds: ["g1"],
        },
        status: "completed",
        result: {
          requestId,
          mode: "parallel",
          status: "completed",
          results: [],
          summary: {
            totalJobs: 1,
            finishedJobs: 1,
            completedJobs: 1,
            failedJobs: 0,
            skippedJobs: 0,
            startedAt: "2026-04-05T00:00:00.000Z",
            finishedAt: "2026-04-05T00:00:01.000Z",
            durationMs: 1000,
          },
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:01.000Z",
      });

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "wait_for_orchestration_result");

    const result = await tool?.execute({
      requestId,
      pollIntervalMs: 1,
      includeCompletionSummary: true,
    });

    expect(orchestrationResultStoreMock.read).toHaveBeenCalledWith(requestId);
    expect(result).toMatchObject({
      requestId,
      status: "completed",
      completionSummary: "completed — 1/1 jobs succeeded, 0 failed, 0 skipped in 1000ms",
      record: {
        status: "completed",
      },
    });
  });

  it("supervises orchestration completion through the concise supervisor tool", async () => {
    const requestId = "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    orchestrationResultStoreMock.read
      .mockResolvedValueOnce({
        requestId,
        source: "mcp",
        metadata: {
          mode: "parallel",
          taskIds: ["g1"],
        },
        status: "running",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        requestId,
        source: "mcp",
        metadata: {
          mode: "parallel",
          taskIds: ["g1"],
        },
        status: "completed",
        result: {
          requestId,
          mode: "parallel",
          status: "completed",
          results: [],
          summary: {
            totalJobs: 1,
            finishedJobs: 1,
            completedJobs: 1,
            failedJobs: 0,
            skippedJobs: 0,
            startedAt: "2026-04-05T00:00:00.000Z",
            finishedAt: "2026-04-05T00:00:01.000Z",
            durationMs: 1000,
          },
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:01.000Z",
      });

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "supervise_orchestration_result");

    const result = await tool?.execute({
      requestId,
      pollIntervalMs: 1,
    });

    expect(result).toMatchObject({
      requestId,
      status: "completed",
      workflowStatus: "completed",
      taskIds: ["g1"],
      summary: "completed — 1/1 jobs succeeded, 0 failed, 0 skipped in 1000ms",
    });
  });

  it("rejects get_orchestration_result when requestId is not a workflow_* id", async () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "get_orchestration_result");

    await expect(tool?.execute({ requestId: "../evil" })).rejects.toThrow();
    await expect(tool?.execute({ requestId: "workflow_123" })).rejects.toThrow();
    expect(orchestrationResultStoreMock.read).not.toHaveBeenCalled();
  });
});
