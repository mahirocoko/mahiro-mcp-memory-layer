import { classifyJobErrorFromTelemetry } from "../job-error-class.js";
import { normalizeOrchestrationTraceEntry } from "./effective-orchestration-trace-status.js";
import type { OrchestrationJobStatus, OrchestrationTraceEntry } from "../types.js";

export interface OrchestrationTraceDaySummary {
  readonly traceCount: number;
  readonly jobCount: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
}

interface MutableOrchestrationTraceDaySummary {
  traceCount: number;
  jobCount: number;
  completedJobs: number;
  failedJobs: number;
}

export interface OrchestrationOutcomeSummary {
  readonly completed: number;
  readonly failed: number;
  readonly successRate: number;
}

export interface OrchestrationRetrySummary {
  readonly totalRetries: number;
  readonly retriedJobs: number;
  readonly avgRetriesPerJob: number;
}

export interface OrchestrationDurationSummary {
  readonly totalDurationMs: number;
  readonly avgDurationMs: number;
  readonly p50DurationMs: number;
  readonly p95DurationMs: number;
}

export interface OrchestrationCacheSummary {
  readonly cachedJobs: number;
  readonly uncachedJobs: number;
  readonly cacheHitRate: number;
  readonly totalCachedTokens: number;
}

export interface OrchestrationModelMismatchSummary {
  readonly comparableJobs: number;
  readonly modelMismatchCount: number;
  readonly modelMismatchRate: number;
}

export interface OrchestrationModelOutcomeSummary {
  readonly jobCount: number;
  readonly completed: number;
  readonly failed: number;
  readonly successRate: number;
  readonly totalRetries: number;
  readonly avgRetriesPerJob: number;
  readonly totalDurationMs: number;
  readonly avgDurationMs: number;
  readonly p50DurationMs: number;
  readonly p95DurationMs: number;
  readonly cachedJobs: number;
  readonly uncachedJobs: number;
  readonly cacheHitRate: number;
  readonly totalCachedTokens: number;
  readonly byErrorClass: Readonly<Record<string, number>>;
}

export interface OrchestrationTraceUsageSummary {
  readonly traceCount: number;
  readonly jobCount: number;
  readonly byWorkerKind: Readonly<Record<string, number>>;
  readonly byRequestedModel: Readonly<Record<string, number>>;
  readonly byReportedModel: Readonly<Record<string, number>>;
  readonly bySource: Readonly<Record<string, number>>;
  readonly byWorkflowStatus: Readonly<Record<string, number>>;
  readonly byJobStatus: Readonly<Record<string, number>>;
  readonly byErrorClass: Readonly<Record<string, number>>;
  readonly bySourceErrorClass: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly byDay: Readonly<Record<string, OrchestrationTraceDaySummary>>;
  readonly workflowOutcome: OrchestrationOutcomeSummary;
  readonly jobOutcome: OrchestrationOutcomeSummary;
  readonly retryOutcome: OrchestrationRetrySummary;
  readonly durationOutcome: OrchestrationDurationSummary;
  readonly cacheOutcome: OrchestrationCacheSummary;
  readonly modelMismatchOutcome: OrchestrationModelMismatchSummary;
  readonly byRequestedModelOutcome: Readonly<Record<string, OrchestrationModelOutcomeSummary>>;
  readonly byReportedModelOutcome: Readonly<Record<string, OrchestrationModelOutcomeSummary>>;
}

interface MutableModelOutcomeSummary {
  jobCount: number;
  completed: number;
  failed: number;
  totalRetries: number;
  totalDurationMs: number;
  cachedJobs: number;
  uncachedJobs: number;
  totalCachedTokens: number;
  byErrorClass: Record<string, number>;
  durationValues: number[];
}

/**
 * Aggregates worker/model counts from persisted orchestration traces.
 * Entries without `jobModels` still contribute `byWorkerKind` via `jobKinds`.
 */
