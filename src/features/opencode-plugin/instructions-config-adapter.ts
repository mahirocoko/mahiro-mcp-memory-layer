import { access as accessPackagedInstructionPath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Config } from "@opencode-ai/plugin";

const packagedMcpUsageInstructionPath = fileURLToPath(new URL("../../../MCP_USAGE.md", import.meta.url));
const packagedContinuityDebuggingInstructionPath = fileURLToPath(
  new URL("../../../CONTINUITY_DEBUGGING.md", import.meta.url),
);
const packagedInstructionPaths = [
  packagedMcpUsageInstructionPath,
  packagedContinuityDebuggingInstructionPath,
];

type InstructionPathAccess = (instructionPath: string) => Promise<void>;

export async function applyOpenCodePluginInstructionsConfig(config: Config): Promise<void> {
  await applyOpenCodePluginInstructionsConfigWithAccess(config, accessPackagedInstructionPath);
}

export async function applyOpenCodePluginInstructionsConfigWithAccess(
  config: Config,
  accessInstructionPath: InstructionPathAccess,
): Promise<void> {
  const availablePackagedInstructionPaths = await getAvailablePackagedInstructionPaths(accessInstructionPath);

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

async function getAvailablePackagedInstructionPaths(accessInstructionPath: InstructionPathAccess): Promise<string[]> {
  const availableInstructionPathEntries = await Promise.all(
    packagedInstructionPaths.map(async (instructionPath) => [
      instructionPath,
      await instructionExists(instructionPath, accessInstructionPath),
    ] as const),
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

async function instructionExists(
  instructionPath: string,
  accessInstructionPath: InstructionPathAccess,
): Promise<boolean> {
  try {
    await accessInstructionPath(instructionPath);
    return true;
  } catch {
    return false;
  }
}
