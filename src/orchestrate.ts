import { stdout } from "node:process";

import { ZodError } from "zod";

import { getAppEnv } from "./config/env.js";
import { dryRunWorkflow, type WorkflowDryRunResult } from "./features/orchestration/dry-run-workflow.js";
import { parseOrchestrateCliArgs } from "./features/orchestration/orchestrate-cli.js";
import { OrchestrationLifecycle } from "./features/orchestration/observability/orchestration-lifecycle.js";
import { OrchestrationResultStore } from "./features/orchestration/observability/orchestration-result-store.js";
import { OrchestrationTraceStore } from "./features/orchestration/observability/orchestration-trace.js";
import { hasOrchestrationFailures, runOrchestrationWorkflow, type OrchestrationRunResult } from "./features/orchestration/run-orchestration-workflow.js";
import { newId } from "./lib/ids.js";

interface InvalidInputResult {
  readonly status: "invalid_input";
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly error: string;
}

interface RunnerFailedResult {
  readonly status: "runner_failed";
  readonly requestId: string;
  readonly error: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

async function main(): Promise<void> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const parsed = await parseOrchestrateCliArgs(process.argv.slice(2));

    if (parsed.dryRun) {
      writeJson(dryRunWorkflow(parsed.spec));
      return;
    }

    const env = getAppEnv();
    const requestId = newId("workflow");
    const traceStore = new OrchestrationTraceStore(env.dataPaths.orchestrationTraceFilePath);
    const resultStore = new OrchestrationResultStore(env.dataPaths.orchestrationResultDirectory);
    const lifecycle = new OrchestrationLifecycle(traceStore, resultStore);

    await lifecycle.markRunning({
      requestId,
      source: "cli",
      spec: parsed.spec,
    });

    try {
      const result = await runOrchestrationWorkflow(parsed.spec, {
        traceStore,
        traceSource: "cli",
        traceRequestId: requestId,
      });

      await lifecycle.markCompleted({
        requestId,
        source: "cli",
        spec: parsed.spec,
        result,
      });

      writeJson(result);
      if (hasOrchestrationFailures(result)) {
        process.exitCode = 1;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date().toISOString();

      await lifecycle.markRunnerFailed({
        requestId,
        source: "cli",
        spec: parsed.spec,
        error: errorMessage,
        startedAt,
      });

      writeJson({
        status: "runner_failed",
        requestId,
        error: errorMessage,
        startedAt,
        finishedAt,
      } satisfies RunnerFailedResult);

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
    } satisfies InvalidInputResult);

    process.exitCode = 1;
  }
}

function writeJson(
  value: OrchestrationRunResult | WorkflowDryRunResult | InvalidInputResult | RunnerFailedResult,
): void {
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