export function summarizeOrchestrationTraceUsage(
  traces: readonly OrchestrationTraceEntry[],
): OrchestrationTraceUsageSummary {
  const byWorkerKind: Record<string, number> = {};
  const byRequestedModel: Record<string, number> = {};
  const byReportedModel: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byWorkflowStatus: Record<string, number> = {};
  const byJobStatus: Record<string, number> = {};
  const byErrorClass: Record<string, number> = {};
  const bySourceErrorClass: Record<string, Record<string, number>> = {};
  const byDay: Record<string, MutableOrchestrationTraceDaySummary> = {};
  const byRequestedModelOutcome: Record<string, MutableModelOutcomeSummary> = {};
  const byReportedModelOutcome: Record<string, MutableModelOutcomeSummary> = {};
  let jobCount = 0;
  let completedWorkflows = 0;
  let failedWorkflows = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let totalRetries = 0;
  let retriedJobs = 0;
  let totalDurationMs = 0;
  let durationSamples = 0;
  const durationValues: number[] = [];
  let cachedJobs = 0;
  let uncachedJobs = 0;
  let totalCachedTokens = 0;
  let comparableJobs = 0;
  let modelMismatchCount = 0;

  for (const trace of traces) {
    const normalizedTrace = normalizeOrchestrationTraceEntry(trace);
    const workflowStatus = normalizedTrace.status;

    bySource[normalizedTrace.source] = (bySource[normalizedTrace.source] ?? 0) + 1;
    byWorkflowStatus[workflowStatus] = (byWorkflowStatus[workflowStatus] ?? 0) + 1;

    if (workflowStatus === "completed") {
      completedWorkflows += 1;
    } else {
      failedWorkflows += 1;
    }

    completedJobs += normalizedTrace.completedJobs;
    failedJobs += normalizedTrace.failedJobs;
    accumulateByDay(byDay, normalizedTrace);

    if (normalizedTrace.jobModels && normalizedTrace.jobModels.length > 0) {
      for (const job of normalizedTrace.jobModels) {
        jobCount += 1;
        byWorkerKind[job.kind] = (byWorkerKind[job.kind] ?? 0) + 1;
        byRequestedModel[job.requestedModel] = (byRequestedModel[job.requestedModel] ?? 0) + 1;
        const jobStatus = typeof job.status === "string" ? job.status : undefined;
        const errorClass = jobStatus ? classifyJobErrorFromTelemetry({ status: jobStatus, errorClass: job.errorClass }) : undefined;
        const retryCount = typeof job.retryCount === "number" ? job.retryCount : undefined;
        const durationMs = typeof job.durationMs === "number" ? job.durationMs : undefined;
        const cached = typeof job.cached === "boolean" ? job.cached : undefined;
        const cachedTokens = typeof job.cachedTokens === "number" ? job.cachedTokens : undefined;
        const reportedModel = typeof job.reportedModel === "string" ? job.reportedModel : undefined;

        if (retryCount !== undefined) {
          totalRetries += retryCount;
          if (retryCount > 0) {
            retriedJobs += 1;
          }
        }

        if (durationMs !== undefined) {
          totalDurationMs += durationMs;
          durationSamples += 1;
          durationValues.push(durationMs);
        }

        const hasCacheSignal = cached !== undefined || cachedTokens !== undefined;

        if (cachedTokens !== undefined) {
          totalCachedTokens += cachedTokens;
        }

        if (hasCacheSignal && ((cached === true) || ((cached ?? false) === false && (cachedTokens ?? 0) > 0))) {
          cachedJobs += 1;
        } else if (hasCacheSignal) {
          uncachedJobs += 1;
        }

        if (reportedModel) {
          comparableJobs += 1;

          if (reportedModel !== job.requestedModel) {
            modelMismatchCount += 1;
          }
        }

        if (jobStatus) {
          byJobStatus[jobStatus] = (byJobStatus[jobStatus] ?? 0) + 1;

          if (errorClass) {
            byErrorClass[errorClass] = (byErrorClass[errorClass] ?? 0) + 1;
            let sourceSummary = bySourceErrorClass[normalizedTrace.source];

            if (!sourceSummary) {
              sourceSummary = {};
              bySourceErrorClass[normalizedTrace.source] = sourceSummary;
            }

            sourceSummary[errorClass] = (sourceSummary[errorClass] ?? 0) + 1;
          }

          const requestedModelOutcome = getOrCreateModelOutcome(byRequestedModelOutcome, job.requestedModel);
          applyModelOutcomeSample(requestedModelOutcome, {
            errorClass,
            retryCount,
            durationMs,
            hasCacheSignal,
            cached,
            cachedTokens,
            successful: isSuccessfulJobStatus(jobStatus),
          });

          if (job.reportedModel) {
            const reportedModelOutcome = getOrCreateModelOutcome(byReportedModelOutcome, job.reportedModel);
            applyModelOutcomeSample(reportedModelOutcome, {
              errorClass,
              retryCount,
              durationMs,
              hasCacheSignal,
              cached,
              cachedTokens,
              successful: isSuccessfulJobStatus(jobStatus),
            });
          }
        }

        if (job.reportedModel !== undefined) {
          byReportedModel[job.reportedModel] = (byReportedModel[job.reportedModel] ?? 0) + 1;
        }
      }
      continue;
    }

     for (const kind of normalizedTrace.jobKinds) {
       jobCount += 1;
       byWorkerKind[kind] = (byWorkerKind[kind] ?? 0) + 1;
     }
  }

  return {
    traceCount: traces.length,
    jobCount,
    byWorkerKind,
    byRequestedModel,
    byReportedModel,
    bySource,
    byWorkflowStatus,
    byJobStatus,
    byErrorClass,
    bySourceErrorClass,
    byDay,
    workflowOutcome: buildOutcomeSummary(completedWorkflows, failedWorkflows),
    jobOutcome: buildOutcomeSummary(completedJobs, failedJobs),
    retryOutcome: buildRetrySummary(totalRetries, retriedJobs, jobCount),
    durationOutcome: buildDurationSummary(totalDurationMs, durationValues, durationSamples),
    cacheOutcome: buildCacheSummary(cachedJobs, uncachedJobs, totalCachedTokens),
    modelMismatchOutcome: buildModelMismatchSummary(comparableJobs, modelMismatchCount),
    byRequestedModelOutcome: finalizeModelOutcomes(byRequestedModelOutcome),
    byReportedModelOutcome: finalizeModelOutcomes(byReportedModelOutcome),
  };
}

