import { stdout } from "node:process";

import { ZodError } from "zod";

import { parseGeminiCliArgs } from "./features/gemini/gemini-cli.js";
import { runGeminiWorker } from "./features/gemini/gemini-worker-service.js";
import type { GeminiWorkerResult } from "./features/gemini/types.js";

async function main(): Promise<void> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const input = parseGeminiCliArgs(process.argv.slice(2));
    const result = await runGeminiWorker(input);

    writeJson(result);
    if (result.status !== "completed") {
      process.exitCode = 1;
    }
  } catch (error) {
    const failedAtDate = new Date();

    writeJson({
      status: "invalid_input",
      durationMs: failedAtDate.getTime() - startedAtDate.getTime(),
      startedAt,
      finishedAt: failedAtDate.toISOString(),
      error: formatInputError(error),
    } satisfies GeminiWorkerResult);

    process.exitCode = 1;
  }
}

function writeJson(value: GeminiWorkerResult): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function formatInputError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown input error.";
}

void main();
