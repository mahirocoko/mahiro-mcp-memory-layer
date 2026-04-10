import type { PluginInput } from "@opencode-ai/plugin";

import { loadOpenCodePluginConfig } from "./config-loader.js";
import { applyOpenCodePluginMcpConfig } from "./mcp-config-adapter.js";
import type { OpenCodePluginEvent } from "./resolve-scope.js";
import { createOpenCodePluginTools } from "./tool-adapter.js";
import {
  createOpenCodePluginRuntime,
  type OpenCodePluginHooks,
  type OpenCodePluginServerOptions,
} from "./runtime-shell.js";

export async function server(
  context: PluginInput,
  options: OpenCodePluginServerOptions = {},
): Promise<OpenCodePluginHooks> {
  const runtimeConfig = await loadOpenCodePluginConfig({
    contextDirectory: context.directory,
  });
  const runtime = createOpenCodePluginRuntime(
    context,
    options,
    options.__test?.messageDebounceMs ?? runtimeConfig.runtime.messageDebounceMs,
  );

  return {
    config: async (config) => {
      await applyOpenCodePluginMcpConfig(config);
    },
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
    tool: createOpenCodePluginTools(runtime),
  };
}
