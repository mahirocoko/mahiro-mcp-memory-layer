import { getAppEnv } from "../../../config/env.js";
import { newId, WORKFLOW_REQUEST_ID_PATTERN } from "../../../lib/ids.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { z } from "zod";
import { listOrchestrationTraces } from "../observability/list-orchestration-traces.js";
import { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import { OrchestrationResultStore } from "../observability/orchestration-result-store.js";
import { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import { listOrchestrationTracesInputSchema } from "../schemas.js";
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
      description: "Run a static parallel or sequential worker workflow. Synchronous wait is limited to a single Gemini job with no retries.",
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
            ...(parsed.waitForCompletion === undefined ? { autoAsync: true } : {}),
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
