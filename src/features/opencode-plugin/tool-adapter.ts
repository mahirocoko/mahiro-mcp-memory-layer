import { z } from "zod";
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
    start_agent_task: {
      description: "Start a background shell/tmux subagent task from the current plugin session.",
      args: {
        category: z.string().min(1),
        prompt: z.string().min(1),
        model: z.string().optional(),
        mode: z.enum(["plan", "ask"]).optional(),
        trust: z.boolean().optional(),
        force: z.boolean().optional(),
        taskKind: z.string().optional(),
        approvalMode: z.enum(["default", "auto_edit", "yolo", "plan"]).optional(),
        allowedMcpServerNames: z.union([z.array(z.string()), z.literal("none")]).optional(),
      },
      execute: async (args, toolContext) => {
        return serializeOpenCodeToolResult(await runtime.startAgentTask(args, toolContext), "start_agent_task");
      },
    },
    get_orchestration_result: {
      description: "Read the latest stored orchestration result for a tracked task.",
      args: {
        requestId: z.string().min(1),
      },
      execute: async (args) => {
        return serializeOpenCodeToolResult(await runtime.getOrchestrationResult(args), "get_orchestration_result");
      },
    },
    inspect_subagent_session: {
      description: "Observe the latest tracked tmux subagent session state by subagent id.",
      args: {
        subagentId: z.string().min(1),
      },
      execute: async (args) => {
        return serializeOpenCodeToolResult(await runtime.inspectSubagentSession(args), "inspect_subagent_session");
      },
    },
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
