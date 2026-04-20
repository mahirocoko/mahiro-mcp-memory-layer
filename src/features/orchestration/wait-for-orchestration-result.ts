import type { OrchestrationResultRecord } from "./observability/orchestration-result-store.js";

const terminalStatuses = new Set(["completed", "failed", "timed_out", "step_failed", "runner_failed"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function summarizeCompletion(record: OrchestrationResultRecord): string {
  if (record.status === "runner_failed") {
    return `runner_failed — ${record.error ?? "workflow failed"}`;
  }
  const summary = record.result?.summary;
  if (!summary) {
    return `${record.status} — no summary available`;
  }
  const base = `${record.status} — ${summary.completedJobs}/${summary.totalJobs} jobs succeeded, ${summary.failedJobs} failed, ${summary.skippedJobs} skipped in ${summary.durationMs}ms`;
  if (record.status === "step_failed" && typeof record.result?.failedStepIndex === "number") {
    return `${base}; failed step index ${record.result.failedStepIndex}`;
  }
  return base;
}

export async function waitForOrchestrationResult(
  store: { read(requestId: string): Promise<OrchestrationResultRecord | null> },
  requestId: string,
  options: { pollIntervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; includeCompletionSummary?: boolean } = {},
): Promise<OrchestrationResultRecord & { completionSummary?: string }> {
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = Date.now();
  let lastStatus = "unknown";

  while (true) {
    const record = await store.read(requestId);
    if (!record) {
      throw new Error(`No orchestration result found for requestId ${requestId}.`);
    }
    lastStatus = record.status;
    if (terminalStatuses.has(record.status)) {
      return options.includeCompletionSummary ? { ...record, completionSummary: summarizeCompletion(record) } : record;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for orchestration result ${requestId} after ${timeoutMs}ms. Last observed status was ${lastStatus}.`);
    }
    await sleep(pollIntervalMs);
  }
}
