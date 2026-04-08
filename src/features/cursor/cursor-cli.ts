import { newId } from "../../lib/ids.js";

import type { CursorMode, CursorWorkerInput } from "./types.js";

interface CursorCliOptions {
  model?: string;
  cwd?: string;
  timeoutMs?: number;
  binaryPath?: string;
  mode?: CursorMode;
  force?: boolean;
  trust?: boolean;
}

export function parseCursorCliArgs(argv: readonly string[]): CursorWorkerInput {
  const options: CursorCliOptions = {};
  const promptParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (token === "--") {
      promptParts.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("--")) {
      promptParts.push(token);
      continue;
    }

    const nextValue = argv[index + 1];

    switch (token) {
      case "--model":
        options.model = readFlagValue(token, nextValue);
        index += 1;
        break;
      case "--cwd":
        options.cwd = readFlagValue(token, nextValue);
        index += 1;
        break;
      case "--timeout-ms": {
        const timeoutMs = Number.parseInt(readFlagValue(token, nextValue), 10);
        if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
          throw new Error("--timeout-ms must be a positive integer.");
        }

        options.timeoutMs = timeoutMs;
        index += 1;
        break;
      }
      case "--binary-path":
        options.binaryPath = readFlagValue(token, nextValue);
        index += 1;
        break;
      case "--mode":
        options.mode = readMode(readFlagValue(token, nextValue));
        index += 1;
        break;
      case "--force":
        options.force = true;
        break;
      case "--trust":
        options.trust = true;
        break;
      case "--no-trust":
        options.trust = false;
        break;
      default:
        throw new Error(`Unknown flag: ${token}`);
    }
  }

  const prompt = promptParts.join(" ").trim();

  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const model = options.model?.trim();

  if (!model) {
    throw new Error("--model is required.");
  }

  return {
    taskId: newId("cursor"),
    prompt,
    model,
    timeoutMs: options.timeoutMs,
    cwd: options.cwd,
    binaryPath: options.binaryPath,
    mode: options.mode,
    force: options.force,
    trust: options.trust,
  };
}

function readMode(value: string): CursorMode {
  switch (value) {
    case "ask":
    case "plan":
      return value;
    default:
      throw new Error(`Unknown mode: ${value}`);
  }
}

function readFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}
