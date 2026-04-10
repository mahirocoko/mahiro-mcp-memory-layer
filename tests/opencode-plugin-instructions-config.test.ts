import { describe, expect, it } from "vitest";

import { applyOpenCodePluginInstructionsConfig } from "../src/features/opencode-plugin/instructions-config-adapter.js";

describe("applyOpenCodePluginInstructionsConfig", () => {
  it("injects the packaged AGENTS instruction path", async () => {
    const config = {} as Parameters<typeof applyOpenCodePluginInstructionsConfig>[0];

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([expect.stringContaining("/AGENTS.md")]);
  });

  it("appends the packaged AGENTS instruction after existing user instructions", async () => {
    const config = {
      instructions: ["/tmp/user-instructions.md"],
    } as Parameters<typeof applyOpenCodePluginInstructionsConfig>[0];

    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([
      "/tmp/user-instructions.md",
      expect.stringContaining("/AGENTS.md"),
    ]);
  });

  it("does not duplicate the packaged AGENTS instruction path", async () => {
    const config = {} as Parameters<typeof applyOpenCodePluginInstructionsConfig>[0];

    await applyOpenCodePluginInstructionsConfig(config);
    await applyOpenCodePluginInstructionsConfig(config);

    expect(config.instructions).toEqual([expect.stringContaining("/AGENTS.md")]);
  });
});
