import { z } from "zod";

export const cursorWorkerInputSchema = z.object({
  taskId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  model: z.string().trim().min(1),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  cwd: z.string().trim().min(1).optional(),
  binaryPath: z.string().trim().min(1).optional(),
  mode: z.enum(["ask", "plan"]).optional(),
  force: z.boolean().optional(),
  trust: z.boolean().optional(),
});

export const cursorJsonResponseSchema = z.object({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  session_id: z.string().optional(),
  request_id: z.string().optional(),
  duration_ms: z.number().optional(),
  model: z.string().optional(),
}).catchall(z.unknown());
