import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { createAsyncWorkerTools } from "../../orchestration/mcp/async-worker-tools.js";
import { cursorWorkerInputSchema } from "../schemas.js";

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
  ];
}
