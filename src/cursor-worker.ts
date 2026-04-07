import { stdin, stdout } from "node:process";

import { ZodError } from "zod";

import { cursorWorkerInputSchema } from "./features/cursor/schemas.js";
import { runCursorWorker } from "./features/cursor/cursor-worker-service.js";
import type { CursorWorkerResult } from "./features/cursor/types.js";

async function main(): Promise<void> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const inputText = await readStdin();
    const inputJson = JSON.parse(inputText) as unknown;
    const input = cursorWorkerInputSchema.parse(inputJson);
    const result = await runCursorWorker(input);

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
    } satisfies CursorWorkerResult);

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

function writeJson(value: CursorWorkerResult): void {
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
