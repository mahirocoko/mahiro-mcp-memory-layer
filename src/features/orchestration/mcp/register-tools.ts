import { z } from "zod";

import { paths } from "../../../config/paths.js";
import { isWorkflowRequestId, newId } from "../../../lib/ids.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { interactiveTmuxCursorRuntime } from "../../cursor/runtime/tmux/interactive-cursor-tmux-runtime.js";
import { buildAgentTaskWorkerJob, resolveAgentTaskRoute, type AgentTaskCategory } from "../agent-category-routing.js";
import { interactiveTmuxGeminiRuntime } from "../../gemini/runtime/tmux/interactive-gemini-tmux-runtime.js";
import { listOrchestrationTraces } from "../observability/list-orchestration-traces.js";
import { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import { OrchestrationResultStore } from "../observability/orchestration-result-store.js";
import { OrchestrationSupervisionStore } from "../observability/orchestration-supervision-store.js";
import { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { loadRuntimeModelInventory } from "../runtime-model-inventory.js";
import { runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import { TmuxRuntimeOwner } from "../runtime/tmux-runtime-owner.js";
import { SubagentSessionStore } from "../subagents/subagent-session-store.js";
import { TmuxSubagentManager } from "../subagents/tmux-subagent-manager.js";
import { getOrchestrationSupervisionResult, startOrchestrationSupervision } from "../supervise-orchestration-result.js";
import { waitForOrchestrationResult } from "../wait-for-orchestration-result.js";
import { normalizeWorkflowSpec, type OrchestrateWorkflowSpec, type WorkerRuntimeKind, type WorkflowJob } from "../workflow-spec.js";

function createStores() {
  const resultStore = new OrchestrationResultStore(paths.orchestrationResultDirectory);
  const supervisionStore = new OrchestrationSupervisionStore(paths.orchestrationSupervisionDirectory);
  const traceStore = new OrchestrationTraceStore(paths.orchestrationTraceFilePath);
  const lifecycle = new OrchestrationLifecycle(traceStore, resultStore);
  return { resultStore, supervisionStore, traceStore, lifecycle };
}

function createSubagentManager() {
  return new TmuxSubagentManager(
    new TmuxRuntimeOwner(),
    new SubagentSessionStore(paths.orchestrationSubagentDirectory),
  );
}

const asyncWarning = "Prefer background polling in production hosts. Treat status=running as healthy in-progress state, not as failure or staleness. Use supervise_orchestration_result to start repo-owned supervision, or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes; do not fall back to sync/local execution just because a workflow is still running or a bounded wait timed out.";

function startMessage(reason: "false" | "omitted"): string {
  return reason === "false"
    ? "Workflow started in background because waitForCompletion was false. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Treat running as in-progress state and keep polling; do not switch to sync/local execution just because the workflow has not reached terminal yet. Use wait_for_orchestration_result only for short blocking checks."
    : "Workflow started in background because waitForCompletion was omitted. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Treat running as in-progress state and keep polling; do not switch to sync/local execution just because the workflow has not reached terminal yet. Use wait_for_orchestration_result only for short blocking checks.";
}

function startAsyncRun(spec: OrchestrateWorkflowSpec, source: "mcp" | "cli") {
  const { lifecycle, traceStore } = createStores();
  const requestId = newId("workflow");
  void lifecycle.markRunning({ requestId, source, spec });
  const promise = runOrchestrationWorkflow(hydrateWorkflowRuntimes(spec), {
    traceRequestId: requestId,
    traceSource: source,
    traceStore,
  });
  void promise
    .then(async (result) => {
      await lifecycle.markCompleted({ requestId, source, spec, result });
    })
    .catch(async (error) => {
      await lifecycle.markRunnerFailed({
        requestId,
        source,
        spec,
        error: error instanceof Error ? error.message : String(error),
        startedAt: new Date().toISOString(),
      });
    });
  return requestId;
}

function hydrateWorkflowRuntimes(spec: OrchestrateWorkflowSpec): OrchestrateWorkflowSpec {
  const hydrateJob = (job: WorkflowJob): WorkflowJob => {
    if (job.dependencies?.runtime || job.workerRuntime === "mcp") {
      return job;
    }
    if (job.kind === "gemini") {
      return {
        ...job,
        input: {
          ...job.input,
          subagentId: job.input.subagentId ?? newId("subagent"),
        },
        dependencies: { ...(job.dependencies ?? {}), runtime: interactiveTmuxGeminiRuntime },
      };
    }
    return {
      ...job,
      input: {
        ...job.input,
        subagentId: job.input.subagentId ?? newId("subagent"),
      },
      dependencies: { ...(job.dependencies ?? {}), runtime: interactiveTmuxCursorRuntime },
    };
  };

  if (spec.mode === "parallel") {
    return { ...spec, jobs: spec.jobs.map((job) => hydrateJob(job)) };
  }
  return { ...spec, steps: spec.steps.map((job) => hydrateJob(job)) };
}

function routeForWorker(worker: "gemini" | "cursor", workerRuntime?: WorkerRuntimeKind) {
  return {
    workerKind: worker,
    model: worker === "gemini" ? "gemini-3.1-pro-preview" : "composer-2",
    reason: "explicit_worker_lane",
    ...(workerRuntime ? { workerRuntime } : {}),
  };
}

function createRunningEnvelope(requestId: string, waitMode: "explicit_async" | "auto_async", extra: Record<string, unknown>) {
  return {
    requestId,
    status: "running",
    executionMode: "async",
    waitMode,
    pollWith: "get_orchestration_result",
    superviseWith: "supervise_orchestration_result",
    superviseResultWith: "get_orchestration_supervision_result",
    waitWith: "wait_for_orchestration_result",
    recommendedFollowUp: "supervise_orchestration_result",
    nextArgs: { requestId },
    warning: asyncWarning,
    message: startMessage(waitMode === "explicit_async" ? "false" : "omitted"),
    ...(waitMode === "auto_async" ? { autoAsync: true } : {}),
    ...extra,
  };
}

function normalizeIgnoredFields(worker: "gemini" | "cursor", input: Record<string, unknown>) {
  const ignoredFields = worker === "gemini"
    ? ["mode", "force", "trust"].filter((key) => key in input)
    : ["taskKind", "approvalMode", "allowedMcpServerNames"].filter((key) => key in input);
  return ignoredFields;
}

export function getRegisteredOrchestrationTools(): RegisteredTool[] {
  const orchestrateSchema = z.object({
    spec: z.any(),
    cwd: z.string().optional(),
    waitForCompletion: z.boolean().optional(),
  });
  const callWorkerSchema = z.object({
    worker: z.enum(["gemini", "cursor"]),
    prompt: z.string().min(1),
    workerRuntime: z.enum(["shell", "mcp"]).optional(),
    timeoutMs: z.number().int().positive().max(300000).optional(),
    mode: z.enum(["plan", "ask"]).optional(),
    force: z.boolean().optional(),
    trust: z.boolean().optional(),
    taskKind: z.string().optional(),
    approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
    allowedMcpServerNames: z.union([z.array(z.string()), z.literal("none")]).optional(),
  });
  const startAgentSchema = z.object({
    category: z.string().min(1),
    prompt: z.string().min(1),
    model: z.string().optional(),
    workerRuntime: z.enum(["shell", "mcp"]).optional(),
    mode: z.enum(["plan", "ask"]).optional(),
    trust: z.boolean().optional(),
    force: z.boolean().optional(),
    taskKind: z.string().optional(),
    approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
    allowedMcpServerNames: z.union([z.array(z.string()), z.literal("none")]).optional(),
  });
  return [
    {
      name: "orchestrate_workflow",
      description: "Run a parallel or sequential worker workflow through the MCP orchestration engine. This surface is async-only.",
      inputSchema: {
        spec: z.any(),
        cwd: z.string().optional(),
        waitForCompletion: z.boolean().optional(),
      },
      execute: async (input) => {
        const parsedInput = orchestrateSchema.parse(input);
        if (parsedInput.waitForCompletion === true) {
          throw new Error("waitForCompletion: true is no longer supported; orchestration starts are async-only.");
        }
        const spec = normalizeWorkflowSpec(parsedInput.spec as OrchestrateWorkflowSpec, parsedInput.cwd, "mcp");
        if ((spec.mode === "parallel" && spec.jobs.length === 0) || (spec.mode === "sequential" && spec.steps.length === 0)) {
          throw new Error("Workflow spec must include at least one job.");
        }
        const requestId = startAsyncRun(spec, "mcp");
        return createRunningEnvelope(requestId, parsedInput.waitForCompletion === false ? "explicit_async" : "auto_async", {});
      },
    },
    {
      name: "call_worker",
      description: "Start one async worker-lane task on explicit gemini or cursor.",
      inputSchema: {
        worker: z.enum(["gemini", "cursor"]),
        prompt: z.string().min(1),
        workerRuntime: z.enum(["shell", "mcp"]).optional(),
        timeoutMs: z.number().int().positive().max(300000).optional(),
        mode: z.enum(["plan", "ask"]).optional(),
        force: z.boolean().optional(),
        trust: z.boolean().optional(),
        taskKind: z.string().optional(),
        approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
        allowedMcpServerNames: z.union([z.array(z.string()), z.literal("none")]).optional(),
      },
      execute: async (input) => {
        const parsedInput = callWorkerSchema.parse(input);
        const worker = parsedInput.worker;
        const route = routeForWorker(worker, parsedInput.workerRuntime as WorkerRuntimeKind | undefined);
        const ignoredFields = normalizeIgnoredFields(worker, input);
        const spec = normalizeWorkflowSpec({
          mode: "parallel",
          jobs: [
            worker === "gemini"
              ? {
                  kind: "gemini",
                  routeReason: route.reason,
                  ...(route.workerRuntime ? { workerRuntime: route.workerRuntime } : {}),
                  input: {
                    ...(route.workerRuntime !== "mcp" ? { subagentId: newId("subagent") } : {}),
                    taskId: newId("gemini"),
                    prompt: parsedInput.prompt,
                    model: route.model,
                    ...(typeof parsedInput.timeoutMs === "number" ? { timeoutMs: parsedInput.timeoutMs } : {}),
                  },
                }
              : {
                  kind: "cursor",
                  routeReason: route.reason,
                  ...(route.workerRuntime ? { workerRuntime: route.workerRuntime } : {}),
                  input: {
                    ...(route.workerRuntime !== "mcp" ? { subagentId: newId("subagent") } : {}),
                    taskId: newId("cursor"),
                    prompt: parsedInput.prompt,
                    model: route.model,
                    ...(typeof parsedInput.timeoutMs === "number" ? { timeoutMs: parsedInput.timeoutMs } : {}),
                  },
                },
          ],
        }, undefined, "mcp");
        const requestId = startAsyncRun(spec, "mcp");
        return {
          requestId,
          status: "running",
          surface: "worker-lane",
          worker,
          route,
          pollWith: "get_orchestration_result",
          ...(ignoredFields.length > 0 ? {
            ignoredFields,
            warning: `Ignored incompatible ${worker} worker fields: ${ignoredFields.join(", ")}.`,
          } : {}),
        };
      },
    },
    {
      name: "start_agent_task",
      description: "Start one async category-routed orchestration task through the thin public facade.",
      inputSchema: {
        category: z.string().min(1),
        prompt: z.string().min(1),
        model: z.string().optional(),
        workerRuntime: z.enum(["shell", "mcp"]).optional(),
        mode: z.enum(["plan", "ask"]).optional(),
        trust: z.boolean().optional(),
        force: z.boolean().optional(),
        taskKind: z.string().optional(),
        approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
        allowedMcpServerNames: z.union([z.array(z.string()), z.literal("none")]).optional(),
      },
      execute: async (input) => {
        const parsedInput = startAgentSchema.parse(input);
        const runtimeModelInventory = await loadRuntimeModelInventory();
        const job = buildAgentTaskWorkerJob({
          category: parsedInput.category as AgentTaskCategory,
          taskId: newId(parsedInput.category === "interactive-gemini" ? "gemini" : "cursor"),
          prompt: parsedInput.prompt,
          model: parsedInput.model,
          workerRuntime: parsedInput.workerRuntime as WorkerRuntimeKind | undefined,
          runtimeModelInventory,
          mode: parsedInput.mode as "plan" | "ask" | undefined,
          trust: parsedInput.trust,
          force: parsedInput.force,
          taskKind: parsedInput.taskKind,
          approvalMode: parsedInput.approvalMode as "default" | "auto_edit" | "yolo" | "plan" | undefined,
          allowedMcpServerNames: parsedInput.allowedMcpServerNames as string[] | "none" | undefined,
        });
        const spec = normalizeWorkflowSpec({ mode: "parallel", jobs: [job] }, undefined, "mcp");
        const requestId = startAsyncRun(spec, "mcp");
        return {
          requestId,
          status: "running",
          surface: "agent-category",
          category: parsedInput.category,
          route: {
            ...resolveAgentTaskRoute({
            category: parsedInput.category as AgentTaskCategory,
            model: parsedInput.model,
            workerRuntime: parsedInput.workerRuntime as WorkerRuntimeKind | undefined,
            runtimeModelInventory,
            }),
            ...(parsedInput.category === "interactive-gemini" && parsedInput.workerRuntime === undefined ? { workerRuntime: "shell" } : {}),
          },
          pollWith: "get_orchestration_result",
        };
      },
    },
    {
      name: "get_orchestration_result",
      description: "Read the latest stored orchestration workflow result by requestId.",
      inputSchema: { requestId: z.string().min(1) },
      execute: async (input) => {
        const requestId = String(input.requestId);
        if (!isWorkflowRequestId(requestId)) {
          throw new Error("requestId must be a workflow_* id.");
        }
        const { resultStore } = createStores();
        const record = await resultStore.read(requestId);
        if (!record) {
          return null;
        }
        const routeReasons = (record.metadata.jobs ?? [])
          .map((job) => (job as Record<string, unknown>).routeReason)
          .filter((value): value is string => typeof value === "string");
        const routeSummary = routeReasons.length > 0
          ? {
              primaryReason: routeReasons[0],
              uniqueReasons: [...new Set(routeReasons)],
              jobsWithReasons: routeReasons.length,
            }
          : undefined;
        if (record.status === "running") {
          return {
            ...record,
            executionMode: "async",
            pollWith: "get_orchestration_result",
            superviseWith: "supervise_orchestration_result",
            superviseResultWith: "get_orchestration_supervision_result",
            waitWith: "wait_for_orchestration_result",
            recommendedFollowUp: "supervise_orchestration_result",
            nextArgs: { requestId },
            ...(routeSummary ? { routeSummary } : {}),
            warning: "status=running means the workflow is still in progress in background, not stale or failed. Keep polling get_orchestration_result with this requestId or start repo-owned supervision with supervise_orchestration_result. wait_for_orchestration_result is only a short blocking helper. Do not fall back to waitForCompletion: true, sync worker tools, or local CLI execution while this requestId is still running.",
            message: "Workflow result is still running in background. Prefer supervise_orchestration_result for repo-owned polling, or keep polling get_orchestration_result with this requestId until terminal. Treat running as healthy in-progress state and do not switch to sync/local execution just because the workflow has not finished yet or a bounded wait timed out.",
          };
        }
        return {
          ...record,
          ...(routeSummary ? { routeSummary } : {}),
        };
      },
    },
    {
      name: "supervise_orchestration_result",
      description: "Start detached supervision for an existing orchestration workflow result.",
      inputSchema: { requestId: z.string().min(1), pollIntervalMs: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional() },
      execute: async (input) => {
        const { resultStore, supervisionStore } = createStores();
        return await startOrchestrationSupervision(resultStore, supervisionStore, String(input.requestId), {
          ...(typeof input.pollIntervalMs === "number" ? { pollIntervalMs: input.pollIntervalMs } : {}),
          ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
        });
      },
    },
    {
      name: "get_orchestration_supervision_result",
      description: "Read the latest stored supervision result by supervisor request id.",
      inputSchema: { requestId: z.string().min(1) },
      execute: async (input) => {
        const { supervisionStore } = createStores();
        return await getOrchestrationSupervisionResult(supervisionStore, String(input.requestId));
      },
    },
    {
      name: "wait_for_orchestration_result",
      description: "Block until a stored orchestration result reaches a terminal state.",
      inputSchema: { requestId: z.string().min(1), pollIntervalMs: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional(), includeCompletionSummary: z.boolean().optional() },
      execute: async (input) => {
        const { resultStore } = createStores();
        const record = await waitForOrchestrationResult(resultStore, String(input.requestId), {
          ...(typeof input.pollIntervalMs === "number" ? { pollIntervalMs: input.pollIntervalMs } : {}),
          ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
          ...(typeof input.includeCompletionSummary === "boolean" ? { includeCompletionSummary: input.includeCompletionSummary } : {}),
        });
        return {
          requestId: String(input.requestId),
          status: record.status,
          ...(record.completionSummary ? { completionSummary: record.completionSummary } : {}),
          record,
        };
      },
    },
    {
      name: "list_orchestration_traces",
      description: "List persisted orchestration trace entries from the trace log.",
      inputSchema: { source: z.string().optional(), limit: z.number().int().positive().optional() },
      execute: async (input) => await listOrchestrationTraces({ filePath: paths.orchestrationTraceFilePath, payload: input }),
    },
    {
      name: "inspect_subagent_session",
      description: "Inspect a persisted tmux-managed subagent session by subagent id.",
      inputSchema: { subagentId: z.string().min(1) },
      execute: async (input) => await createSubagentManager().inspectSession(String(input.subagentId)),
    },
    {
      name: "stop_subagent_session",
      description: "Stop a persisted tmux-managed subagent session by subagent id.",
      inputSchema: { subagentId: z.string().min(1) },
      execute: async (input) => await createSubagentManager().stopSession(String(input.subagentId)),
    },
    {
      name: "attach_subagent_session",
      description: "Return the terminal attach command for a persisted tmux-managed subagent session.",
      inputSchema: { subagentId: z.string().min(1) },
      execute: async (input) => await createSubagentManager().attachCommand(String(input.subagentId)),
    },
    {
      name: "resume_subagent_session",
      description: "Send a new prompt into an existing tmux-managed subagent session and wait for completion token output.",
      inputSchema: { subagentId: z.string().min(1), taskId: z.string().min(1), prompt: z.string().min(1), timeoutMs: z.number().int().positive().optional() },
      execute: async (input) => await createSubagentManager().resumeSession({
        subagentId: String(input.subagentId),
        taskId: String(input.taskId),
        prompt: String(input.prompt),
        ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      }),
    },
  ];
}
