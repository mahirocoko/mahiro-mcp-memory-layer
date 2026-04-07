import { stdout } from "node:process";

import { ZodError } from "zod";

import { getAppEnv } from "./config/env.js";
import {
  formatOrchestrationTracesAsDetail,
  formatOrchestrationTracesAsText,
} from "./features/orchestration/format-orchestration-traces.js";
import { listOrchestrationTraces } from "./features/orchestration/observability/list-orchestration-traces.js";
import {
  summarizeOrchestrationTraceUsage,
  type OrchestrationTraceUsageSummary,
} from "./features/orchestration/observability/summarize-orchestration-trace-usage.js";
import { parseListOrchestrationTracesCliArgs } from "./features/orchestration/list-orchestration-traces-cli.js";
import type { OrchestrationTraceEntry } from "./features/orchestration/types.js";

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
    const { format, payload } = parseListOrchestrationTracesCliArgs(process.argv.slice(2));
    const env = getAppEnv();
    const traces = await listOrchestrationTraces({
      payload,
      filePath: env.dataPaths.orchestrationTraceFilePath,
    });

    if (format === "usage") {
      writeJson(summarizeOrchestrationTraceUsage(traces));
      return;
    }

    writeOutput(format, traces);
  } catch (error) {
    const failedAtDate = new Date();

    writeJson({
      status: "invalid_input",
      durationMs: failedAtDate.getTime() - startedAtDate.getTime(),
      startedAt,
      finishedAt: failedAtDate.toISOString(),
      error: formatInputError(error),
    } satisfies InvalidInputResult);

    process.exitCode = 1;
  }
}

function writeJson(
  value: readonly OrchestrationTraceEntry[] | InvalidInputResult | OrchestrationTraceUsageSummary,
): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function writeOutput(
  format: "json" | "text" | "detail",
  value: readonly OrchestrationTraceEntry[],
): void {
  if (format === "detail") {
    stdout.write(`${formatOrchestrationTracesAsDetail(value)}\n`);
    return;
  }

  if (format === "text") {
    stdout.write(`${formatOrchestrationTracesAsText(value)}\n`);
    return;
  }

  writeJson(value);
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
