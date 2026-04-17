import { spawn } from "node:child_process";

export interface RuntimeModelInventorySnapshot {
  readonly source: "live" | "cache" | "static";
  readonly fetchedAt: string;
  readonly cursor: {
    readonly models: readonly string[];
    readonly modes: readonly string[];
    readonly supportsPrint: boolean;
    readonly supportsCloud: boolean;
    readonly supportsAcp: boolean;
  };
}

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly spawnError?: string;
}

interface RuntimeModelInventoryOptions {
  readonly binaryPath?: string;
  readonly commandRunner?: (command: string, args: readonly string[]) => Promise<CommandResult>;
  readonly now?: () => Date;
}

const staticRuntimeModelInventorySnapshot: RuntimeModelInventorySnapshot = {
  source: "static",
  fetchedAt: "1970-01-01T00:00:00.000Z",
  cursor: {
    models: [
      "composer-2",
      "claude-opus-4-7-high",
      "claude-opus-4-7-thinking-high",
      "claude-4.6-sonnet-medium",
      "claude-4.6-opus-high",
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
    modes: ["agent", "plan", "ask", "print", "cloud", "acp"],
    supportsPrint: true,
    supportsCloud: true,
    supportsAcp: true,
  },
};

let cachedRuntimeModelInventorySnapshot: RuntimeModelInventorySnapshot | null = null;

export async function loadRuntimeModelInventory(
  options: RuntimeModelInventoryOptions = {},
): Promise<RuntimeModelInventorySnapshot> {
  const command = options.binaryPath ?? "agent";
  const runCommand = options.commandRunner ?? spawnRuntimeInventoryCommand;
  const now = options.now ?? (() => new Date());

  try {
    const [helpResult, modelsResult] = await Promise.all([
      runCommand(command, ["--help"]),
      runCommand(command, ["models"]),
    ]);

    if (helpResult.exitCode !== 0 || modelsResult.exitCode !== 0 || helpResult.spawnError || modelsResult.spawnError) {
      throw new Error("Cursor runtime inventory discovery failed.");
    }

    const helpInventory = parseAgentHelpOutput(helpResult.stdout);
    const models = parseAgentModelsOutput(modelsResult.stdout);
    const snapshot: RuntimeModelInventorySnapshot = {
      source: "live",
      fetchedAt: now().toISOString(),
      cursor: {
        models,
        modes: helpInventory.modes,
        supportsPrint: helpInventory.supportsPrint,
        supportsCloud: helpInventory.supportsCloud,
        supportsAcp: helpInventory.supportsAcp,
      },
    };

    cachedRuntimeModelInventorySnapshot = snapshot;
    return snapshot;
  } catch {
    if (cachedRuntimeModelInventorySnapshot) {
      return {
        ...cachedRuntimeModelInventorySnapshot,
        source: "cache",
      };
    }

    return staticRuntimeModelInventorySnapshot;
  }
}

export function parseAgentModelsOutput(rawOutput: string): string[] {
  return stripAnsi(rawOutput)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("Loading models"))
    .filter((line) => !line.startsWith("Available models"))
    .filter((line) => !line.startsWith("Tip:"))
    .map((line) => line.split(" - ")[0]?.trim())
    .filter((line): line is string => Boolean(line));
}

export function parseAgentHelpOutput(rawOutput: string): {
  readonly modes: string[];
  readonly supportsPrint: boolean;
  readonly supportsCloud: boolean;
  readonly supportsAcp: boolean;
} {
  const output = stripAnsi(rawOutput);
  const modes = ["agent"];

  if (output.includes('--mode <mode>') || output.includes('--plan')) {
    modes.push("plan", "ask");
  }

  const supportsPrint = output.includes('--print') || output.includes('-p, --print');
  if (supportsPrint) {
    modes.push("print");
  }

  const supportsCloud = output.includes('--cloud') || output.includes('-c, --cloud');
  if (supportsCloud) {
    modes.push("cloud");
  }

  const supportsAcp = output.includes('agent acp') || output.includes('acp');
  if (supportsAcp) {
    modes.push("acp");
  }

  return {
    modes: Array.from(new Set(modes)),
    supportsPrint,
    supportsCloud,
    supportsAcp,
  };
}

export function resetRuntimeModelInventoryCacheForTests(): void {
  cachedRuntimeModelInventorySnapshot = null;
}

async function spawnRuntimeInventoryCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        stdout,
        stderr,
        exitCode: null,
        spawnError: error.message,
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}
