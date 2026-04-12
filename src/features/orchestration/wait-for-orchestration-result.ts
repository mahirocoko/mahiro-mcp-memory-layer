import type { OrchestrationResultRecord } from "./observability/orchestration-result-store.js";

const DEFAULT_POLL_INTERVAL_MS = 1_000;

interface WaitForOrchestrationResultStore {
  read(requestId: string): Promise<OrchestrationResultRecord | null>;
}

export interface WaitForOrchestrationResultOptions {
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly includeCompletionSummary?: boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface WaitForOrchestrationResultResponse {
  readonly requestId: string;
  readonly status: OrchestrationResultRecord["status"];
  readonly record: OrchestrationResultRecord;
  readonly completionSummary?: string;
}

export async function waitForOrchestrationResult(
  store: WaitForOrchestrationResultStore,
  requestId: string,
  options: WaitForOrchestrationResultOptions = {},
): Promise<WaitForOrchestrationResultResponse> {
  const pollIntervalMs = normalizePositiveInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = normalizeOptionalPositiveInteger(options.timeoutMs);
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = Date.now();

  while (true) {
    const record = await store.read(requestId);

    if (!record) {
      throw new Error(`No orchestration result found for requestId ${requestId}.`);
    }

    if (record.status !== "running") {
      return {
        requestId,
        status: record.status,
        record,
        ...(options.includeCompletionSummary ? { completionSummary: summarizeCompletion(record) } : {}),
      };
    }

    const elapsedMs = Date.now() - startedAt;
    if (timeoutMs !== undefined && elapsedMs >= timeoutMs) {
      throw new Error(
        `Timed out waiting for orchestration result ${requestId} after ${timeoutMs}ms. Last observed status was running.`,
      );
    }

    const remainingMs = timeoutMs === undefined ? pollIntervalMs : Math.min(pollIntervalMs, Math.max(timeoutMs - elapsedMs, 0));
    await sleep(remainingMs);
  }
}

export function summarizeCompletion(record: OrchestrationResultRecord): string {
  if (record.status === "runner_failed") {
    return `runner_failed — ${record.error}`;
  }

  if (record.status === "running") {
    return "running";
  }

  const summary = record.result.summary;
  const base = `${record.status} — ${summary.completedJobs}/${summary.totalJobs} jobs succeeded, ${summary.failedJobs} failed, ${summary.skippedJobs} skipped in ${summary.durationMs}ms`;

  if (record.status === "step_failed" && record.result.mode === "sequential") {
    const failedStep = record.result.failedStepIndex;
    return failedStep === undefined ? base : `${base}; failed step index ${failedStep}`;
  }

  return base;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number") {
    return fallback;
  }

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeOptionalPositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }

  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
