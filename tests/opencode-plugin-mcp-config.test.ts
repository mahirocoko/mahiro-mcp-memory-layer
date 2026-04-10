import { describe, expect, it } from "vitest";

import { applyOpenCodePluginMcpConfig } from "../src/features/opencode-plugin/mcp-config-adapter.js";

describe("applyOpenCodePluginMcpConfig", () => {
  it("injects the local standalone MCP entry when the plugin runs from a source checkout", async () => {
    const config = {} as Parameters<typeof applyOpenCodePluginMcpConfig>[0];

    await applyOpenCodePluginMcpConfig(config);

    expect(config.mcp).toMatchObject({
      "mahiro-mcp-memory-layer": {
        type: "local",
        command: ["bun", "run", expect.stringContaining("/src/index.ts")],
      },
    });
  });

  it("does not overwrite an existing MCP entry with the same name", async () => {
    const config = {
      mcp: {
        "mahiro-mcp-memory-layer": {
          type: "local",
          command: ["bun", "run", "/tmp/custom-index.ts"],
        },
      },
    } as Parameters<typeof applyOpenCodePluginMcpConfig>[0];

    await applyOpenCodePluginMcpConfig(config);

    expect(config.mcp).toEqual({
      "mahiro-mcp-memory-layer": {
        type: "local",
        command: ["bun", "run", "/tmp/custom-index.ts"],
      },
    });
  });

  it("leaves unrelated existing MCP entries intact when injecting the local fallback", async () => {
    const config = {
      mcp: {
        pencil: {
          type: "local",
          command: ["/Applications/Pencil.app/Contents/MacOS/Pencil"],
        },
      },
    } as Parameters<typeof applyOpenCodePluginMcpConfig>[0];

    await applyOpenCodePluginMcpConfig(config);

    expect(config.mcp).toMatchObject({
      pencil: {
        type: "local",
        command: ["/Applications/Pencil.app/Contents/MacOS/Pencil"],
      },
      "mahiro-mcp-memory-layer": {
        type: "local",
        command: ["bun", "run", expect.stringContaining("/src/index.ts")],
      },
    });
  });
});
