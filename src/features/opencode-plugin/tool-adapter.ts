import { z } from "zod";

import { getMemoryToolDefinitions } from "../memory/lib/tool-definitions.js";
import { getRegisteredOrchestrationTools } from "../orchestration/mcp/register-tools.js";
import { getRegisteredPluginFacadeTools } from "../orchestration/mcp/plugin-facade-tools.js";

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
            );
          }

          const backend = await runtime.ensureBackend();
          return serializeOpenCodeToolResult(await tool.execute(backend, args));
        },
      },
    ]),
  );

  const orchestrationTools = runtime.orchestrationFacadeAvailable
    ? Object.fromEntries(
        getRegisteredPluginFacadeTools(getRegisteredOrchestrationTools()).map((tool) => [
          tool.name,
          {
            description: tool.description,
            args: tool.inputSchema,
              execute: async (args: Record<string, unknown>, toolContext: Record<string, unknown>) => {
                const result = await tool.execute(args);
                await runtime.trackAsyncTaskStart(result, toolContext, {
                  toolName: tool.name,
                  args,
                });
                return serializeOpenCodeToolResult(result);
              },
            },
        ]),
      )
    : {};

  return {
    ...memoryTools,
    ...orchestrationTools,
    runtime_capabilities: {
      description: "Read the active OpenCode runtime capability contract for memory and optional orchestration surfaces.",
      args: {},
      execute: async () => {
        return serializeOpenCodeToolResult(await runtime.readRuntimeCapabilities());
      },
    },
    memory_context: {
      description: "Read cached memory context for the active OpenCode session.",
      args: {},
      execute: async (_args, toolContext) => {
        return serializeOpenCodeToolResult(await runtime.readMemoryContext(toolContext));
      },
    },
    mark_orchestration_task_verification: {
      description:
        "Mark a session-tracked orchestration task as completed or needs_attention after external verification.",
      args: {
        requestId: z.string().trim().min(1),
        outcome: z.enum(["completed", "needs_attention"]),
        note: z.string().trim().min(1).optional(),
      },
      execute: async (args, toolContext) => {
        return serializeOpenCodeToolResult(
          await runtime.markOrchestrationTaskVerification(args, toolContext),
        );
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
