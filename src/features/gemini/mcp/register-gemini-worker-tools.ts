import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";
import { geminiWorkerInputSchema } from "../schemas.js";
import { shellGeminiRuntime } from "../runtime/shell/shell-gemini-runtime.js";

/**
 * MCP tools that execute Gemini workers via the shell-backed runtime inside the server process.
 * Used by {@link mcpGeminiRuntime}: the out-of-process client calls these tools instead of spawning `gemini` locally.
 */
export function getRegisteredGeminiWorkerTools(): readonly RegisteredTool[] {
  return [
    {
      name: "run_gemini_worker",
      description:
        "Run a Gemini worker job via the local shell runtime (gemini CLI). Intended for MCP stdio clients; orchestration defaults still use shell directly unless runtime selection opts into MCP.",
      inputSchema: geminiWorkerInputSchema.shape,
      execute: async (input) => {
        const parsed = geminiWorkerInputSchema.parse(input);
        return shellGeminiRuntime.run(parsed);
      },
    },
  ];
}
