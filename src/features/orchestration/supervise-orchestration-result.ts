import { newId } from "../../lib/ids.js";
import type { OrchestrationResultRecord } from "./observability/orchestration-result-store.js";
import type { OrchestrationSupervisionRecord } from "./observability/orchestration-supervision-store.js";
import { summarizeCompletion } from "./wait-for-orchestration-result.js";

const terminalStatuses = new Set(["completed", "failed", "timed_out", "step_failed", "runner_failed"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startOrchestrationSupervision(
  workflowStore: { read(requestId: string): Promise<OrchestrationResultRecord | null> },
  supervisionStore: {
    writeRunning(input: Omit<OrchestrationSupervisionRecord, "status" | "createdAt" | "updatedAt">): Promise<OrchestrationSupervisionRecord>;
    writeCompleted(input: Omit<OrchestrationSupervisionRecord, "status" | "createdAt" | "updatedAt"> & { workflowStatus: NonNullable<OrchestrationSupervisionRecord["workflowStatus"]> }): Promise<OrchestrationSupervisionRecord>;
    writeSupervisorFailed(input: Omit<OrchestrationSupervisionRecord, "status" | "createdAt" | "updatedAt">): Promise<OrchestrationSupervisionRecord>;
    read(requestId: string): Promise<OrchestrationSupervisionRecord | null>;
  },
  requestId: string,
  options: { pollIntervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ requestId: string; targetRequestId: string; status: "running"; resultTool: "get_orchestration_supervision_result" }> {
  const supervisorRequestId = newId("supervisor");
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;
  await supervisionStore.writeRunning({
    requestId: supervisorRequestId,
    targetRequestId: requestId,
    source: "mcp",
    pollIntervalMs,
    timeoutMs,
    pollCount: 0,
    lastObservedWorkflowStatus: "running",
  });

  void (async () => {
    const startedAt = Date.now();
    let pollCount = 0;
    try {
      while (true) {
        const record = await workflowStore.read(requestId);
        pollCount += 1;
        const status = record?.status ?? "missing";
        if (record && terminalStatuses.has(record.status)) {
          const workflowStatus = record.status as Exclude<OrchestrationSupervisionRecord["workflowStatus"], undefined>;
          const jobs = record.metadata.jobs ?? [];
          await supervisionStore.writeCompleted({
            requestId: supervisorRequestId,
            targetRequestId: requestId,
            source: record.source,
            pollIntervalMs,
            timeoutMs,
            pollCount,
            workflowStatus,
            taskIds: record.metadata.taskIds,
            ...(jobs.some((job) => typeof (job as Record<string, unknown>).subagentId === "string")
              ? { subagentIds: jobs.map((job) => (job as Record<string, unknown>).subagentId).filter((value): value is string => typeof value === "string") }
              : {}),
            ...(jobs.some((job) => typeof (job as Record<string, unknown>).sessionName === "string")
              ? { sessionNames: jobs.map((job) => (job as Record<string, unknown>).sessionName).filter((value): value is string => typeof value === "string") }
              : {}),
            ...(jobs.some((job) => typeof (job as Record<string, unknown>).paneId === "string")
              ? { paneIds: jobs.map((job) => (job as Record<string, unknown>).paneId).filter((value): value is string => typeof value === "string") }
              : {}),
            summary: summarizeCompletion(record),
            ...(record.error ? { error: record.error } : {}),
          });
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          await supervisionStore.writeSupervisorFailed({
            requestId: supervisorRequestId,
            targetRequestId: requestId,
            source: "mcp",
            pollIntervalMs,
            timeoutMs,
            pollCount,
            lastObservedWorkflowStatus: status,
            error: `Timed out supervising orchestration result ${requestId} after ${timeoutMs}ms.`,
          });
          return;
        }
        await sleep(pollIntervalMs);
      }
    } catch (error) {
      await supervisionStore.writeSupervisorFailed({
        requestId: supervisorRequestId,
        targetRequestId: requestId,
        source: "mcp",
        pollIntervalMs,
        timeoutMs,
        pollCount,
        error: `Supervisor loop failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  })();

  return {
    requestId: supervisorRequestId,
    targetRequestId: requestId,
    status: "running",
    resultTool: "get_orchestration_supervision_result",
  };
}

export async function getOrchestrationSupervisionResult(
  supervisionStore: { read(requestId: string): Promise<OrchestrationSupervisionRecord | null> },
  requestId: string,
): Promise<OrchestrationSupervisionRecord | null> {
  return await supervisionStore.read(requestId);
}
