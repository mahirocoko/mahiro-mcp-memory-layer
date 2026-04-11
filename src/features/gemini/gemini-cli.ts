import { newId } from "../../lib/ids.js";

import type { GeminiWorkerInput } from "./types.js";

interface GeminiCliOptions {
  model?: string;
  cwd?: string;
  timeoutMs?: number;
  binaryPath?: string;
  taskKind?: GeminiWorkerInput["taskKind"];
  approvalMode?: GeminiWorkerInput["approvalMode"];
  allowedMcpServerNames?: GeminiWorkerInput["allowedMcpServerNames"];
}

export function parseGeminiCliArgs(argv: readonly string[]): GeminiWorkerInput {
  const options: GeminiCliOptions = {};
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
      case "--task":
        options.taskKind = readTaskKind(readFlagValue(token, nextValue));
        index += 1;
        break;
      case "--approval-mode":
        options.approvalMode = readApprovalMode(readFlagValue(token, nextValue));
        index += 1;
        break;
      case "--allowed-mcp-server-names":
        options.allowedMcpServerNames = readAllowedMcpServerNames(readFlagValue(token, nextValue));
        index += 1;
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
    taskId: newId("gemini"),
    prompt,
    model,
    timeoutMs: options.timeoutMs,
    cwd: options.cwd,
    binaryPath: options.binaryPath,
    taskKind: options.taskKind,
    approvalMode: options.approvalMode,
    allowedMcpServerNames: options.allowedMcpServerNames,
  };
}

function readApprovalMode(value: string): GeminiWorkerInput["approvalMode"] {
  switch (value) {
    case "default":
    case "auto_edit":
    case "yolo":
    case "plan":
      return value;
    default:
      throw new Error(`Unknown approval mode: ${value}`);
  }
}

function readAllowedMcpServerNames(value: string): GeminiWorkerInput["allowedMcpServerNames"] {
  const trimmedValue = value.trim();

  if (trimmedValue === "none") {
    return "none";
  }

  const serverNames = trimmedValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (serverNames.length === 0) {
    throw new Error("--allowed-mcp-server-names must include at least one server name or 'none'.");
  }

  if (serverNames.some((item) => item === "none")) {
    throw new Error("--allowed-mcp-server-names cannot mix 'none' with named MCP servers.");
  }

  return serverNames as [string, ...string[]];
}

function readTaskKind(value: string): GeminiWorkerInput["taskKind"] {
  switch (value) {
    case "general":
    case "summarize":
    case "timeline":
    case "extract-facts":
      return value;
    default:
      throw new Error(`Unknown task kind: ${value}`);
  }
}

function readFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}
