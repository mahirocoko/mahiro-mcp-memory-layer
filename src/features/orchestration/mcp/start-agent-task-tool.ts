import { z } from "zod";

import { newId } from "../../../lib/ids.js";
import {
  agentTaskCategories,
  buildAgentTaskWorkerJob,
} from "../agent-category-routing.js";
import type { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import type { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { loadRuntimeModelInventory, type RuntimeModelInventorySnapshot } from "../runtime-model-inventory.js";
import { runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { buildAsyncWorkflowStartEnvelope } from "./async-workflow-envelope.js";

const startAgentTaskInputSchema = z.object({
  category: z.enum(agentTaskCategories),
  taskId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
  cwd: z.string().trim().min(1).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  binaryPath: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  workerRuntime: z.enum(["shell", "mcp"]).optional(),
  retries: z.number().int().min(0).max(5).optional(),
  retryDelayMs: z.number().int().positive().max(30_000).optional(),
  continueOnFailure: z.boolean().optional(),
  taskKind: z.enum(["general", "summarize", "timeline", "extract-facts"]).optional(),
  approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
  allowedMcpServerNames: z.union([z.literal("none"), z.array(z.string().trim().min(1)).min(1)]).optional(),
  mode: z.enum(["ask", "plan"]).optional(),
  force: z.boolean().optional(),
  trust: z.boolean().optional(),
});

export function getRegisteredStartAgentTaskTool(input: {
  readonly orchestrationLifecycle: OrchestrationLifecycle;
  readonly orchestrationTraceStore: OrchestrationTraceStore;
  readonly runtimeModelInventoryLoader?: () => Promise<RuntimeModelInventorySnapshot>;
}): RegisteredTool {
  return {
    name: "start_agent_task",
    description:
      "Start a thin category-driven async task that compiles to the existing workflow engine and returns the standard workflow polling contract.",
    inputSchema: startAgentTaskInputSchema.shape,
    execute: async (rawInput) => {
      const parsed = startAgentTaskInputSchema.parse(rawInput);
      const requestId = newId("workflow");
      const startedAt = new Date().toISOString();
      const taskId = parsed.taskId?.trim() || `${parsed.category}_${requestId.slice("workflow_".length, "workflow_".length + 12)}`;
      const runtimeModelInventory = await (input.runtimeModelInventoryLoader ?? loadRuntimeModelInventory)();
      const job = buildAgentTaskWorkerJob({
        category: parsed.category,
        taskId,
        prompt: parsed.prompt,
        runtimeModelInventory,
        ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
        ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
        ...(parsed.binaryPath ? { binaryPath: parsed.binaryPath } : {}),
        ...(parsed.model ? { model: parsed.model } : {}),
        ...(parsed.workerRuntime ? { workerRuntime: parsed.workerRuntime } : {}),
        ...(parsed.retries !== undefined ? { retries: parsed.retries } : {}),
        ...(parsed.retryDelayMs !== undefined ? { retryDelayMs: parsed.retryDelayMs } : {}),
        ...(parsed.continueOnFailure !== undefined ? { continueOnFailure: parsed.continueOnFailure } : {}),
        ...(parsed.taskKind ? { taskKind: parsed.taskKind } : {}),
        ...(parsed.approvalMode ? { approvalMode: parsed.approvalMode } : {}),
        ...(parsed.allowedMcpServerNames
          ? { allowedMcpServerNames: parsed.allowedMcpServerNames }
          : {}),
        ...(parsed.mode ? { mode: parsed.mode } : {}),
        ...(parsed.force !== undefined ? { force: parsed.force } : {}),
        ...(parsed.trust !== undefined ? { trust: parsed.trust } : {}),
      });

      const spec = {
        mode: "parallel" as const,
        jobs: [job],
      };

      await input.orchestrationLifecycle.markRunning({
        requestId,
        source: "mcp",
        spec,
      });

      void runOrchestrationWorkflow(spec, {
        traceStore: input.orchestrationTraceStore,
        traceSource: "mcp",
        traceRequestId: requestId,
      })
        .then(async (result) => {
          await input.orchestrationLifecycle.markCompleted({
            requestId,
            source: "mcp",
            spec,
            result,
          });
        })
        .catch(async (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);

          await input.orchestrationLifecycle.markRunnerFailed({
            requestId,
            source: "mcp",
            spec,
            error: errorMessage,
            startedAt,
          });
        });

      return {
        ...buildAsyncWorkflowStartEnvelope({
          requestId,
          waitMode: "explicit_async",
        }),
        surface: "agent-category",
        category: parsed.category,
        route: {
          workerKind: job.kind,
          model: job.input.model,
          ...(job.workerRuntime ? { workerRuntime: job.workerRuntime } : {}),
        },
      };
    },
  };
}
