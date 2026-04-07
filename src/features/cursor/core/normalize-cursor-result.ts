import { cursorJsonResponseSchema } from "../schemas.js";
import type { CursorCommandRunResult, CursorJsonResponse, CursorWorkerInput, CursorWorkerResult } from "../types.js";

export function normalizeCursorResult(
  input: CursorWorkerInput,
  commandResult: CursorCommandRunResult,
): CursorWorkerResult {
  const baseResult = {
    taskId: input.taskId,
    mode: input.mode,
    requestedModel: input.model,
    stderr: commandResult.stderr.trim() || undefined,
    stdout: commandResult.stdout,
    exitCode: commandResult.exitCode,
    signal: commandResult.signal,
    durationMs: commandResult.durationMs,
    startedAt: commandResult.startedAt,
    finishedAt: commandResult.finishedAt,
  } satisfies Omit<CursorWorkerResult, "status">;

  if (commandResult.timedOut) {
    return {
      ...baseResult,
      status: "timeout",
      error: `Cursor command timed out after ${input.timeoutMs}ms.`,
    };
  }

  if (commandResult.spawnError) {
    return {
      ...baseResult,
      status: "spawn_error",
      error: commandResult.spawnError,
    };
  }

  const trimmedStdout = commandResult.stdout.trim();

  if (!trimmedStdout) {
    return {
      ...baseResult,
      status: "empty_output",
      error: commandResult.stderr.trim() || (commandResult.exitCode === 0 ? "Cursor returned no stdout." : "Cursor failed without stdout."),
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(trimmedStdout);
  } catch (error) {
    return {
      ...baseResult,
      status: "invalid_json",
      error: error instanceof Error ? error.message : "Failed to parse Cursor JSON output.",
    };
  }

  const rawResult = cursorJsonResponseSchema.safeParse(parsedJson);

  if (!rawResult.success) {
    return {
      ...baseResult,
      status: "invalid_json",
      error: rawResult.error.issues.map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`).join("; "),
    };
  }

  const raw = rawResult.data;
  const response = readCursorResponse(raw);
  const reportedModel = typeof raw.model === "string" ? raw.model : undefined;

  if (commandResult.exitCode !== 0 || raw.is_error === true) {
    return {
      ...baseResult,
      status: "command_failed",
      reportedModel,
      response,
      raw,
      error: commandResult.stderr.trim() || readCursorError(raw),
    };
  }

  return {
    ...baseResult,
    status: "completed",
    reportedModel,
    response,
    raw,
    error: commandResult.stderr.trim() || readCursorError(raw),
  };
}

function readCursorResponse(raw: CursorJsonResponse): string | undefined {
  if (typeof raw.result === "string") {
    return raw.result;
  }

  if (raw.result !== undefined) {
    return JSON.stringify(raw.result);
  }

  return undefined;
}

function readCursorError(raw: CursorJsonResponse): string | undefined {
  const errorValue = raw.error;

  if (typeof errorValue === "string") {
    return errorValue;
  }

  if (errorValue && typeof errorValue === "object") {
    return JSON.stringify(errorValue);
  }

  return undefined;
}
