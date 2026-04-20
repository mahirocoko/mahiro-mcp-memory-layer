import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { OrchestrationRunResult } from "../run-orchestration-workflow.js";
import type { OrchestrateWorkflowSpec, WorkflowJob } from "../workflow-spec.js";

type TraceSource = "cli" | "mcp";

function classifyError(jobResult: OrchestrationRunResult["results"][number]): string {
  if ("status" in jobResult) {
    return "infra_failure";
  }
  if (jobResult.result.status === "timeout") {
    return "timeout";
  }
  if (jobResult.result.status === "failed") {
    return "worker_failure";
  }
  return "none";
}

function jobRuntime(job: WorkflowJob): string | undefined {
  return job.workerRuntime;
}

export function buildOrchestrationTraceEntry(requestId: string, source: TraceSource, spec: OrchestrateWorkflowSpec, result: OrchestrationRunResult) {
  const jobs = spec.mode === "parallel" ? spec.jobs : spec.steps;
  const workerRuntimes = [...new Set(jobs.map(jobRuntime).filter((value): value is string => Boolean(value)))];
  const normalizedStatus = result.status === "completed" && result.results.some((item) => "result" in item && item.result.status === "timeout")
    ? "timed_out"
    : result.status;
  return {
    requestId,
    source,
    mode: spec.mode,
    status: normalizedStatus,
    jobKinds: jobs.map((job) => job.kind),
    taskIds: jobs.map((job) => job.input.taskId),
    ...(workerRuntimes.length > 0 ? { workerRuntimes } : {}),
    ...result.summary,
    jobModels: result.results.map((item, index) => {
      const specJob = jobs[index];
      const base = {
        kind: item.kind,
        taskId: item.input.taskId,
        status: "result" in item ? item.result.status === "timeout" ? "timeout" : item.result.status : item.status,
        configuredRetries: specJob?.retries ?? 0,
        configuredRetryDelayMs: specJob?.retryDelayMs,
        retryCount: item.retryCount,
        errorClass: classifyError(item),
        requestedModel: item.input.model,
        ...(typeof item.input.subagentId === "string" ? { subagentId: item.input.subagentId } : {}),
      };
      if ("result" in item) {
        const geminiDetails = "cached" in item.result ? item.result : undefined;
        return {
          ...base,
          ...(item.result.sessionName ? { sessionName: item.result.sessionName } : {}),
          ...(item.result.paneId ? { paneId: item.result.paneId } : {}),
          ...(item.result.reportedModel ? { reportedModel: item.result.reportedModel } : {}),
          ...(item.result.durationMs !== undefined ? { durationMs: item.result.durationMs } : {}),
          ...(geminiDetails?.cached !== undefined ? { cached: geminiDetails.cached } : {}),
          ...(geminiDetails?.cachedTokens !== undefined ? { cachedTokens: geminiDetails.cachedTokens } : {}),
        };
      }
      return base;
    }),
  };
}

export function buildRunnerFailedOrchestrationTraceEntry(input: {
  readonly requestId: string;
  readonly source: TraceSource;
  readonly spec: OrchestrateWorkflowSpec;
  readonly error: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}) {
  const jobs = input.spec.mode === "parallel" ? input.spec.jobs : input.spec.steps;
  return {
    requestId: input.requestId,
    source: input.source,
    mode: input.spec.mode,
    status: "runner_failed",
    jobKinds: jobs.map((job) => job.kind),
    taskIds: jobs.map((job) => job.input.taskId),
    totalJobs: jobs.length,
    finishedJobs: 0,
    completedJobs: 0,
    failedJobs: 1,
    skippedJobs: 0,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: Math.max(0, new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()),
    error: input.error,
    jobModels: jobs.map((job) => ({
      kind: job.kind,
      taskId: job.input.taskId,
      status: "runner_failed",
      configuredRetries: job.retries ?? 0,
      ...(job.retryDelayMs !== undefined ? { configuredRetryDelayMs: job.retryDelayMs } : {}),
      retryCount: 0,
      errorClass: "infra_failure",
      requestedModel: job.input.model,
      ...(typeof job.input.subagentId === "string" ? { subagentId: job.input.subagentId } : {}),
    })),
  };
}

export class OrchestrationTraceStore {
  public constructor(private readonly filePath: string) {}

  public async append(entry: unknown): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
