import { z } from "zod";

import { newId } from "../../../lib/ids.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import type { CursorWorkerInput } from "../../cursor/types.js";
import type { GeminiWorkerInput } from "../../gemini/types.js";
import { geminiApprovalModes, geminiTaskKinds, geminiWorkerInputSchema } from "../../gemini/schemas.js";
import type { OrchestrationLifecycle } from "../observability/orchestration-lifecycle.js";
import type { OrchestrationTraceStore } from "../observability/orchestration-trace.js";
import { runOrchestrationWorkflow } from "../run-orchestration-workflow.js";
import type { WorkerJob } from "../types.js";
import { buildAsyncWorkflowStartEnvelope } from "./async-workflow-envelope.js";

const callWorkerInputShape = {
  worker: z.enum(["gemini", "cursor"]),
  taskId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
  cwd: z.string().trim().min(1).optional(),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  binaryPath: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  workerRuntime: z.enum(["shell", "mcp"]).optional(),
  retries: z.number().int().min(0).max(5).optional(),
  retryDelayMs: z.number().int().positive().max(30_000).optional(),
  continueOnFailure: z.boolean().optional(),
  taskKind: z.enum(geminiTaskKinds).optional(),
  approvalMode: z.enum(geminiApprovalModes).optional(),
  allowedMcpServerNames: geminiWorkerInputSchema.shape.allowedMcpServerNames.optional(),
  mode: z.enum(["ask", "plan"]).optional(),
  force: z.boolean().optional(),
  trust: z.boolean().optional(),
} satisfies z.ZodRawShape;

const callWorkerInputSchema = z.object(callWorkerInputShape).superRefine((value, ctx) => {
  if (value.worker === "gemini") {
    if (value.mode !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mode"], message: "mode is only valid for cursor worker." });
    }
    if (value.force !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["force"], message: "force is only valid for cursor worker." });
    }
    if (value.trust !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trust"], message: "trust is only valid for cursor worker." });
    }
    return;
  }

  if (value.taskKind !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taskKind"], message: "taskKind is only valid for gemini worker." });
  }
  if (value.approvalMode !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approvalMode"], message: "approvalMode is only valid for gemini worker." });
  }
  if (value.allowedMcpServerNames !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedMcpServerNames"], message: "allowedMcpServerNames is only valid for gemini worker." });
  }
});

const defaultWorkerModels = {
  gemini: "gemini-3-pro-preview",
  cursor: "composer-2",
} as const;

export function getRegisteredCallWorkerTool(input: {
  readonly orchestrationLifecycle: OrchestrationLifecycle;
  readonly orchestrationTraceStore: OrchestrationTraceStore;
}): RegisteredTool {
  return {
    name: "call_worker",
    description:
      "Start a thin async task on an explicit worker lane (gemini or cursor) with an optional model override and return the standard workflow polling contract.",
    inputSchema: callWorkerInputShape,
    execute: async (rawInput) => {
      const parsed = callWorkerInputSchema.parse(rawInput);
      const requestId = newId("workflow");
      const startedAt = new Date().toISOString();
      const taskId =
        parsed.taskId?.trim() || `${parsed.worker}_${requestId.slice("workflow_".length, "workflow_".length + 12)}`;
      const job = buildWorkerJob(parsed, taskId);
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
        taskId,
        surface: "worker-lane",
        worker: parsed.worker,
        route: {
          workerKind: job.kind,
          model: job.input.model,
          reason: job.routeReason,
          ...(job.workerRuntime ? { workerRuntime: job.workerRuntime } : {}),
        },
      };
    },
  };
}

function buildWorkerJob(
  parsed: z.infer<typeof callWorkerInputSchema>,
  taskId: string,
): WorkerJob {
  if (parsed.worker === "gemini") {
    const geminiInput: GeminiWorkerInput = {
      taskId,
      prompt: parsed.prompt,
      model: parsed.model ?? defaultWorkerModels.gemini,
      ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
      ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
      ...(parsed.binaryPath ? { binaryPath: parsed.binaryPath } : {}),
      ...(parsed.taskKind ? { taskKind: parsed.taskKind } : {}),
      ...(parsed.approvalMode ? { approvalMode: parsed.approvalMode } : {}),
      ...(parsed.allowedMcpServerNames ? { allowedMcpServerNames: parsed.allowedMcpServerNames } : {}),
    };

    return {
      kind: "gemini",
      input: geminiInput,
      routeReason: parsed.model ? "explicit_worker_model_override" : "explicit_worker_lane",
      ...(parsed.workerRuntime ? { workerRuntime: parsed.workerRuntime } : {}),
      ...(parsed.retries !== undefined ? { retries: parsed.retries } : {}),
      ...(parsed.retryDelayMs !== undefined ? { retryDelayMs: parsed.retryDelayMs } : {}),
      ...(parsed.continueOnFailure !== undefined ? { continueOnFailure: parsed.continueOnFailure } : {}),
    };
  }

  const cursorInput: CursorWorkerInput = {
    taskId,
    prompt: parsed.prompt,
    model: parsed.model ?? defaultWorkerModels.cursor,
    ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
    ...(parsed.binaryPath ? { binaryPath: parsed.binaryPath } : {}),
    ...(parsed.mode ? { mode: parsed.mode } : {}),
    ...(parsed.force !== undefined ? { force: parsed.force } : {}),
    ...(parsed.trust !== undefined ? { trust: parsed.trust } : {}),
  };

  return {
    kind: "cursor",
    input: cursorInput,
    routeReason: parsed.model ? "explicit_worker_model_override" : "explicit_worker_lane",
    ...(parsed.workerRuntime ? { workerRuntime: parsed.workerRuntime } : {}),
    ...(parsed.retries !== undefined ? { retries: parsed.retries } : {}),
    ...(parsed.retryDelayMs !== undefined ? { retryDelayMs: parsed.retryDelayMs } : {}),
    ...(parsed.continueOnFailure !== undefined ? { continueOnFailure: parsed.continueOnFailure } : {}),
  };
}
