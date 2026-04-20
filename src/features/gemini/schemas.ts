import { z } from "zod";

export const geminiWorkerInputSchema = z.object({
  taskId: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  taskKind: z.string().optional(),
  approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
  allowedMcpServerNames: z.union([
    z.literal("none"),
    z.array(z.string().refine((value) => !value.includes(",") && value !== "none", {
      message: "MCP server names must round-trip through shell serialization.",
    })),
  ]).optional(),
});
