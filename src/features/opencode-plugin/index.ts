import { getOpenCodePluginConfig } from "./config.js";
import type { OpenCodePluginContext, OpenCodePluginEvent } from "./resolve-scope.js";
import {
  createOpenCodePluginRuntime,
  type OpenCodePluginHooks,
  type OpenCodePluginServerOptions,
} from "./runtime-shell.js";

export async function server(
  context: OpenCodePluginContext,
  options: OpenCodePluginServerOptions = {},
): Promise<OpenCodePluginHooks> {
  const runtimeConfig = getOpenCodePluginConfig();
  const runtime = createOpenCodePluginRuntime(
    context,
    options,
    options.__test?.messageDebounceMs ?? runtimeConfig.runtime.messageDebounceMs,
  );

  return {
    event: async ({ event }) => {
      await runtime.handleEvent(event);
    },
    "session.created": async ({ event }: { readonly event: OpenCodePluginEvent }) => {
      await runtime.handleSessionCreated(event);
    },
    "message.updated": async ({ event }: { readonly event: OpenCodePluginEvent }) => {
      await runtime.handleMessageUpdated(event);
    },
    "session.idle": async ({ event }: { readonly event: OpenCodePluginEvent }) => {
      await runtime.handleSessionIdle(event);
    },
    "experimental.session.compacting": async (input, output) => {
      await runtime.handleExperimentalSessionCompacting(input, output);
    },
    tool: {
      memory_context: {
        description: "Read cached memory context for the active OpenCode session.",
        args: {},
        execute: async (_args, toolContext) => {
          return await runtime.readMemoryContext(toolContext);
        },
      },
    },
  };
}
