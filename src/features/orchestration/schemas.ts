import { z } from "zod";

export const waitForOrchestrationResultInputSchema = z.object({
  requestId: z.string().trim().regex(/^workflow_[0-9a-f]{32}$/, "requestId must be the workflow_* id returned by orchestrate_workflow"),
  pollIntervalMs: z.number().int().positive().max(60_000).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  includeCompletionSummary: z.boolean().optional(),
});

export const superviseOrchestrationResultInputSchema = z.object({
  requestId: z.string().trim().regex(/^workflow_[0-9a-f]{32}$/, "requestId must be the workflow_* id returned by orchestrate_workflow"),
  pollIntervalMs: z.number().int().positive().max(60_000).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
});

export const listOrchestrationTracesInputSchema = z.object({
  source: z.enum(["cli", "mcp"]).optional(),
  mode: z.enum(["parallel", "sequential"]).optional(),
  status: z.enum(["completed", "failed", "step_failed", "timed_out", "runner_failed"]).optional(),
  requestId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  fromDate: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Number.isFinite(Date.parse(value)), "Invalid fromDate.")
    .optional(),
  toDate: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Number.isFinite(Date.parse(value)), "Invalid toDate.")
    .optional(),
  limit: z.number().int().positive().max(100).optional(),
});
