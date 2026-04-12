import { getAppEnv } from "../../../config/env.js";
import { newId, WORKFLOW_REQUEST_ID_PATTERN } from "../../../lib/ids.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { z } from "zod";
import { listOrchestrationTraces } from "../observability/list-orchestration-traces.js";
import { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import { OrchestrationResultStore } from "../observability/orchestration-result-store.js";
import { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import { listOrchestrationTracesInputSchema, waitForOrchestrationResultInputSchema } from "../schemas.js";
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
  const orchestrationLifecycle = new OrchestrationLifecycle(orchestrationTraceStore, orchestrationResultStore);

  return [
    {
      name: "orchestrate_workflow",
      description:
        "Run a static parallel or sequential worker workflow. Default MCP behavior is async-first and returns polling guidance; synchronous wait is limited to a single Gemini job or step with no retries.",
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
            waitWith: "wait_for_orchestration_result",
            nextArgs: {
              requestId,
            },
            message:
              waitMode === "auto_async"
                ? "Workflow started in background because waitForCompletion was omitted. Poll get_orchestration_result with this requestId for the latest status, or call wait_for_orchestration_result to block until terminal."
                : "Workflow started in background because waitForCompletion was false. Poll get_orchestration_result with this requestId for the latest status, or call wait_for_orchestration_result to block until terminal.",
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
        "Block until an orchestration workflow reaches a terminal state, then return the final stored result and an optional completion summary.",
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
