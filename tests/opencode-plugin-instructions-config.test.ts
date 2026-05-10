import type { Config } from "@opencode-ai/plugin";
import { describe, expect, it } from "vitest";

import {
  applyOpenCodePluginInstructionsConfig,
  applyOpenCodePluginInstructionsConfigWithAccess,
} from "../src/features/opencode-plugin/instructions-config-adapter.js";

type InstructionPathAccess = (path: string) => Promise<void>;

function missingPackagedDocsAccess(missingSuffixes: readonly string[]): InstructionPathAccess {
  return async (path: string) => {
    if (missingSuffixes.some((suffix) => path.endsWith(suffix))) {
      throw new Error(`missing packaged doc: ${path}`);
    }
  };
}

describe("applyOpenCodePluginInstructionsConfig", () => {
  it("injects the packaged MCP_USAGE and CONTINUITY_DEBUGGING instruction paths in order", async () => {
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      expect.stringContaining("/MCP_USAGE.md"),
      expect.stringContaining("/CONTINUITY_DEBUGGING.md"),
    ]);
  });

  it("appends the packaged instructions after existing user instructions", async () => {
    const config = {
      instructions: ["/tmp/user-instructions.md"],
    } as Config;

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      "/tmp/user-instructions.md",
      expect.stringContaining("/MCP_USAGE.md"),
      expect.stringContaining("/CONTINUITY_DEBUGGING.md"),
    ]);
  });

  it("does not duplicate the packaged instruction paths", async () => {
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfig(config);
    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      expect.stringContaining("/MCP_USAGE.md"),
      expect.stringContaining("/CONTINUITY_DEBUGGING.md"),
    ]);
  });

  it("does not append packaged instructions when any packaged doc is missing", async () => {
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfigWithAccess(
      config,
      missingPackagedDocsAccess(["/MCP_USAGE.md", "/CONTINUITY_DEBUGGING.md"]),
    );

    expect(config.instructions).toBeUndefined();
  });

  it("does not append packaged instructions when CONTINUITY_DEBUGGING is missing", async () => {
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfigWithAccess(
      config,
      missingPackagedDocsAccess(["/CONTINUITY_DEBUGGING.md"]),
    );

    expect(config.instructions).toBeUndefined();
  });

  it("does not append packaged instructions when MCP_USAGE is missing", async () => {
    const config = {} as Config;

    await applyOpenCodePluginInstructionsConfigWithAccess(
      config,
      missingPackagedDocsAccess(["/MCP_USAGE.md"]),
    );

    expect(config.instructions).toBeUndefined();
  });
});
