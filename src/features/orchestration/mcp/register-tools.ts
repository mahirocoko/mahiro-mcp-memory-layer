import { getAppEnv } from "../../../config/env.js";
import { newId, WORKFLOW_REQUEST_ID_PATTERN } from "../../../lib/ids.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { z } from "zod";
import { listOrchestrationTraces } from "../observability/list-orchestration-traces.js";
import { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import { OrchestrationResultStore } from "../observability/orchestration-result-store.js";
import { OrchestrationSupervisionStore } from "../observability/orchestration-supervision-store.js";
import { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import {
  getOrchestrationSupervisionResultInputSchema,
  listOrchestrationTracesInputSchema,
  superviseOrchestrationResultInputSchema,
  waitForOrchestrationResultInputSchema,
} from "../schemas.js";
import { getOrchestrationSupervisionResult, startOrchestrationSupervision } from "../supervise-orchestration-result.js";
import { waitForOrchestrationResult } from "../wait-for-orchestration-result.js";
import { normalizeWorkflowSpec, orchestrateToolInputSchema } from "../workflow-spec.js";

const getOrchestrationResultInputSchema = z.object({
  requestId: z
    .string()
    .trim()
    .regex(WORKFLOW_REQUEST_ID_PATTERN, "requestId must be the workflow_* id returned by orchestrate_workflow"),
});

export function getRegisteredOrchestrationTools(): readonly RegisteredTool[] {
  const env = getAppEnv();
  const orchestrationTraceStore = new OrchestrationTraceStore(env.dataPaths.orchestrationTraceFilePath);
  const orchestrationResultStore = new OrchestrationResultStore(env.dataPaths.orchestrationResultDirectory);
  const orchestrationSupervisionStore = new OrchestrationSupervisionStore(env.dataPaths.orchestrationSupervisionDirectory);
  const orchestrationLifecycle = new OrchestrationLifecycle(orchestrationTraceStore, orchestrationResultStore);

  return [
    {
      name: "orchestrate_workflow",
      description:
        "Run a static parallel or sequential worker workflow. Default MCP behavior is async-first and returns background-polling guidance; synchronous wait is limited to a single Gemini job or step with no retries.",
      inputSchema: orchestrateToolInputSchema.shape,
      execute: async (input) => {
        const parsed = orchestrateToolInputSchema.parse(input);
        const requestId = newId("workflow");
        const spec = normalizeWorkflowSpec(parsed.spec, parsed.cwd);
        const startedAt = new Date().toISOString();
        const shouldRunAsync = parsed.waitForCompletion !== true;
        const options = {
          traceStore: orchestrationTraceStore,
          traceSource: "mcp",
          traceRequestId: requestId,
        } as const;

        await orchestrationLifecycle.markRunning({
          requestId,
          source: "mcp",
          spec,
        });

        if (shouldRunAsync) {
          const waitMode = parsed.waitForCompletion === false ? "explicit_async" : "auto_async";

          void runOrchestrationWorkflow(spec, options)
            .then(async (result) => {
              await orchestrationLifecycle.markCompleted({
                requestId,
                source: "mcp",
                spec,
                result,
              });
            })
            .catch(async (error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);

              await orchestrationLifecycle.markRunnerFailed({
                requestId,
                source: "mcp",
                spec,
                error: errorMessage,
                startedAt,
              });
            });

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
            nextArgs: {
              requestId,
            },
            warning:
              "Prefer background polling in production hosts. Use supervise_orchestration_result to start repo-owned supervision, or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes.",
            message:
              waitMode === "auto_async"
                ? "Workflow started in background because waitForCompletion was omitted. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Use wait_for_orchestration_result only for short blocking checks."
                : "Workflow started in background because waitForCompletion was false. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Use wait_for_orchestration_result only for short blocking checks.",
            ...(waitMode === "auto_async" ? { autoAsync: true } : {}),
          };
        }

        try {
          const result = await runOrchestrationWorkflow(spec, options);

          await orchestrationLifecycle.markCompleted({
            requestId,
            source: "mcp",
            spec,
            result,
          });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          await orchestrationLifecycle.markRunnerFailed({
            requestId,
            source: "mcp",
            spec,
            error: errorMessage,
            startedAt,
          });

          throw error;
        }
      },
    },
    {
      name: "get_orchestration_result",
      description: "Get the latest stored orchestration workflow result by request ID.",
      inputSchema: getOrchestrationResultInputSchema.shape,
      execute: async (input) => {
        const parsed = getOrchestrationResultInputSchema.parse(input);
        return orchestrationResultStore.read(parsed.requestId);
      },
    },
    {
      name: "wait_for_orchestration_result",
      description:
        "Block on the stored orchestration result until terminal and return the final record plus an optional completion summary. Secondary helper only: prefer get_orchestration_result with a background poller for long-running hosts.",
      inputSchema: waitForOrchestrationResultInputSchema.shape,
      execute: async (input) => {
        const parsed = waitForOrchestrationResultInputSchema.parse(input);
        return waitForOrchestrationResult(orchestrationResultStore, parsed.requestId, {
          pollIntervalMs: parsed.pollIntervalMs,
          timeoutMs: parsed.timeoutMs,
          includeCompletionSummary: parsed.includeCompletionSummary,
        });
      },
    },
    {
      name: "supervise_orchestration_result",
      description:
        "Start repo-owned background supervision for an orchestration request and return a supervisor_* request ID you can poll later. Preferred production helper for long-running hosts.",
      inputSchema: superviseOrchestrationResultInputSchema.shape,
      execute: async (input) => {
        const parsed = superviseOrchestrationResultInputSchema.parse(input);
        return startOrchestrationSupervision(orchestrationResultStore, orchestrationSupervisionStore, parsed.requestId, {
          pollIntervalMs: parsed.pollIntervalMs,
          timeoutMs: parsed.timeoutMs,
        });
      },
    },
    {
      name: "get_orchestration_supervision_result",
      description: "Get the latest stored background supervision result by supervisor request ID.",
      inputSchema: getOrchestrationSupervisionResultInputSchema.shape,
      execute: async (input) => {
        const parsed = getOrchestrationSupervisionResultInputSchema.parse(input);
        return getOrchestrationSupervisionResult(orchestrationSupervisionStore, parsed.requestId);
      },
    },
    {
      name: "list_orchestration_traces",
      description: "List orchestration workflow trace entries for inspection.",
      inputSchema: listOrchestrationTracesInputSchema.shape,
      execute: (input) =>
        listOrchestrationTraces({
          payload: input as never,
          filePath: env.dataPaths.orchestrationTraceFilePath,
        }),
    },
  ];
}
