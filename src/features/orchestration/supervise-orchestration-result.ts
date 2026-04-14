import { newId } from "../../lib/ids.js";
import { type OrchestrationResultRecord, OrchestrationResultStore } from "./observability/orchestration-result-store.js";
import {
  type OrchestrationSupervisionRecord,
  OrchestrationSupervisionStore,
} from "./observability/orchestration-supervision-store.js";
import { summarizeCompletion } from "./wait-for-orchestration-result.js";

const DEFAULT_POLL_INTERVAL_MS = 1_000;

interface SuperviseOrchestrationResultStore {
  read(requestId: string): Promise<OrchestrationResultRecord | null>;
}

interface SupervisionRecordStore {
  writeRunning(input: {
    requestId: string;
    targetRequestId: string;
    source: "mcp";
    pollIntervalMs: number;
    timeoutMs?: number;
    pollCount: number;
    lastObservedWorkflowStatus?: OrchestrationResultRecord["status"];
  }): Promise<OrchestrationSupervisionRecord>;
  writeCompleted(input: {
    requestId: string;
    targetRequestId: string;
    source: "mcp";
    pollIntervalMs: number;
    timeoutMs?: number;
    pollCount: number;
    workflowStatus: Exclude<OrchestrationResultRecord["status"], "running">;
    taskIds: readonly string[];
    summary: string;
    error?: string;
  }): Promise<OrchestrationSupervisionRecord>;
  writeSupervisorFailed(input: {
    requestId: string;
    targetRequestId: string;
    source: "mcp";
    pollIntervalMs: number;
    timeoutMs?: number;
    pollCount: number;
    error: string;
    lastObservedWorkflowStatus?: OrchestrationResultRecord["status"];
  }): Promise<OrchestrationSupervisionRecord>;
  read(requestId: string): Promise<OrchestrationSupervisionRecord | null>;
}

export interface StartOrchestrationSupervisionOptions {
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface StartOrchestrationSupervisionResponse {
  readonly requestId: string;
  readonly targetRequestId: string;
  readonly status: "running";
  readonly pollIntervalMs: number;
  readonly resultTool: "get_orchestration_supervision_result";
}

export async function startOrchestrationSupervision(
  workflowStore: SuperviseOrchestrationResultStore,
  supervisionStore: SupervisionRecordStore,
  targetRequestId: string,
  options: StartOrchestrationSupervisionOptions = {},
): Promise<StartOrchestrationSupervisionResponse> {
  const requestId = newId("supervisor");
  const pollIntervalMs = normalizePositiveInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);

  await supervisionStore.writeRunning({
    requestId,
    targetRequestId,
    source: "mcp",
    pollIntervalMs,
    timeoutMs: options.timeoutMs,
    pollCount: 0,
  });

  void pollUntilTerminal(workflowStore, supervisionStore, requestId, targetRequestId, {
    pollIntervalMs,
    timeoutMs: options.timeoutMs,
    sleep: options.sleep,
  }).catch(async (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await supervisionStore.writeSupervisorFailed({
      requestId,
      targetRequestId,
      source: "mcp",
      pollIntervalMs,
      timeoutMs: options.timeoutMs,
      pollCount: 0,
      error: `Supervisor loop failed: ${errorMessage}`,
    });
  });

  return {
    requestId,
    targetRequestId,
    status: "running",
    pollIntervalMs,
    resultTool: "get_orchestration_supervision_result",
  };
}

export async function getOrchestrationSupervisionResult(
  supervisionStore: SupervisionRecordStore,
  requestId: string,
): Promise<OrchestrationSupervisionRecord | null> {
  return supervisionStore.read(requestId);
}

async function pollUntilTerminal(
  workflowStore: SuperviseOrchestrationResultStore,
  supervisionStore: SupervisionRecordStore,
  requestId: string,
  targetRequestId: string,
  options: Required<Pick<StartOrchestrationSupervisionOptions, "pollIntervalMs">> & StartOrchestrationSupervisionOptions,
): Promise<void> {
  const startedAt = Date.now();
  const sleep = options.sleep ?? defaultSleep;
  let pollCount = 0;

  while (true) {
    const workflowRecord = await workflowStore.read(targetRequestId);
    pollCount += 1;
    const lastObservedWorkflowStatus = workflowRecord?.status;

    if (workflowRecord && workflowRecord.status !== "running") {
      await supervisionStore.writeCompleted({
        requestId,
        targetRequestId,
        source: "mcp",
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
        pollCount,
        workflowStatus: workflowRecord.status,
        taskIds: workflowRecord.metadata.taskIds,
        summary: summarizeCompletion(workflowRecord),
        ...(workflowRecord.status === "runner_failed" ? { error: workflowRecord.error } : {}),
      });
      return;
    }

    const elapsedMs = Date.now() - startedAt;
    if (typeof options.timeoutMs === "number" && elapsedMs >= options.timeoutMs) {
      await supervisionStore.writeSupervisorFailed({
        requestId,
        targetRequestId,
        source: "mcp",
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
        pollCount,
        error: `Timed out supervising orchestration result ${targetRequestId} after ${options.timeoutMs}ms.`,
        ...(lastObservedWorkflowStatus !== undefined ? { lastObservedWorkflowStatus } : {}),
      });
      return;
    }

    await supervisionStore.writeRunning({
      requestId,
      targetRequestId,
      source: "mcp",
      pollIntervalMs: options.pollIntervalMs,
      timeoutMs: options.timeoutMs,
      pollCount,
      ...(lastObservedWorkflowStatus !== undefined ? { lastObservedWorkflowStatus } : {}),
    });

    const remainingMs =
      typeof options.timeoutMs === "number"
        ? Math.min(options.pollIntervalMs, Math.max(options.timeoutMs - elapsedMs, 0))
        : options.pollIntervalMs;
    await sleep(remainingMs);
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number") {
    return fallback;
  }

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { OrchestrationResultStore, OrchestrationSupervisionStore };
