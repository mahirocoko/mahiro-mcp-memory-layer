import { getMemoryToolDefinitions } from "../memory/lib/tool-definitions.js";

import type {
  OpenCodePluginHooks,
  OpenCodePluginRuntime,
} from "./runtime-shell.js";

export function createOpenCodePluginTools(
  runtime: OpenCodePluginRuntime,
): OpenCodePluginHooks["tool"] {
  const memoryTools = Object.fromEntries(
    getMemoryToolDefinitions().map((tool) => [
      tool.name,
      {
        description: tool.description,
        args: tool.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          const backend = await runtime.ensureBackend();
          return serializeOpenCodeToolResult(await tool.execute(backend, args));
        },
      },
    ]),
  );

  return {
    ...memoryTools,
    memory_context: {
      description: "Read cached memory context for the active OpenCode session.",
      args: {},
      execute: async (_args, toolContext) => {
        return serializeOpenCodeToolResult(await runtime.readMemoryContext(toolContext));
      },
    },
  };
}

function serializeOpenCodeToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(result, null, 2);
}
