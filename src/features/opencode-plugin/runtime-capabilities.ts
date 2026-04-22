import { getMemoryToolDefinitions } from "../memory/lib/tool-definitions.js";

export interface OpenCodePluginRuntimeCapabilities {
  readonly mode: "plugin-native";
  readonly memory: {
    readonly toolNames: readonly string[];
    readonly sessionStartWakeUpAvailable: true;
    readonly turnPreflightAvailable: true;
    readonly idlePersistenceAvailable: true;
    readonly memoryContextToolAvailable: true;
  };
}

export interface OpenCodePluginRuntimeCapabilityOptions {}

export function resolveOpenCodePluginRuntimeCapabilitiesSync(
  options: OpenCodePluginRuntimeCapabilityOptions = {},
): Pick<OpenCodePluginRuntimeCapabilities, "mode"> {
  void options;

  return {
    mode: "plugin-native",
  };
}

export async function resolveOpenCodePluginRuntimeCapabilities(
  options: OpenCodePluginRuntimeCapabilityOptions = {},
): Promise<OpenCodePluginRuntimeCapabilities> {
  void resolveOpenCodePluginRuntimeCapabilitiesSync(options);

  return {
    mode: "plugin-native",
    memory: {
      toolNames: [...getMemoryToolDefinitions().map((tool) => tool.name), "memory_context"],
      sessionStartWakeUpAvailable: true,
      turnPreflightAvailable: true,
      idlePersistenceAvailable: true,
      memoryContextToolAvailable: true,
    },
  };
}

export function buildOpenCodePluginStartupBrief(
  capabilities: OpenCodePluginRuntimeCapabilities,
): string {
  const sections = [
    "## Runtime startup brief",
    "- Runtime mode: plugin-native memory tools.",
    `- Memory tools: ${capabilities.memory.toolNames.join(", ")}.`,
    "- Memory activation: session-start wake-up, turn preflight, and idle persistence are enabled.",
    "- memory_context: available for session-scoped continuity cache introspection.",
  ];

  return sections.join("\n");
}
