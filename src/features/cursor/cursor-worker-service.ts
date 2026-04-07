import { ZodError } from "zod";

import { normalizeCursorResult } from "./core/normalize-cursor-result.js";
import { runCursorCommand } from "./core/run-cursor-command.js";
import { cursorWorkerInputSchema } from "./schemas.js";
import type { CursorCommandRunResult, CursorWorkerInput, CursorWorkerResult } from "./types.js";

export interface RunCursorWorkerDependencies {
  readonly runCommand?: (input: CursorWorkerInput) => Promise<CursorCommandRunResult>;
}

export async function runCursorWorker(
  input: CursorWorkerInput,
  dependencies: RunCursorWorkerDependencies = {},
): Promise<CursorWorkerResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    cursorWorkerInputSchema.parse(input);
  } catch (error) {
    const failedAtDate = new Date();
    return {
      status: "invalid_input",
      durationMs: failedAtDate.getTime() - startedAtDate.getTime(),
      startedAt,
      finishedAt: failedAtDate.toISOString(),
      error: formatZodError(error),
    };
  }

  const runCommand = dependencies.runCommand ?? runCursorCommand;
  const commandResult = await runCommand(input);
  return normalizeCursorResult(input, commandResult);
}

function formatZodError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown input error.";
}
