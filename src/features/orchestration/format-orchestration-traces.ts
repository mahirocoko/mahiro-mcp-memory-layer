import {
  formatOrchestrationTraceStatus,
  normalizeOrchestrationTraceEntry,
} from "./observability/effective-orchestration-trace-status.js";
import type { OrchestrationTraceEntry } from "./types.js";

export function formatOrchestrationTracesAsText(
  traces: readonly OrchestrationTraceEntry[],
): string {
  if (traces.length === 0) {
    return "No orchestration traces found.";
  }

  const lines = [
    "| Request ID | Source | Mode | Status | Jobs | Finished | Failed | Duration | Created |",
    "|------------|--------|------|--------|------|----------|--------|----------|---------|",
  ];

  for (const trace of traces) {
    const normalizedTrace = normalizeOrchestrationTraceEntry(trace);

    lines.push(
      `| ${normalizedTrace.requestId} | ${normalizedTrace.source} | ${normalizedTrace.mode} | ${formatOrchestrationTraceStatus(trace)} | ${normalizedTrace.totalJobs} | ${normalizedTrace.finishedJobs} | ${normalizedTrace.failedJobs} | ${normalizedTrace.durationMs}ms | ${normalizedTrace.createdAt} |`,
    );
  }

  return lines.join("\n");
}

export function formatOrchestrationTracesAsDetail(
  traces: readonly OrchestrationTraceEntry[],
): string {
  if (traces.length === 0) {
    return "No orchestration traces found.";
  }

  return traces
    .map((trace) => {
      const normalizedTrace = normalizeOrchestrationTraceEntry(trace);
      const lines = [
        `Request ID: ${normalizedTrace.requestId}`,
        `Source: ${normalizedTrace.source}`,
        `Mode: ${normalizedTrace.mode}`,
        `Status: ${formatOrchestrationTraceStatus(trace)}`,
        `Jobs: ${normalizedTrace.totalJobs} total, ${normalizedTrace.finishedJobs} finished, ${normalizedTrace.completedJobs} completed, ${normalizedTrace.failedJobs} failed, ${normalizedTrace.skippedJobs} skipped`,
        `Task IDs: ${normalizedTrace.taskIds.join(", ") || "-"}`,
        `Job Kinds: ${normalizedTrace.jobKinds.join(", ") || "-"}`,
        `Max Concurrency: ${normalizedTrace.maxConcurrency ?? "-"}`,
        `Timeout Ms: ${normalizedTrace.timeoutMs ?? "-"}`,
        `Started At: ${normalizedTrace.startedAt}`,
        `Finished At: ${normalizedTrace.finishedAt}`,
        `Duration: ${normalizedTrace.durationMs}ms`,
        `Created At: ${normalizedTrace.createdAt}`,
      ];

      if (normalizedTrace.failedStepIndex !== undefined) {
        lines.push(`Failed Step Index: ${normalizedTrace.failedStepIndex}`);
      }

      if (normalizedTrace.error) {
        lines.push(`Error: ${normalizedTrace.error}`);
      }

      if (normalizedTrace.jobModels && normalizedTrace.jobModels.length > 0) {
        lines.push(
          `Job models: ${normalizedTrace.jobModels
            .map(
              (job) =>
                `${job.taskId} (${job.kind}) status=${typeof job.status === "string" ? job.status : "-"} requested=${job.requestedModel}` +
                (typeof job.configuredRetries === "number" ? ` configuredRetries=${job.configuredRetries}` : "") +
                (typeof job.configuredRetryDelayMs === "number" ? ` configuredRetryDelayMs=${job.configuredRetryDelayMs}` : "") +
                (typeof job.retryCount === "number" ? ` retries=${job.retryCount}` : "") +
                (typeof job.durationMs === "number" ? ` duration=${job.durationMs}ms` : "") +
                (typeof job.cached === "boolean" ? ` cached=${job.cached}` : "") +
                (typeof job.cachedTokens === "number" ? ` cachedTokens=${job.cachedTokens}` : "") +
                (typeof job.errorClass === "string" ? ` errorClass=${job.errorClass}` : "") +
                (job.reportedModel !== undefined ? ` reported=${job.reportedModel}` : ""),
            )
            .join("; ")}`,
        );
      }

      return lines.join("\n");
    })
    .join("\n\n");
}
