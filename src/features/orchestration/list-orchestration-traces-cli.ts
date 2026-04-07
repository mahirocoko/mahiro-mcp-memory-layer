import { listOrchestrationTracesInputSchema } from "./schemas.js";
import type { ListOrchestrationTracesInput } from "./types.js";

export type ListOrchestrationTracesCliFormat = "json" | "text" | "detail" | "usage";

export interface ListOrchestrationTracesCliArgs {
  readonly format: ListOrchestrationTracesCliFormat;
  readonly payload: ListOrchestrationTracesInput;
}

export function parseListOrchestrationTracesCliArgs(
  argv: readonly string[],
): ListOrchestrationTracesCliArgs {
  const parsed: Record<string, unknown> = {};
  let format: ListOrchestrationTracesCliFormat = "json";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const nextValue = argv[index + 1];

    switch (token) {
      case "--source":
        parsed.source = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--mode":
        parsed.mode = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--status":
        parsed.status = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--request-id":
        parsed.requestId = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--task-id":
        parsed.taskId = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--from-date":
        parsed.fromDate = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--to-date":
        parsed.toDate = readStringFlagValue(token, nextValue);
        index += 1;
        break;
      case "--limit":
        parsed.limit = readNumberFlagValue(token, nextValue);
        index += 1;
        break;
      case "--format":
        format = readFormatFlagValue(token, nextValue);
        index += 1;
        break;
      default:
        throw new Error(`Unknown flag: ${token}`);
    }
  }

  return {
    format,
    payload: listOrchestrationTracesInputSchema.parse(parsed),
  };
}

function readStringFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readNumberFlagValue(flag: string, value: string | undefined): number {
  const parsed = Number(readStringFlagValue(flag, value));

  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a number.`);
  }

  return parsed;
}

function readFormatFlagValue(
  flag: string,
  value: string | undefined,
): ListOrchestrationTracesCliFormat {
  const parsed = readStringFlagValue(flag, value);

  if (parsed !== "json" && parsed !== "text" && parsed !== "detail" && parsed !== "usage") {
    throw new Error(`${flag} must be one of: json, text, detail, usage.`);
  }

  return parsed;
}
