import { describe, expect, it, vi } from "vitest";

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

  it("does not inject MCP config when the standalone source artifacts are unavailable", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      access: vi.fn(async () => {
        throw new Error("missing source artifact");
      }),
    }));

    try {
      const { applyOpenCodePluginMcpConfig: applyWithoutArtifacts } = await import(
        "../src/features/opencode-plugin/mcp-config-adapter.js"
      );
      const config = {} as Parameters<typeof applyWithoutArtifacts>[0];

      await applyWithoutArtifacts(config);

      expect(config.mcp).toBeUndefined();
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});
