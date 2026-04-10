import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Config } from "@opencode-ai/plugin";

const packagedAgentsInstructionPath = fileURLToPath(new URL("../../../AGENTS.md", import.meta.url));

export async function applyOpenCodePluginInstructionsConfig(config: Config): Promise<void> {
  if (!(await packagedAgentsInstructionExists())) {
    return;
  }

  const currentInstructions = Array.isArray(config.instructions)
    ? [...config.instructions]
    : [];

  if (currentInstructions.includes(packagedAgentsInstructionPath)) {
    return;
  }

  config.instructions = [...currentInstructions, packagedAgentsInstructionPath];
}

async function packagedAgentsInstructionExists(): Promise<boolean> {
  try {
    await access(packagedAgentsInstructionPath);
    return true;
  } catch {
    return false;
  }
}
