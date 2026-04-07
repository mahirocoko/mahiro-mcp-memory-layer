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
    lines.push(
      `| ${trace.requestId} | ${trace.source} | ${trace.mode} | ${trace.status} | ${trace.totalJobs} | ${trace.finishedJobs} | ${trace.failedJobs} | ${trace.durationMs}ms | ${trace.createdAt} |`,
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
      const lines = [
        `Request ID: ${trace.requestId}`,
        `Source: ${trace.source}`,
        `Mode: ${trace.mode}`,
        `Status: ${trace.status}`,
        `Jobs: ${trace.totalJobs} total, ${trace.finishedJobs} finished, ${trace.completedJobs} completed, ${trace.failedJobs} failed, ${trace.skippedJobs} skipped`,
        `Task IDs: ${trace.taskIds.join(", ") || "-"}`,
        `Job Kinds: ${trace.jobKinds.join(", ") || "-"}`,
        `Max Concurrency: ${trace.maxConcurrency ?? "-"}`,
        `Timeout Ms: ${trace.timeoutMs ?? "-"}`,
        `Started At: ${trace.startedAt}`,
        `Finished At: ${trace.finishedAt}`,
        `Duration: ${trace.durationMs}ms`,
        `Created At: ${trace.createdAt}`,
      ];

      if (trace.failedStepIndex !== undefined) {
        lines.push(`Failed Step Index: ${trace.failedStepIndex}`);
      }

      if (trace.error) {
        lines.push(`Error: ${trace.error}`);
      }

      if (trace.jobModels && trace.jobModels.length > 0) {
        lines.push(
          `Job models: ${trace.jobModels
            .map(
              (job) =>
                `${job.taskId} (${job.kind}) status=${typeof job.status === "string" ? job.status : "-"} requested=${job.requestedModel}` +
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
