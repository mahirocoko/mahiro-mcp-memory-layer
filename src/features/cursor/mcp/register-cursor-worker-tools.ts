import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { createAsyncWorkerTools } from "../../orchestration/mcp/async-worker-tools.js";
import { cursorWorkerInputSchema } from "../schemas.js";
import { shellCursorRuntime } from "../runtime/shell/shell-cursor-runtime.js";

/**
 * MCP tools that execute Cursor-family workers via the shell-backed runtime inside the server process.
 * Used by {@link mcpCursorRuntime}: the out-of-process client calls these tools instead of spawning `agent` locally.
 */
export function getRegisteredCursorWorkerTools(): readonly RegisteredTool[] {
  return [
    ...createAsyncWorkerTools({
      kind: "cursor",
      startInputSchema: cursorWorkerInputSchema,
      startToolName: "run_cursor_worker_async",
      getToolName: "get_cursor_worker_result",
      startDescription:
        "Start a Cursor-family worker job asynchronously via the local shell runtime and return a workflow requestId for polling.",
      getDescription: "Get the latest stored Cursor async worker result by workflow requestId.",
      buildJob: (input) => ({
        kind: "cursor",
        input,
        workerRuntime: "shell",
      }),
    }),
    {
      name: "run_cursor_worker",
      description:
        "Run a Cursor-family worker job synchronously via the local shell runtime (agent CLI). Intended for MCP stdio clients and short calls; long-running callers should prefer run_cursor_worker_async plus get_cursor_worker_result.",
      inputSchema: cursorWorkerInputSchema.shape,
      execute: async (input) => {
        const parsed = cursorWorkerInputSchema.parse(input);
        const result = await shellCursorRuntime.run(parsed);

        return {
          ...result,
          executionMode: "sync",
          preferredAsyncTool: "run_cursor_worker_async",
          resultTool: "get_cursor_worker_result",
          warning:
            "This tool blocks until the worker finishes. For long-running Cursor jobs, prefer run_cursor_worker_async and poll get_cursor_worker_result with the returned workflow requestId.",
        };
      },
    },
  ];
}