function accumulateByDay(byDay: Record<string, MutableOrchestrationTraceDaySummary>, trace: OrchestrationTraceEntry): void {
  const day = trace.startedAt.slice(0, 10);
  let summary = byDay[day];

  if (!summary) {
    summary = {
      traceCount: 0,
      jobCount: 0,
      completedJobs: 0,
      failedJobs: 0,
    };
    byDay[day] = summary;
  }

  summary.traceCount += 1;
  summary.jobCount += trace.jobKinds.length;
  summary.completedJobs += trace.completedJobs;
  summary.failedJobs += trace.failedJobs;
}

function buildOutcomeSummary(completed: number, failed: number): OrchestrationOutcomeSummary {
  return {
    completed,
    failed,
    successRate: calculateSuccessRate(completed, failed),
  };
}

function buildRetrySummary(totalRetries: number, retriedJobs: number, jobCount: number): OrchestrationRetrySummary {
  return {
    totalRetries,
    retriedJobs,
    avgRetriesPerJob: calculateAverage(totalRetries, jobCount),
  };
}

function buildDurationSummary(totalDurationMs: number, durationValues: readonly number[], sampleCount: number): OrchestrationDurationSummary {
  return {
    totalDurationMs,
    avgDurationMs: calculateAverage(totalDurationMs, sampleCount),
    p50DurationMs: calculatePercentile(durationValues, 0.5),
    p95DurationMs: calculatePercentile(durationValues, 0.95),
  };
}

function buildCacheSummary(cachedJobs: number, uncachedJobs: number, totalCachedTokens: number): OrchestrationCacheSummary {
  return {
    cachedJobs,
    uncachedJobs,
    cacheHitRate: calculateRate(cachedJobs, cachedJobs + uncachedJobs),
    totalCachedTokens,
  };
}

