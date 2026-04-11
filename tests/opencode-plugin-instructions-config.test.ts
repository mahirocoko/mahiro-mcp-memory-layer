import type { Config } from "@opencode-ai/plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

const instructionsConfigAdapterModulePath = "../src/features/opencode-plugin/instructions-config-adapter.js";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("node:fs/promises");
});

async function loadApplyOpenCodePluginInstructionsConfig() {
  const module = await import(instructionsConfigAdapterModulePath);

  return module.applyOpenCodePluginInstructionsConfig;
}

describe("applyOpenCodePluginInstructionsConfig", () => {
  it("injects the packaged AGENTS and ORCHESTRATION instruction paths in order", async () => {
    const applyOpenCodePluginInstructionsConfig = await loadApplyOpenCodePluginInstructionsConfig();
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      expect.stringContaining("/AGENTS.md"),
      expect.stringContaining("/ORCHESTRATION.md"),
    ]);
  });

  it("appends the packaged instructions after existing user instructions", async () => {
    const applyOpenCodePluginInstructionsConfig = await loadApplyOpenCodePluginInstructionsConfig();
    const config = {
      instructions: ["/tmp/user-instructions.md"],
    } as Config;

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      "/tmp/user-instructions.md",
      expect.stringContaining("/AGENTS.md"),
      expect.stringContaining("/ORCHESTRATION.md"),
    ]);
  });

  it("does not duplicate the packaged instruction paths", async () => {
    const applyOpenCodePluginInstructionsConfig = await loadApplyOpenCodePluginInstructionsConfig();
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfig(config);
    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      expect.stringContaining("/AGENTS.md"),
      expect.stringContaining("/ORCHESTRATION.md"),
    ]);
  });

  it("does not append ORCHESTRATION when AGENTS is missing", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: async (path: string) => {
        if (path.endsWith("/AGENTS.md")) {
          throw new Error("missing AGENTS");
        }
      },
    }));

    const applyOpenCodePluginInstructionsConfig = await loadApplyOpenCodePluginInstructionsConfig();
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toBeUndefined();
  });

  it("appends AGENTS when ORCHESTRATION is missing", async () => {
    vi.doMock("node:fs/promises", () => ({
      access: async (path: string) => {
        if (path.endsWith("/ORCHESTRATION.md")) {
          throw new Error("missing ORCHESTRATION");
        }
      },
    }));

    const applyOpenCodePluginInstructionsConfig = await loadApplyOpenCodePluginInstructionsConfig();
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([expect.stringContaining("/AGENTS.md")]);
  });

});
