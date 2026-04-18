import { z } from "zod";

import { cursorWorkerInputSchema } from "../cursor/schemas.js";
import { geminiWorkerInputSchema } from "../gemini/schemas.js";
import { newId } from "../../lib/ids.js";
import type { SequentialWorkerStep, WorkerJob } from "./types.js";

export const geminiWorkflowInputSchema = geminiWorkerInputSchema.omit({ taskId: true }).extend({
  taskId: z.string().trim().min(1).optional(),
});

export const cursorWorkflowInputSchema = cursorWorkerInputSchema.omit({ taskId: true }).extend({
  taskId: z.string().trim().min(1).optional(),
});

const workerRuntimeSchema = z.enum(["shell", "mcp"]);

export const workflowJobSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gemini"),
    input: geminiWorkflowInputSchema,
    workerRuntime: workerRuntimeSchema.optional(),
    retries: z.number().int().min(0).max(5).optional(),
    retryDelayMs: z.number().int().positive().max(30_000).optional(),
    continueOnFailure: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("cursor"),
    input: cursorWorkflowInputSchema,
    workerRuntime: workerRuntimeSchema.optional(),
    retries: z.number().int().min(0).max(5).optional(),
    retryDelayMs: z.number().int().positive().max(30_000).optional(),
    continueOnFailure: z.boolean().optional(),
  }),
]);

export const workflowSpecSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("parallel"),
    maxConcurrency: z.number().int().positive().max(100).optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    defaultTrust: z.boolean().optional(),
    jobs: z.array(workflowJobSchema).min(1),
  }),
  z.object({
    mode: z.literal("sequential"),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    defaultTrust: z.boolean().optional(),
    steps: z.array(workflowJobSchema).min(1),
  }),
]);

export const orchestrateToolInputSchema = z.object({
  spec: workflowSpecSchema,
  cwd: z.string().trim().min(1).optional(),
  waitForCompletion: z.boolean().optional(),
}).superRefine((input, ctx) => {
  if (input.waitForCompletion === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["waitForCompletion"],
      message:
        "waitForCompletion: true is no longer supported. MCP orchestration is async-only: omit waitForCompletion for auto_async or set it false for explicit_async, then follow the returned requestId with supervise_orchestration_result or get_orchestration_result. Use wait_for_orchestration_result only as a separate short blocking read on an already-started workflow.",
    });
  }
});

export type WorkflowSpecInput = z.infer<typeof workflowSpecSchema>;

export type OrchestrateWorkflowSpec =
  | { readonly mode: "parallel"; readonly maxConcurrency?: number; readonly timeoutMs?: number; readonly defaultTrust?: boolean; readonly jobs: readonly WorkerJob[] }
  | { readonly mode: "sequential"; readonly timeoutMs?: number; readonly defaultTrust?: boolean; readonly steps: readonly SequentialWorkerStep[] };

export type WorkflowControlPlane = "shell" | "mcp";

export function normalizeWorkflowSpec(
  spec: WorkflowSpecInput,
  defaultCwd: string | undefined,
  controlPlane: WorkflowControlPlane = "shell",
): OrchestrateWorkflowSpec {
  if (spec.mode === "parallel") {
    return {
      mode: spec.mode,
      maxConcurrency: spec.maxConcurrency,
      timeoutMs: spec.timeoutMs,
      defaultTrust: spec.defaultTrust,
      jobs: spec.jobs.map((job) => normalizeJob(job, defaultCwd, spec.defaultTrust, controlPlane)),
    };
  }

  return {
    mode: spec.mode,
    timeoutMs: spec.timeoutMs,
    defaultTrust: spec.defaultTrust,
    steps: spec.steps.map((step) => normalizeJob(step, defaultCwd, spec.defaultTrust, controlPlane)),
  };
}

function normalizeJob(
  job: z.infer<typeof workflowJobSchema>,
  defaultCwd: string | undefined,
  defaultTrust: boolean | undefined,
  _controlPlane: WorkflowControlPlane,
): WorkerJob {
  const workerRuntime = job.workerRuntime;

  if (job.kind === "gemini") {
    return {
      kind: job.kind,
      input: {
        ...job.input,
        taskId: job.input.taskId ?? newId("gemini"),
        cwd: job.input.cwd ?? defaultCwd,
      },
      ...(workerRuntime !== undefined ? { workerRuntime } : {}),
      retries: job.retries,
      retryDelayMs: job.retryDelayMs,
      continueOnFailure: job.continueOnFailure,
    };
  }

  return {
    kind: job.kind,
    input: {
      ...job.input,
      taskId: job.input.taskId ?? newId("cursor"),
        cwd: job.input.cwd ?? defaultCwd,
        trust: job.input.trust !== undefined ? job.input.trust : defaultTrust,
      },
      ...(workerRuntime !== undefined ? { workerRuntime } : {}),
      retries: job.retries,
      retryDelayMs: job.retryDelayMs,
      continueOnFailure: job.continueOnFailure,
    };
  }
