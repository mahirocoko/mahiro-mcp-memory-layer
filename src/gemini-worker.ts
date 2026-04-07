import { stdin, stdout } from "node:process";

import { ZodError } from "zod";

import { geminiWorkerInputSchema } from "./features/gemini/schemas.js";
import { runGeminiWorker } from "./features/gemini/gemini-worker-service.js";
import type { GeminiWorkerResult } from "./features/gemini/types.js";

async function main(): Promise<void> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const inputText = await readStdin();
    const inputJson = JSON.parse(inputText) as unknown;
    const input = geminiWorkerInputSchema.parse(inputJson);
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
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
