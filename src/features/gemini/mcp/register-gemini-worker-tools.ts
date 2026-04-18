import { z } from "zod";

import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { createAsyncWorkerTools } from "../../orchestration/mcp/async-worker-tools.js";
import { geminiWorkerInputSchema } from "../schemas.js";

const geminiAsyncWorkerStartSchema = geminiWorkerInputSchema.extend({
  retries: z.number().int().min(0).max(5).optional(),
  retryDelayMs: z.number().int().positive().max(30_000).optional(),
});

/**
 * MCP tools that execute Gemini workers via the shell-backed runtime inside the server process.
 * Used by {@link mcpGeminiRuntime}: the out-of-process client calls these tools instead of spawning `gemini` locally.
 */
export function getRegisteredGeminiWorkerTools(): readonly RegisteredTool[] {
  return [
    ...createAsyncWorkerTools({
      kind: "gemini",
      startInputSchema: geminiAsyncWorkerStartSchema,
      startToolName: "run_gemini_worker_async",
      getToolName: "get_gemini_worker_result",
      startDescription:
        "Start a Gemini worker job asynchronously via the local shell runtime and return a workflow requestId for polling.",
      getDescription: "Get the latest stored Gemini async worker result by workflow requestId.",
      buildJob: ({ retries, retryDelayMs, ...input }) => ({
        kind: "gemini",
        input,
        retries,
        retryDelayMs,
        workerRuntime: "shell",
      }),
    }),
  ];
}
