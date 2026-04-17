import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getMemoryToolDefinitions } from "../memory/lib/tool-definitions.js";
import type { OpenCodePluginFacadeConfigSnapshot } from "./config.js";

const standaloneMcpServerEntryPath = fileURLToPath(new URL("../../index.ts", import.meta.url));
const memoryMcpServerPath = fileURLToPath(new URL("../memory/mcp/server.ts", import.meta.url));
const orchestrationMcpToolsPath = fileURLToPath(new URL("../orchestration/mcp/register-tools.ts", import.meta.url));

export const standaloneMcpServerName = "mahiro-mcp-memory-layer";

const orchestrationToolNames = [
  "orchestrate_workflow",
  "get_orchestration_result",
  "supervise_orchestration_result",
  "get_orchestration_supervision_result",
  "wait_for_orchestration_result",
  "list_orchestration_traces",
  "run_gemini_worker_async",
  "get_gemini_worker_result",
  "run_cursor_worker_async",
  "get_cursor_worker_result",
  "run_gemini_worker",
  "run_cursor_worker",
] as const;

export interface OpenCodePluginRuntimeCapabilities {
  readonly mode: "plugin-native" | "plugin-native+mcp";
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
    readonly activation: "source-checkout-mcp-injection" | "unavailable";
  };
  readonly facade: {
    readonly categoryRoutingAvailable: true;
    readonly categoryRoutes: OpenCodePluginFacadeConfigSnapshot["categoryRoutes"];
    readonly remindersConfigured: boolean;
    readonly sessionVisibleRemindersAvailable: boolean;
  };
}

export interface OpenCodePluginRuntimeCapabilityOptions {
  readonly standaloneMcpAvailable?: boolean;
  readonly sessionVisibleRemindersAvailable?: boolean;
  readonly facadeConfig?: OpenCodePluginFacadeConfigSnapshot;
}

export async function resolveOpenCodePluginRuntimeCapabilities(
  options: OpenCodePluginRuntimeCapabilityOptions = {},
): Promise<OpenCodePluginRuntimeCapabilities> {
  const standaloneMcpAvailable =
    options.standaloneMcpAvailable ?? (await standaloneMcpServerExists());
  const remindersConfigured = options.facadeConfig?.remindersEnabled ?? false;
  const sessionVisibleRemindersAvailable = options.sessionVisibleRemindersAvailable ?? false;

  return {
    mode: standaloneMcpAvailable ? "plugin-native+mcp" : "plugin-native",
    memory: {
      toolNames: [...getMemoryToolDefinitions().map((tool) => tool.name), "memory_context"],
      sessionStartWakeUpAvailable: true,
      turnPreflightAvailable: true,
      idlePersistenceAvailable: true,
      memoryContextToolAvailable: true,
    },
    orchestration: standaloneMcpAvailable
      ? {
          available: true,
          serverName: standaloneMcpServerName,
          toolNames: orchestrationToolNames,
          activation: "source-checkout-mcp-injection",
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
    },
  };
}

export function buildOpenCodePluginStartupBrief(
  capabilities: OpenCodePluginRuntimeCapabilities,
): string {
  const sections = [
    "## Runtime startup brief",
    capabilities.mode === "plugin-native+mcp"
      ? "- Runtime mode: plugin-native memory tools + injected standalone MCP orchestration path."
      : "- Runtime mode: plugin-native memory tools only.",
    `- Memory tools: ${capabilities.memory.toolNames.join(", ")}.`,
    "- Memory activation: session-start wake-up, turn preflight, and idle persistence are enabled.",
    capabilities.orchestration.available
      ? `- Orchestration: available through MCP server \`${capabilities.orchestration.serverName}\` with tools like ${capabilities.orchestration.toolNames.slice(0, 4).join(", ")}.`
      : "- Orchestration: not advertised on the standard plugin path unless the standalone MCP runtime is present.",
    Object.keys(capabilities.facade.categoryRoutes).length > 0
      ? `- Facade routing overrides: configured for ${Object.keys(capabilities.facade.categoryRoutes).join(", ")}.`
      : "- Facade routing overrides: none configured.",
    capabilities.facade.remindersConfigured
      ? capabilities.facade.sessionVisibleRemindersAvailable
        ? "- Async reminders: configured and a session-visible reminder surface is available."
        : "- Async reminders: configured, but dormant because no session-visible reminder surface is available in this runtime."
      : "- Async reminders: disabled by config.",
  ];

  return sections.join("\n");
}

export async function standaloneMcpServerExists(): Promise<boolean> {
  try {
    await Promise.all([
      access(standaloneMcpServerEntryPath),
      access(memoryMcpServerPath),
      access(orchestrationMcpToolsPath),
    ]);
    return true;
  } catch {
    return false;
  }
}
