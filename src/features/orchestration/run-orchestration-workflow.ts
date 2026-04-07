import { runParallelWorkers } from "./run-parallel-workers.js";
import { buildOrchestrationTraceEntry, type OrchestrationTraceStore } from "./observability/orchestration-trace.js";
import { interpolateWorkerJob } from "./resolve-workflow-templates.js";
import { runSequentialWorkers } from "./run-sequential-workers.js";
import type { JobCompleteEvent, WorkerJobResult } from "./types.js";
import type { OrchestrateWorkflowSpec } from "./workflow-spec.js";

export interface OrchestrationRunSummary {
  readonly totalJobs: number;
  readonly finishedJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly skippedJobs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

export interface RunOrchestrationWorkflowOptions {
  readonly traceStore?: Pick<OrchestrationTraceStore, "append">;
  readonly traceSource?: "cli" | "mcp";
  readonly traceRequestId?: string;
  readonly onJobComplete?: (event: JobCompleteEvent) => Promise<void> | void;
}

export type OrchestrationRunResult =
  | {
      readonly requestId?: string;
      readonly mode: "parallel";
      readonly status: "completed" | "timed_out";
      readonly results: readonly WorkerJobResult[];
      readonly summary: OrchestrationRunSummary;
    }
  | {
      readonly requestId?: string;
      readonly mode: "sequential";
      readonly status: "completed" | "step_failed" | "timed_out";
      readonly results: readonly WorkerJobResult[];
      readonly failedStepIndex?: number;
      readonly error?: string;
      readonly summary: OrchestrationRunSummary;
    };

export async function runOrchestrationWorkflow(
  spec: OrchestrateWorkflowSpec,
  options: RunOrchestrationWorkflowOptions = {},
): Promise<OrchestrationRunResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  if (spec.mode === "parallel") {
    const parallelRun = await runParallelWorkers(spec.jobs, {
      maxConcurrency: spec.maxConcurrency,
      timeoutMs: spec.timeoutMs,
      onJobComplete: options.onJobComplete,
    });

    const result: OrchestrationRunResult = {
      requestId: options.traceRequestId,
      mode: spec.mode,
      status: parallelRun.timedOut ? "timed_out" : "completed",
      results: parallelRun.results,
      summary: buildRunSummary(spec.jobs.length, parallelRun.results, startedAtDate, startedAt),
    };

    await appendTraceIfNeeded(spec, result, options);
    return result;
  }

  const sequentialRun = await runSequentialWorkers(
    spec.steps.map((step) => {
      if (typeof step !== "function") {
        return (context) => interpolateWorkerJob(step, context);
      }

      return (context) => {
        const resolved = step(context);

        if (resolved === null) {
          return null;
        }

        return interpolateWorkerJob(resolved, context);
      };
    }),
    {
      timeoutMs: spec.timeoutMs,
      onJobComplete: options.onJobComplete,
    },
  );

  const result: OrchestrationRunResult = {
    requestId: options.traceRequestId,
    mode: spec.mode,
    ...sequentialRun,
    summary: buildRunSummary(spec.steps.length, sequentialRun.results, startedAtDate, startedAt),
  };

  await appendTraceIfNeeded(spec, result, options);
  return result;
}

export function hasOrchestrationFailures(result: OrchestrationRunResult): boolean {
  if (result.status !== "completed") {
    return true;
  }

  return result.results.some((item) => {
    if ("result" in item) {
      return item.result.status !== "completed";
    }

    return true;
  });
}

function buildRunSummary(
  totalJobs: number,
  results: readonly WorkerJobResult[],
  startedAtDate: Date,
  startedAt: string,
): OrchestrationRunSummary {
  const finishedAtDate = new Date();
  const completedJobs = results.filter((item) => "result" in item && item.result.status === "completed").length;
  const finishedJobs = results.length;
  const failedJobs = results.filter((item) => !("result" in item) || item.result.status !== "completed").length;

  return {
    totalJobs,
    finishedJobs,
    completedJobs,
    failedJobs,
    skippedJobs: Math.max(totalJobs - finishedJobs, 0),
    startedAt,
    finishedAt: finishedAtDate.toISOString(),
    durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
  };
}

async function appendTraceIfNeeded(
  spec: OrchestrateWorkflowSpec,
  result: OrchestrationRunResult,
  options: RunOrchestrationWorkflowOptions,
): Promise<void> {
  if (!options.traceStore || !options.traceSource || !options.traceRequestId) {
    return;
  }

  await options.traceStore.append(
    buildOrchestrationTraceEntry(options.traceRequestId, options.traceSource, spec, result),
  );
}
