import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { cursorWorkerInputSchema } from "../schemas.js";
import { shellCursorRuntime } from "../runtime/shell/shell-cursor-runtime.js";

/**
 * MCP tools that execute Cursor-family workers via the shell-backed runtime inside the server process.
 * Used by {@link mcpCursorRuntime}: the out-of-process client calls these tools instead of spawning `agent` locally.
 */
export function getRegisteredCursorWorkerTools(): readonly RegisteredTool[] {
  return [
    {
      name: "run_cursor_worker",
      description:
        "Run a Cursor-family worker job via the local shell runtime (agent CLI). Intended for MCP stdio clients; orchestration defaults still use shell directly unless MAHIRO_CURSOR_RUNTIME=mcp.",
      inputSchema: cursorWorkerInputSchema.shape,
      execute: async (input) => {
        const parsed = cursorWorkerInputSchema.parse(input);
        return shellCursorRuntime.run(parsed);
      },
    },
  ];
}