function buildModelMismatchSummary(
  comparableJobs: number,
  modelMismatchCount: number,
): OrchestrationModelMismatchSummary {
  return {
    comparableJobs,
    modelMismatchCount,
    modelMismatchRate: calculateRate(modelMismatchCount, comparableJobs),
  };
}

function calculateSuccessRate(completed: number, failed: number): number {
  const total = completed + failed;

  if (total === 0) {
    return 0;
  }

  return completed / total;
}

function calculateAverage(total: number, count: number): number {
  if (count === 0) {
    return 0;
  }

  return total / count;
}

function calculateRate(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function calculatePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(Math.ceil(sorted.length * percentile) - 1, 0);
  return sorted[Math.min(rank, sorted.length - 1)] ?? 0;
}

function getOrCreateModelOutcome(
  outcomes: Record<string, MutableModelOutcomeSummary>,
  model: string,
): MutableModelOutcomeSummary {
  let outcome = outcomes[model];

  if (!outcome) {
    outcome = {
      jobCount: 0,
      completed: 0,
      failed: 0,
      totalRetries: 0,
      totalDurationMs: 0,
      cachedJobs: 0,
      uncachedJobs: 0,
      totalCachedTokens: 0,
      byErrorClass: {},
      durationValues: [],
    };
    outcomes[model] = outcome;
  }

  return outcome;
}

function applyModelOutcomeSample(
  outcome: MutableModelOutcomeSummary,
  sample: {
    errorClass: string | undefined;
    retryCount: number | undefined;
    durationMs: number | undefined;
    hasCacheSignal: boolean;
    cached: boolean | undefined;
    cachedTokens: number | undefined;
    successful: boolean;
  },
): void {
  outcome.jobCount += 1;
  outcome.totalRetries += sample.retryCount ?? 0;
  outcome.totalDurationMs += sample.durationMs ?? 0;
  outcome.totalCachedTokens += sample.cachedTokens ?? 0;

  if (sample.durationMs !== undefined) {
    outcome.durationValues.push(sample.durationMs);
  }

  if (sample.errorClass) {
    outcome.byErrorClass[sample.errorClass] = (outcome.byErrorClass[sample.errorClass] ?? 0) + 1;
  }

  if (sample.hasCacheSignal && ((sample.cached === true) || ((sample.cached ?? false) === false && (sample.cachedTokens ?? 0) > 0))) {
    outcome.cachedJobs += 1;
  } else if (sample.hasCacheSignal) {
    outcome.uncachedJobs += 1;
  }

  if (sample.successful) {
    outcome.completed += 1;
  } else {
    outcome.failed += 1;
  }
}

function finalizeModelOutcomes(
  outcomes: Record<string, MutableModelOutcomeSummary>,
): Record<string, OrchestrationModelOutcomeSummary> {
  return Object.fromEntries(
    Object.entries(outcomes).map(([model, summary]) => [
      model,
      {
        jobCount: summary.jobCount,
        completed: summary.completed,
        failed: summary.failed,
        successRate: calculateSuccessRate(summary.completed, summary.failed),
        totalRetries: summary.totalRetries,
        avgRetriesPerJob: calculateAverage(summary.totalRetries, summary.jobCount),
        totalDurationMs: summary.totalDurationMs,
        avgDurationMs: calculateAverage(summary.totalDurationMs, summary.jobCount),
        p50DurationMs: calculatePercentile(summary.durationValues, 0.5),
        p95DurationMs: calculatePercentile(summary.durationValues, 0.95),
        cachedJobs: summary.cachedJobs,
        uncachedJobs: summary.uncachedJobs,
        cacheHitRate: calculateRate(summary.cachedJobs, summary.cachedJobs + summary.uncachedJobs),
        totalCachedTokens: summary.totalCachedTokens,
        byErrorClass: summary.byErrorClass,
      },
    ]),
  );
}

function isSuccessfulJobStatus(status: OrchestrationJobStatus): boolean {
  return status === "completed";
}
