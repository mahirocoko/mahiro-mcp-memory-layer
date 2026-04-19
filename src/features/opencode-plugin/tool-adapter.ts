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
        execute: async (args: Record<string, unknown>, toolContext: Record<string, unknown>) => {
          if (tool.name === "inspect_memory_retrieval") {
            return serializeOpenCodeToolResult(
              await runtime.inspectMemoryRetrieval(args, toolContext),
              tool.name,
            );
          }

          const backend = await runtime.ensureBackend();
          return serializeOpenCodeToolResult(await tool.execute(backend, args), tool.name);
        },
      },
    ]),
  );

  return {
    ...memoryTools,
    runtime_capabilities: {
      description: "Read the active OpenCode runtime capability contract for memory and optional orchestration surfaces.",
      args: {},
      execute: async () => {
        return serializeOpenCodeToolResult(await runtime.readRuntimeCapabilities(), "runtime_capabilities");
      },
    },
    memory_context: {
      description: "Read cached memory context for the active OpenCode session.",
      args: {},
        execute: async (_args, toolContext) => {
          return serializeOpenCodeToolResult(await runtime.readMemoryContext(toolContext), "memory_context");
        },
      },
  };
}

function serializeOpenCodeToolResult(result: unknown, toolName: string): string {
  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(compactOpenCodeToolResult(result, toolName), null, 2);
}

function compactOpenCodeToolResult(result: unknown, toolName: string): unknown {
  if (!isRecord(result)) {
    return result;
  }

  if (
    toolName === "start_agent_task" ||
    toolName === "call_worker" ||
    toolName === "orchestrate_workflow" ||
    toolName === "get_orchestration_result"
  ) {
    const {
      recommendedFollowUp: _recommendedFollowUp,
      superviseWith: _superviseWith,
      superviseResultWith: _superviseResultWith,
      waitWith: _waitWith,
      message: _message,
      ...rest
    } = result;

    return rest;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
