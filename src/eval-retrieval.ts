import { stdout } from "node:process";

import { parseRetrievalEvalCliArgs } from "./features/memory/eval/retrieval-eval-cli.js";
import { formatRetrievalEvalAsText, runRetrievalEval } from "./features/memory/eval/retrieval-eval.js";

interface InvalidInputResult {
  readonly status: "invalid_input";
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly error: string;
}

async function main(): Promise<void> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const { format } = parseRetrievalEvalCliArgs(process.argv.slice(2));
    const result = await runRetrievalEval();

    if (format === "text") {
      stdout.write(formatRetrievalEvalAsText(result));
    } else {
      stdout.write(`${JSON.stringify(result)}\n`);
    }

    if (!result.summary.overallPass) {
      process.exitCode = 1;
    }
  } catch (error) {
    const failedAtDate = new Date();

    stdout.write(
      `${JSON.stringify({
        status: "invalid_input",
        durationMs: failedAtDate.getTime() - startedAtDate.getTime(),
        startedAt,
        finishedAt: failedAtDate.toISOString(),
        error: formatInputError(error),
      } satisfies InvalidInputResult)}\n`,
    );

    process.exitCode = 1;
  }
}

function formatInputError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown input error.";
}

void main();
