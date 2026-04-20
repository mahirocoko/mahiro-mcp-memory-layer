import { getMemoryToolDefinitions } from "../memory/lib/tool-definitions.js";
import type { OpenCodePluginFacadeConfigSnapshot } from "./config.js";

const orchestrationToolNames = [
  "start_agent_task",
  "get_orchestration_result",
  "inspect_subagent_session",
] as const;

export interface OpenCodePluginRuntimeCapabilities {
  readonly mode: "plugin-native";
  readonly memory: {
    readonly toolNames: readonly string[];
    readonly sessionStartWakeUpAvailable: true;
    readonly turnPreflightAvailable: true;
    readonly idlePersistenceAvailable: true;
    readonly memoryContextToolAvailable: true;
  };
  readonly orchestration: {
    readonly available: boolean;
    readonly serverName?: string;
    readonly toolNames: readonly string[];
    readonly activation: "plugin-native" | "unavailable";
  };
  readonly facade: {
    readonly categoryRoutingAvailable: true;
    readonly categoryRoutes: OpenCodePluginFacadeConfigSnapshot["categoryRoutes"];
    readonly remindersConfigured: boolean;
    readonly sessionVisibleRemindersAvailable: boolean;
    readonly sessionTaskFlowAvailable: boolean;
  };
}

export interface OpenCodePluginRuntimeCapabilityOptions {
  readonly sessionVisibleRemindersAvailable?: boolean;
  readonly sessionReminderSupport?: {
    readonly sessionPromptAsyncAvailable: boolean;
  };
  readonly facadeConfig?: OpenCodePluginFacadeConfigSnapshot;
}

export function resolveOpenCodePluginRuntimeCapabilitiesSync(
  options: OpenCodePluginRuntimeCapabilityOptions = {},
): Pick<OpenCodePluginRuntimeCapabilities, "mode" | "orchestration" | "facade"> {
  const remindersConfigured = options.facadeConfig?.remindersEnabled ?? false;
  const sessionVisibleRemindersAvailable =
    options.sessionVisibleRemindersAvailable ?? options.sessionReminderSupport?.sessionPromptAsyncAvailable ?? false;
  const sessionTaskFlowAvailable = sessionVisibleRemindersAvailable;

  return {
    mode: "plugin-native",
    orchestration: true
      ? {
          available: true,
          toolNames: orchestrationToolNames,
          activation: "plugin-native",
        }
      : {
          available: false,
          toolNames: [],
          activation: "unavailable",
        },
    facade: {
      categoryRoutingAvailable: true,
      categoryRoutes: options.facadeConfig?.categoryRoutes ?? {},
      remindersConfigured,
      sessionVisibleRemindersAvailable,
      sessionTaskFlowAvailable,
    },
  };
}

export async function resolveOpenCodePluginRuntimeCapabilities(
  options: OpenCodePluginRuntimeCapabilityOptions = {},
): Promise<OpenCodePluginRuntimeCapabilities> {
  const syncCapabilities = resolveOpenCodePluginRuntimeCapabilitiesSync(options);

  return {
    mode: "plugin-native",
    memory: {
      toolNames: [...getMemoryToolDefinitions().map((tool) => tool.name), "memory_context"],
      sessionStartWakeUpAvailable: true,
      turnPreflightAvailable: true,
      idlePersistenceAvailable: true,
      memoryContextToolAvailable: true,
    },
    orchestration: syncCapabilities.orchestration.available
      ? {
          available: true,
          toolNames: orchestrationToolNames,
          activation: "plugin-native",
        }
      : {
          available: false,
          toolNames: [],
          activation: "unavailable",
        },
    facade: {
      categoryRoutingAvailable: true,
      categoryRoutes: syncCapabilities.facade.categoryRoutes,
      remindersConfigured: syncCapabilities.facade.remindersConfigured,
      sessionVisibleRemindersAvailable: syncCapabilities.facade.sessionVisibleRemindersAvailable,
      sessionTaskFlowAvailable: syncCapabilities.facade.sessionTaskFlowAvailable,
    },
  };
}

export function buildOpenCodePluginStartupBrief(
  capabilities: OpenCodePluginRuntimeCapabilities,
): string {
  const sections = [
    "## Runtime startup brief",
    "- Runtime mode: plugin-native memory tools with plugin-native orchestration when enabled.",
    `- Memory tools: ${capabilities.memory.toolNames.join(", ")}.`,
    "- Memory activation: session-start wake-up, turn preflight, and idle persistence are enabled.",
    capabilities.orchestration.available
      ? `- Orchestration: available on the plugin path with tools like ${capabilities.orchestration.toolNames.join(", ")}.`
      : "- Orchestration: unavailable in this runtime.",
    Object.keys(capabilities.facade.categoryRoutes).length > 0
      ? `- Facade routing overrides: configured for ${Object.keys(capabilities.facade.categoryRoutes).join(", ")}.`
      : "- Facade routing overrides: none configured.",
    capabilities.facade.remindersConfigured
      ? capabilities.facade.sessionVisibleRemindersAvailable
        ? "- Async reminders: configured and the plugin can inject reminder continuations back into the active session."
        : "- Async reminders: configured, but dormant because no session-visible continuation surface is available in this runtime."
      : "- Async reminders: disabled by config.",
    capabilities.facade.sessionTaskFlowAvailable
      ? "- Session task flow: visible Task-style starts are available on the plugin path."
      : "- Session task flow: unavailable.",
  ];

  return sections.join("\n");
}
