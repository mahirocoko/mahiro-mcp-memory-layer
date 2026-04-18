import { z } from "zod";

export const geminiTaskKinds = ["general", "summarize", "timeline", "extract-facts"] as const;
export const geminiApprovalModes = ["default", "auto_edit", "yolo", "plan"] as const;
const trimmedNonEmptyStringSchema = z.string().trim().min(1);
const geminiAllowedMcpServerNameSchema = trimmedNonEmptyStringSchema.refine(
  (value) => value !== "none" && !value.includes(","),
  "allowed MCP server names must not be 'none' or contain commas.",
);

export const geminiWorkerInputSchema = z.object({
  taskId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  model: z.string().trim().min(1),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  cwd: z.string().trim().min(1).optional(),
  binaryPath: z.string().trim().min(1).optional(),
  taskKind: z.enum(geminiTaskKinds).optional(),
  approvalMode: z.enum(geminiApprovalModes).optional(),
  allowedMcpServerNames: z.union([
    z.literal("none"),
    z.array(geminiAllowedMcpServerNameSchema).min(1),
  ]).optional(),
});

export const geminiJsonResponseSchema = z.object({
  response: z.string().optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
}).catchall(z.unknown());

export const geminiSummaryOutputSchema = z.object({
  summary: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).min(1).max(8),
});

export const geminiTimelineItemSchema = z.object({
  period: z.string().trim().min(1),
  change: z.string().trim().min(1),
  detail: z.string().trim().min(1),
});

export const geminiTimelineOutputSchema = z.object({
  overview: z.string().trim().min(1),
  timeline: z.array(geminiTimelineItemSchema).min(1).max(12),
});

export const geminiFactItemSchema = z.object({
  fact: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
});

export const geminiExtractFactsOutputSchema = z.object({
  summary: z.string().trim().min(1),
  facts: z.array(geminiFactItemSchema).min(1).max(12),
  warnings: z.array(z.string().trim().min(1)).default([]),
});
