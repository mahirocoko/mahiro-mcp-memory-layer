import { getMemoryToolDefinitions } from "../memory/lib/tool-definitions.js";

export interface OpenCodePluginMemoryProtocol {
  readonly version: "1";
  readonly guidelines: readonly string[];
}

export interface OpenCodePluginRuntimeCapabilities {
  readonly mode: "plugin-native";
  readonly memory: {
    readonly toolNames: readonly string[];
    readonly sessionStartWakeUpAvailable: true;
    readonly turnPreflightAvailable: true;
    readonly idlePersistenceAvailable: true;
    readonly memoryContextToolAvailable: true;
    readonly lifecycleDiagnosticsAvailable: true;
    readonly compactionContinuityAvailable: true;
    readonly memoryProtocol: OpenCodePluginMemoryProtocol;
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
  const memoryProtocol = buildOpenCodePluginMemoryProtocol();

  return {
    mode: "plugin-native",
    memory: {
      toolNames: [...getMemoryToolDefinitions().map((tool) => tool.name), "memory_context"],
      sessionStartWakeUpAvailable: true,
      turnPreflightAvailable: true,
      idlePersistenceAvailable: true,
      memoryContextToolAvailable: true,
      lifecycleDiagnosticsAvailable: true,
      compactionContinuityAvailable: true,
      memoryProtocol,
    },
  };
}

export function buildOpenCodePluginMemoryProtocol(): OpenCodePluginMemoryProtocol {
  return {
    version: "1",
    guidelines: [
      "Search memory before answering questions about prior work.",
      "Inspect the retrieval trace when recall is empty or unclear.",
      "Save or propose durable decisions, preferences, and tasks through the existing memory tools.",
      "Use review and invalidation flow when memories conflict.",
      "Preserve current decisions and active tasks before compaction.",
    ],
  };
}

export function buildOpenCodePluginStartupBrief(
  capabilities: OpenCodePluginRuntimeCapabilities,
): string {
  const memoryProtocol = capabilities.memory.memoryProtocol;
  const sections = [
    "## Runtime startup brief",
    "- Runtime mode: plugin-native memory tools.",
    `- Memory tools: ${capabilities.memory.toolNames.join(", ")}.`,
    "- Memory activation: session-start wake-up, turn preflight, and idle persistence are enabled.",
    "- Memory lifecycle diagnostics and compaction continuity are available through memory_context.",
    "- memory_context: available for session-scoped continuity cache introspection.",
    "## Memory protocol",
    `- Version: ${memoryProtocol.version}`,
    ...memoryProtocol.guidelines.map((guideline) => `- ${guideline}`),
  ];

  return sections.join("\n");
}
