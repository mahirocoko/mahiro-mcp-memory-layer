import type { OrchestrationJobModelTelemetry, OrchestrationTraceEntry } from "../types.js";

type TraceStatusLike = Pick<OrchestrationTraceEntry, "status" | "failedJobs"> & {
  readonly jobModels?: readonly Pick<OrchestrationJobModelTelemetry, "status">[];
};

type TraceCountLike = Pick<
  OrchestrationTraceEntry,
  "totalJobs" | "finishedJobs" | "completedJobs" | "failedJobs" | "skippedJobs"
> & {
  readonly jobModels?: readonly Pick<OrchestrationJobModelTelemetry, "status">[];
};

export function getEffectiveOrchestrationTraceStatus(
  trace: TraceStatusLike,
): OrchestrationTraceEntry["status"] {
  if (trace.status !== "completed") {
    return trace.status;
  }

  if (!hasFailedWork(trace)) {
    return trace.status;
  }

  return hasTimedOutWork(trace.jobModels) ? "timed_out" : "failed";
}

export function normalizeOrchestrationTraceEntry(
  trace: OrchestrationTraceEntry,
): OrchestrationTraceEntry {
  const counts = getEffectiveOrchestrationTraceCounts(trace);
  const status = getEffectiveOrchestrationTraceStatus({
    status: trace.status,
    failedJobs: counts.failedJobs,
    jobModels: trace.jobModels,
  });

  if (
    status === trace.status
    && counts.finishedJobs === trace.finishedJobs
    && counts.completedJobs === trace.completedJobs
    && counts.failedJobs === trace.failedJobs
    && counts.skippedJobs === trace.skippedJobs
  ) {
    return trace;
  }

  return {
    ...trace,
    status,
    finishedJobs: counts.finishedJobs,
    completedJobs: counts.completedJobs,
    failedJobs: counts.failedJobs,
    skippedJobs: counts.skippedJobs,
  };
}

export function formatOrchestrationTraceStatus(trace: TraceStatusLike): string {
  const effectiveStatus = getEffectiveOrchestrationTraceStatus(trace);

  if (effectiveStatus === trace.status) {
    return effectiveStatus;
  }

  return `${effectiveStatus} (stored: ${trace.status})`;
}

function hasFailedWork(trace: TraceStatusLike): boolean {
  if (trace.failedJobs > 0) {
    return true;
  }

  return trace.jobModels?.some((job) => job.status !== "completed") ?? false;
}

function hasTimedOutWork(jobModels: TraceStatusLike["jobModels"]): boolean {
  return jobModels?.some((job) => job.status === "timeout") ?? false;
}

function getEffectiveOrchestrationTraceCounts(trace: TraceCountLike): {
  readonly finishedJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly skippedJobs: number;
} {
  const jobModelsWithStatus = trace.jobModels?.filter((job) => typeof job.status === "string") ?? [];

  if (jobModelsWithStatus.length === 0) {
    return {
      finishedJobs: trace.finishedJobs,
      completedJobs: trace.completedJobs,
      failedJobs: trace.failedJobs,
      skippedJobs: trace.skippedJobs,
    };
  }

  const finishedJobs = jobModelsWithStatus.length;
  const completedJobs = jobModelsWithStatus.filter((job) => job.status === "completed").length;
  const failedJobs = finishedJobs - completedJobs;

  return {
    finishedJobs,
    completedJobs,
    failedJobs,
    skippedJobs: Math.max(trace.totalJobs - finishedJobs, 0),
  };
}
