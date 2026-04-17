import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrchestrationResultRecord } from "../src/features/orchestration/observability/orchestration-result-store.js";
import type { OrchestrationSupervisionRecord } from "../src/features/orchestration/observability/orchestration-supervision-store.js";

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

vi.mock("../src/features/orchestration/runtime-model-inventory.js", () => ({
  loadRuntimeModelInventory: vi.fn(async () => ({
    source: "live",
    fetchedAt: "2026-04-17T13:47:00.000Z",
    cursor: {
      models: ["composer-2", "claude-opus-4-7-high", "gemini-3-flash", "gemini-3.1-pro"],
      modes: ["agent", "plan", "ask", "print", "cloud", "acp"],
      supportsPrint: true,
      supportsCloud: true,
      supportsAcp: true,
    },
  })),
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

const orchestrationSupervisionStoreMock = {
  writeRunning: vi.fn(async ({ requestId, targetRequestId, source, pollIntervalMs, timeoutMs, pollCount, lastObservedWorkflowStatus }) => ({
    requestId,
    targetRequestId,
    source,
    status: "running",
    pollIntervalMs,
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    pollCount,
    ...(lastObservedWorkflowStatus !== undefined ? { lastObservedWorkflowStatus } : {}),
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
  } satisfies OrchestrationSupervisionRecord)),
  writeCompleted: vi.fn(async ({ requestId, targetRequestId, source, pollIntervalMs, timeoutMs, pollCount, workflowStatus, taskIds, summary, error }) => ({
    requestId,
    targetRequestId,
    source,
    status: workflowStatus,
    workflowStatus,
    taskIds,
    summary,
    ...(error !== undefined ? { error } : {}),
    pollIntervalMs,
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    pollCount,
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:01.000Z",
  } satisfies OrchestrationSupervisionRecord)),
  writeSupervisorFailed: vi.fn(async ({ requestId, targetRequestId, source, pollIntervalMs, timeoutMs, pollCount, error, lastObservedWorkflowStatus }) => ({
    requestId,
    targetRequestId,
    source,
    status: "supervisor_failed",
    error,
    pollIntervalMs,
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    pollCount,
    ...(lastObservedWorkflowStatus !== undefined ? { lastObservedWorkflowStatus } : {}),
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:01.000Z",
  } satisfies OrchestrationSupervisionRecord)),
  read: vi.fn<() => Promise<OrchestrationSupervisionRecord | null>>(async () => null),
};

vi.mock("../src/features/orchestration/observability/orchestration-result-store.js", () => ({
  OrchestrationResultStore: vi.fn(() => orchestrationResultStoreMock),
}));

vi.mock("../src/features/orchestration/observability/orchestration-supervision-store.js", () => ({
  OrchestrationSupervisionStore: vi.fn(() => orchestrationSupervisionStoreMock),
}));

import { getRegisteredOrchestrationTools } from "../src/features/orchestration/mcp/register-tools.js";
import { listOrchestrationTraces } from "../src/features/orchestration/observability/list-orchestration-traces.js";
import { runOrchestrationWorkflow } from "../src/features/orchestration/run-orchestration-workflow.js";
import { loadRuntimeModelInventory } from "../src/features/orchestration/runtime-model-inventory.js";

describe("getRegisteredOrchestrationTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the orchestration workflow MCP tool", () => {
    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "orchestrate_workflow");
    const categoryTool = tools.find((item) => item.name === "start_agent_task");

    expect(tool).toBeDefined();
    expect(categoryTool).toBeDefined();
    expect(tool?.description).toContain("parallel or sequential worker workflow");
    expect(tool?.description).toContain("async-first");
    expect(Object.keys(tool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["spec", "cwd", "waitForCompletion"]),
    );
    expect(Object.keys(categoryTool?.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["category", "prompt"]),
    );
  });

  it("starts a category-routed async task through the workflow engine", async () => {
    let resolveRun: ((value: Awaited<ReturnType<typeof runOrchestrationWorkflow>>) => void) | undefined;

    vi.mocked(runOrchestrationWorkflow).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "start_agent_task");

    const result = await tool?.execute({
      category: "quick",
      prompt: "Review this diff.",
      workerRuntime: "mcp",
      mode: "plan",
    });

    expect(vi.mocked(loadRuntimeModelInventory)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runOrchestrationWorkflow)).toHaveBeenCalledTimes(1);
    const forwardedSpec = vi.mocked(runOrchestrationWorkflow).mock.calls[0]?.[0];

    expect(forwardedSpec).toMatchObject({
      mode: "parallel",
      jobs: [
        {
          kind: "cursor",
          workerRuntime: "mcp",
          input: {
            prompt: "Review this diff.",
            model: "composer-2",
            mode: "plan",
          },
        },
      ],
    });
    expect(result).toMatchObject({
      requestId: expect.stringMatching(/^workflow_/),
      status: "running",
      surface: "agent-category",
      category: "quick",
      route: {
        workerKind: "cursor",
        model: "composer-2",
        reason: "default_quick_lane",
        workerRuntime: "mcp",
      },
      pollWith: "get_orchestration_result",
    });

    resolveRun?.({
      requestId: "workflow_category",
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
        finishedAt: "2026-04-05T00:00:00.000Z",
        durationMs: 0,
      },
    });

    await Promise.resolve();
    expect(orchestrationResultStoreMock.writeCompleted).toHaveBeenCalledTimes(1);
    expect(orchestrationResultStoreMock.writeRunning).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({
          jobs: [
            expect.objectContaining({
              routeReason: "default_quick_lane",
            }),
          ],
        }),
      }),
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

    const lastCall = runOrchestrationWorkflowMock.mock.calls[runOrchestrationWorkflowMock.mock.calls.length - 1];
    const forwardedSpec = lastCall?.[0];

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
      superviseResultWith: "get_orchestration_supervision_result",
      waitWith: "wait_for_orchestration_result",
      recommendedFollowUp: "supervise_orchestration_result",
      nextArgs: {
        requestId: expect.stringMatching(/^workflow_/),
      },
    });
    expect(result).toHaveProperty(
      "warning",
      "Prefer background polling in production hosts. Treat status=running as healthy in-progress state, not as failure or staleness. Use supervise_orchestration_result to start repo-owned supervision, or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes; do not fall back to sync/local execution just because a workflow is still running or a bounded wait timed out.",
    );
    expect(result).toHaveProperty(
      "message",
      "Workflow started in background because waitForCompletion was false. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Treat running as in-progress state and keep polling; do not switch to sync/local execution just because the workflow has not reached terminal yet. Use wait_for_orchestration_result only for short blocking checks.",
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
      superviseResultWith: "get_orchestration_supervision_result",
      waitWith: "wait_for_orchestration_result",
      recommendedFollowUp: "supervise_orchestration_result",
      nextArgs: {
        requestId: expect.stringMatching(/^workflow_/),
      },
      autoAsync: true,
    });
    expect(result).toHaveProperty(
      "warning",
      "Prefer background polling in production hosts. Treat status=running as healthy in-progress state, not as failure or staleness. Use supervise_orchestration_result to start repo-owned supervision, or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes; do not fall back to sync/local execution just because a workflow is still running or a bounded wait timed out.",
    );
    expect(result).toHaveProperty(
      "message",
      "Workflow started in background because waitForCompletion was omitted. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Treat running as in-progress state and keep polling; do not switch to sync/local execution just because the workflow has not reached terminal yet. Use wait_for_orchestration_result only for short blocking checks.",
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
      "Synchronous wait (waitForCompletion: true) is only allowed for a single Gemini job or step with no retries. MCP orchestration is background-first: omit waitForCompletion for auto_async, or set it false for explicit_async, then hand the requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result. Treat running as in-progress state, not failure or staleness. wait_for_orchestration_result is only for short blocking checks, and callers must not fall back to sync/local execution just because async work is still running or a bounded wait timed out.",
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
      executionMode: "async",
      pollWith: "get_orchestration_result",
      superviseWith: "supervise_orchestration_result",
      superviseResultWith: "get_orchestration_supervision_result",
      waitWith: "wait_for_orchestration_result",
      recommendedFollowUp: "supervise_orchestration_result",
      nextArgs: {
        requestId,
      },
    });
    expect(result).toHaveProperty(
      "warning",
      "status=running means the workflow is still in progress in background, not stale or failed. Keep polling get_orchestration_result with this requestId or start repo-owned supervision with supervise_orchestration_result. wait_for_orchestration_result is only a short blocking helper. Do not fall back to waitForCompletion: true, sync worker tools, or local CLI execution while this requestId is still running.",
    );
    expect(result).toHaveProperty(
      "message",
      "Workflow result is still running in background. Prefer supervise_orchestration_result for repo-owned polling, or keep polling get_orchestration_result with this requestId until terminal. Treat running as healthy in-progress state and do not switch to sync/local execution just because the workflow has not finished yet or a bounded wait timed out.",
    );
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

  it("starts background supervision and returns a supervisor request id", async () => {
    const requestId = "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    orchestrationResultStoreMock.read.mockResolvedValueOnce({
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
      requestId: expect.stringMatching(/^supervisor_/),
      targetRequestId: requestId,
      status: "running",
      resultTool: "get_orchestration_supervision_result",
    });
    expect(orchestrationSupervisionStoreMock.writeCompleted).toHaveBeenCalledTimes(1);
  });

  it("reads a stored supervision result by supervisor request id", async () => {
    const supervisorRequestId = "supervisor_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    orchestrationSupervisionStoreMock.read.mockResolvedValueOnce({
      requestId: supervisorRequestId,
      targetRequestId: "workflow_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source: "mcp",
      status: "completed",
      workflowStatus: "completed",
      taskIds: ["g1"],
      summary: "completed — 1/1 jobs succeeded, 0 failed, 0 skipped in 1000ms",
      pollIntervalMs: 1000,
      pollCount: 2,
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:01.000Z",
    });

    const tools = getRegisteredOrchestrationTools();
    const tool = tools.find((item) => item.name === "get_orchestration_supervision_result");

    const result = await tool?.execute({
      requestId: supervisorRequestId,
    });

    expect(orchestrationSupervisionStoreMock.read).toHaveBeenCalledWith(supervisorRequestId);
    expect(result).toMatchObject({
      requestId: supervisorRequestId,
      status: "completed",
      workflowStatus: "completed",
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
