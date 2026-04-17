import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { getAppEnv } from "../../../config/env.js";
import { getEffectiveOrchestrationTraceStatus } from "./effective-orchestration-trace-status.js";
import { classifyWorkerJobError } from "../job-error-class.js";
import type { OrchestrationRunResult } from "../run-orchestration-workflow.js";
import type { OrchestrateWorkflowSpec } from "../workflow-spec.js";
import type { OrchestrationJobModelTelemetry, OrchestrationTraceEntry, WorkerJob, WorkerJobResult } from "../types.js";
import { pruneExpiredOrchestrationTraceEntries } from "./orchestration-retention.js";

export class OrchestrationTraceStore {
  public constructor(private readonly filePath: string) {}

  public async append(entry: OrchestrationTraceEntry): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    await pruneExpiredOrchestrationTraceEntries({
      filePath: this.filePath,
      ttlMs: getAppEnv().orchestrationRetention.ttlMs,
    });
  }
}

interface RunnerFailedTraceOptions {
  readonly requestId: string;
  readonly source: OrchestrationTraceEntry["source"];
  readonly spec: OrchestrateWorkflowSpec;
  readonly error: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

function buildWorkerRuntimes(spec: OrchestrateWorkflowSpec): readonly ("shell" | "mcp")[] | undefined {
  const workerRuntimes = getConcreteJobs(spec)
    .map((job) => job.workerRuntime)
    .filter((runtime): runtime is "shell" | "mcp" => runtime === "shell" || runtime === "mcp");

  return workerRuntimes.length > 0 ? workerRuntimes : undefined;
}

function buildJobModelsFromWorkerResults(
  spec: OrchestrateWorkflowSpec,
  results: readonly WorkerJobResult[],
): readonly OrchestrationJobModelTelemetry[] {
  const jobTelemetryByTaskId = buildJobTelemetryByTaskId(spec);

  return results.map((item) => {
    const configuredTelemetry = jobTelemetryByTaskId.get(item.input.taskId);

    if ("result" in item) {
      const requestedModel = item.result.requestedModel ?? item.input.model;
      const reportedModel = item.result.reportedModel;
      const cached = "cached" in item.result && typeof item.result.cached === "boolean" ? item.result.cached : undefined;
      const cachedTokens = "cachedTokens" in item.result && typeof item.result.cachedTokens === "number"
        ? item.result.cachedTokens
        : undefined;
      return {
        kind: item.kind,
        taskId: item.input.taskId,
        status: item.result.status,
        ...(configuredTelemetry ?? {}),
        retryCount: item.retryCount,
        durationMs: item.result.durationMs,
        ...(cached !== undefined ? { cached } : {}),
        ...(cachedTokens !== undefined ? { cachedTokens } : {}),
        errorClass: classifyWorkerJobError(item),
        requestedModel,
        ...(reportedModel !== undefined ? { reportedModel } : {}),
        ...(configuredTelemetry?.routeReason ? { routeReason: configuredTelemetry.routeReason } : {}),
      };
    }

    return {
      kind: item.kind,
      taskId: item.input.taskId,
      status: item.status,
      ...(configuredTelemetry ?? {}),
      retryCount: item.retryCount,
      errorClass: classifyWorkerJobError(item),
      requestedModel: item.input.model,
    };
  });
}

export function buildOrchestrationTraceEntry(
  requestId: string,
  source: OrchestrationTraceEntry["source"],
  spec: OrchestrateWorkflowSpec,
  result: OrchestrationRunResult,
): OrchestrationTraceEntry {
  const jobModels = buildJobModelsFromWorkerResults(spec, result.results);

  return {
    requestId,
    source,
    ...(buildWorkerRuntimes(spec) ? { workerRuntimes: buildWorkerRuntimes(spec) } : {}),
    mode: spec.mode,
    status: getEffectiveOrchestrationTraceStatus({
      status: result.status,
      failedJobs: result.summary.failedJobs,
      jobModels,
    }),
    maxConcurrency: spec.mode === "parallel" ? spec.maxConcurrency : undefined,
    timeoutMs: spec.timeoutMs,
    jobKinds: result.results.map((job) => job.kind),
    taskIds: result.results.map((job) => job.input.taskId),
    jobModels,
    totalJobs: result.summary.totalJobs,
    finishedJobs: result.summary.finishedJobs,
    completedJobs: result.summary.completedJobs,
    failedJobs: result.summary.failedJobs,
    skippedJobs: result.summary.skippedJobs,
    failedStepIndex: result.mode === "sequential" ? result.failedStepIndex : undefined,
    error: result.mode === "sequential" ? result.error : undefined,
    startedAt: result.summary.startedAt,
    finishedAt: result.summary.finishedAt,
    durationMs: result.summary.durationMs,
    createdAt: new Date().toISOString(),
  };
}

export function buildRunnerFailedOrchestrationTraceEntry(
  options: RunnerFailedTraceOptions,
): OrchestrationTraceEntry {
  const jobs = getConcreteJobs(options.spec);
  const jobTelemetryByTaskId = buildJobTelemetryByTaskId(options.spec);
  const finishedAt = options.finishedAt ?? new Date().toISOString();
  const durationMs = Math.max(Date.parse(finishedAt) - Date.parse(options.startedAt), 0);

  return {
    requestId: options.requestId,
    source: options.source,
    ...(buildWorkerRuntimes(options.spec) ? { workerRuntimes: buildWorkerRuntimes(options.spec) } : {}),
    mode: options.spec.mode,
    status: "runner_failed",
    maxConcurrency: options.spec.mode === "parallel" ? options.spec.maxConcurrency : undefined,
    timeoutMs: options.spec.timeoutMs,
    jobKinds: jobs.map((job) => job.kind),
    taskIds: jobs.map((job) => job.input.taskId),
    jobModels: jobs.map((job) => ({
      kind: job.kind,
      taskId: job.input.taskId,
      status: "runner_failed",
      ...(jobTelemetryByTaskId.get(job.input.taskId) ?? {}),
        retryCount: 0,
        errorClass: "infra_failure",
        requestedModel: job.input.model,
        ...(job.routeReason ? { routeReason: job.routeReason } : {}),
      })),
    totalJobs: jobs.length,
    finishedJobs: 0,
    completedJobs: 0,
    failedJobs: jobs.length,
    skippedJobs: 0,
    error: options.error,
    startedAt: options.startedAt,
    finishedAt,
    durationMs,
    createdAt: finishedAt,
  };
}

function buildJobTelemetryByTaskId(
  spec: OrchestrateWorkflowSpec,
): Map<string, Pick<OrchestrationJobModelTelemetry, "configuredRetries" | "configuredRetryDelayMs" | "routeReason">> {
  return new Map(
    getConcreteJobs(spec).map((job) => [
      job.input.taskId,
      {
        ...(typeof job.retries === "number" ? { configuredRetries: job.retries } : {}),
        ...(typeof job.retryDelayMs === "number" ? { configuredRetryDelayMs: job.retryDelayMs } : {}),
        ...(job.routeReason ? { routeReason: job.routeReason } : {}),
      },
    ]),
  );
}

function getConcreteJobs(spec: OrchestrateWorkflowSpec): readonly WorkerJob[] {
  if (spec.mode === "parallel") {
    return spec.jobs;
  }

  return spec.steps.flatMap((step) => (typeof step === "function" ? [] : [step]));
}
