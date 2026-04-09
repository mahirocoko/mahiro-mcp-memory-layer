import { describe, expect, it } from "vitest";

import {
  defaultOpenCodePluginMessageDebounceMs,
  getOpenCodePluginConfig,
  opencodePluginConfigEnv,
} from "../src/features/opencode-plugin/config.js";

describe("getOpenCodePluginConfig", () => {
  it("returns plugin-first defaults without requiring manual MCP config", () => {
    expect(getOpenCodePluginConfig({})).toEqual({
      packageName: "mahiro-mcp-memory-layer",
      install: {
        opencodeConfigField: "plugin",
        defaultPluginEntry: "mahiro-mcp-memory-layer",
        requiresManualMcpConfig: false,
        advancedOverrideChannel: "environment_variables",
      },
      runtime: {
        messageDebounceMs: defaultOpenCodePluginMessageDebounceMs,
      },
      env: {
        messageDebounceMs: opencodePluginConfigEnv.messageDebounceMs,
      },
    });
  });

  it("parses message debounce overrides from environment variables", () => {
    expect(
      getOpenCodePluginConfig({
        [opencodePluginConfigEnv.messageDebounceMs]: "40",
      }).runtime.messageDebounceMs,
    ).toBe(40);
  });

  it("falls back to defaults when the environment override is invalid", () => {
    expect(
      getOpenCodePluginConfig({
        [opencodePluginConfigEnv.messageDebounceMs]: "  ",
      }).runtime.messageDebounceMs,
    ).toBe(defaultOpenCodePluginMessageDebounceMs);

    expect(
      getOpenCodePluginConfig({
        [opencodePluginConfigEnv.messageDebounceMs]: "fast",
      }).runtime.messageDebounceMs,
    ).toBe(defaultOpenCodePluginMessageDebounceMs);

    expect(
      getOpenCodePluginConfig({
        [opencodePluginConfigEnv.messageDebounceMs]: "-5",
      }).runtime.messageDebounceMs,
    ).toBe(defaultOpenCodePluginMessageDebounceMs);
  });
});
