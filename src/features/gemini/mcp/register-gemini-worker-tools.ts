import { z } from "zod";

import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { createAsyncWorkerTools } from "../../orchestration/mcp/async-worker-tools.js";
import { geminiWorkerInputSchema } from "../schemas.js";
import { shellGeminiRuntime } from "../runtime/shell/shell-gemini-runtime.js";

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
    {
      name: "run_gemini_worker",
      description:
        "Run a Gemini worker job synchronously via the local shell runtime (gemini CLI). Intended for MCP stdio clients and short calls; long-running callers should prefer run_gemini_worker_async plus get_gemini_worker_result.",
      inputSchema: geminiWorkerInputSchema.shape,
      execute: async (input) => {
        const parsed = geminiWorkerInputSchema.parse(input);
        const result = await shellGeminiRuntime.run(parsed);

        return {
          ...result,
          executionMode: "sync",
          preferredAsyncTool: "run_gemini_worker_async",
          resultTool: "get_gemini_worker_result",
          warning:
            "This tool blocks until the worker finishes. For long-running Gemini jobs, prefer run_gemini_worker_async and poll get_gemini_worker_result with the returned workflow requestId. Do not switch to this sync tool just because an async Gemini job is still running or a bounded wait timed out.",
        };
      },
    },
  ];
}
