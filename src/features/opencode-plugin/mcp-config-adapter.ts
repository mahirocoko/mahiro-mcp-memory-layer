import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Config } from "@opencode-ai/plugin";

const standaloneMcpServerEntryPath = fileURLToPath(new URL("../../index.ts", import.meta.url));
const memoryMcpServerPath = fileURLToPath(new URL("../memory/mcp/server.ts", import.meta.url));
const orchestrationMcpToolsPath = fileURLToPath(new URL("../orchestration/mcp/register-tools.ts", import.meta.url));
const standaloneMcpServerName = "mahiro-mcp-memory-layer";

export async function applyOpenCodePluginMcpConfig(config: Config): Promise<void> {
  // This fallback is intentionally source-checkout-only in practice: the standalone server
  // and MCP implementation files exist in local source trees, but the published plugin package
  // does not ship them.
  if (!(await standaloneMcpServerExists())) {
    return;
  }

  const currentMcpConfig = (config.mcp ?? {}) as Record<string, unknown>;

  if (currentMcpConfig[standaloneMcpServerName]) {
    return;
  }

  config.mcp = {
    ...currentMcpConfig,
    [standaloneMcpServerName]: {
      type: "local",
      command: ["bun", "run", standaloneMcpServerEntryPath],
    },
  };
}

async function standaloneMcpServerExists(): Promise<boolean> {
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
