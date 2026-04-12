import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Config } from "@opencode-ai/plugin";

const packagedMcpUsageInstructionPath = fileURLToPath(new URL("../../../MCP_USAGE.md", import.meta.url));
const packagedOrchestrationInstructionPath = fileURLToPath(new URL("../../../ORCHESTRATION.md", import.meta.url));
const packagedInstructionPaths = [packagedMcpUsageInstructionPath, packagedOrchestrationInstructionPath];

export async function applyOpenCodePluginInstructionsConfig(config: Config): Promise<void> {
  const availablePackagedInstructionPaths = await getAvailablePackagedInstructionPaths();

  if (availablePackagedInstructionPaths.length === 0) {
    return;
  }

  const currentInstructions = Array.isArray(config.instructions)
    ? [...config.instructions]
    : [];
  const appendedInstructionPaths = availablePackagedInstructionPaths.filter(
    (instructionPath) => !currentInstructions.includes(instructionPath),
  );

  if (appendedInstructionPaths.length === 0) {
    return;
  }

  config.instructions = [...currentInstructions, ...appendedInstructionPaths];
}

async function getAvailablePackagedInstructionPaths(): Promise<string[]> {
  const availableInstructionPathEntries = await Promise.all(
    packagedInstructionPaths.map(async (instructionPath) => [instructionPath, await instructionExists(instructionPath)] as const),
  );
  const hasCompleteInstructionPair = availableInstructionPathEntries.every(([, exists]) => exists);

  if (!hasCompleteInstructionPair) {
    return [];
  }

  return availableInstructionPathEntries
    .filter(([, exists]) => {
      if (!exists) {
        return false;
      }

      return true;
    })
    .map(([instructionPath]) => instructionPath);
}

async function instructionExists(instructionPath: string): Promise<boolean> {
  try {
    await access(instructionPath);
    return true;
  } catch {
    return false;
  }
}
