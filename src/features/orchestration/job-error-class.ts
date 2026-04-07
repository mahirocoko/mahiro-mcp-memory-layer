import type { CursorWorkerResult } from "../cursor/types.js";
import type { GeminiWorkerResult } from "../gemini/types.js";
import type { OrchestrationJobStatus, WorkerJobResult } from "./types.js";

export type JobErrorClass =
  | "none"
  | "invalid_input"
  | "invalid_json"
  | "invalid_structured_output"
  | "empty_output"
  | "timeout"
  | "infra_failure"
  | "rate_limited"
  | "capacity_exhausted"
  | "safety_blocked"
  | "provider_error";

export function classifyWorkerJobError(result: WorkerJobResult): JobErrorClass {
  if ("result" in result) {
    return classifyErrorClassFromParts(result.result.status, collectResultSignals(result.result));
  }

  return classifyErrorClassFromParts(result.status, result.error);
}

export function classifyJobErrorFromTelemetry(input: {
  readonly status: OrchestrationJobStatus;
  readonly errorClass?: JobErrorClass;
}): JobErrorClass {
  return input.errorClass ?? classifyErrorClassFromParts(input.status);
}

function classifyErrorClassFromParts(status: OrchestrationJobStatus, details?: string): JobErrorClass {
  switch (status) {
    case "completed":
      return "none";
    case "invalid_input":
      return "invalid_input";
    case "invalid_json":
      return "invalid_json";
    case "invalid_structured_output":
      return "invalid_structured_output";
    case "empty_output":
      return "empty_output";
    case "timeout":
      return "timeout";
    case "spawn_error":
    case "runner_failed":
      return "infra_failure";
    case "command_failed":
      return classifyCommandFailure(details);
  }
}

function classifyCommandFailure(details: string | undefined): JobErrorClass {
  const normalized = details?.toLowerCase() ?? "";

  if (matchesAny(normalized, ["model_capacity_exhausted", "capacity exhausted", "no capacity available"])) {
    return "capacity_exhausted";
  }

  if (matchesAny(normalized, ["ratelimit", "rate limit", "rate_limit", "429", "resource_exhausted"])) {
    return "rate_limited";
  }

  if (matchesAny(normalized, ["safety", "harm block", "blocked for safety"])) {
    return "safety_blocked";
  }

  return "provider_error";
}

function collectResultSignals(result: GeminiWorkerResult | CursorWorkerResult): string | undefined {
  return [result.error, result.stderr, result.stdout]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
}

function matchesAny(input: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => input.includes(pattern));
}
