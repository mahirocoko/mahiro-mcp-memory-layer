import { fileURLToPath } from "node:url";

import type { Config } from "@opencode-ai/plugin";

import {
  standaloneMcpServerExists,
  standaloneMcpServerName,
} from "./runtime-capabilities.js";

const standaloneMcpServerEntryPath = fileURLToPath(new URL("../../index.ts", import.meta.url));

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
