import { z } from "zod";

export const listOrchestrationTracesInputSchema = z.object({
  source: z.enum(["cli", "mcp"]).optional(),
  mode: z.enum(["parallel", "sequential"]).optional(),
  status: z.enum(["completed", "step_failed", "timed_out", "runner_failed"]).optional(),
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
