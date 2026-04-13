import type { OrchestrationResultRecord } from "./observability/orchestration-result-store.js";
import { summarizeCompletion, waitForOrchestrationResult, type WaitForOrchestrationResultOptions } from "./wait-for-orchestration-result.js";

interface SuperviseOrchestrationResultStore {
  read(requestId: string): Promise<OrchestrationResultRecord | null>;
}

export interface SuperviseOrchestrationResultOptions extends WaitForOrchestrationResultOptions {}

export interface SuperviseOrchestrationResultResponse {
  readonly requestId: string;
  readonly status: Exclude<OrchestrationResultRecord["status"], "running">;
  readonly workflowStatus: Exclude<OrchestrationResultRecord["status"], "running">;
  readonly taskIds: readonly string[];
  readonly summary: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
}

export async function superviseOrchestrationResult(
  store: SuperviseOrchestrationResultStore,
  requestId: string,
  options: SuperviseOrchestrationResultOptions = {},
): Promise<SuperviseOrchestrationResultResponse> {
  const result = await waitForOrchestrationResult(store, requestId, options);
  if (result.record.status === "running") {
    throw new Error(`Supervisor received non-terminal orchestration result for requestId ${requestId}.`);
  }
  return mapSupervisedResponse(result.record);
}

function mapSupervisedResponse(
  record: Exclude<OrchestrationResultRecord, { status: "running" }>,
): SuperviseOrchestrationResultResponse {
  return {
    requestId: record.requestId,
    status: record.status,
    workflowStatus: record.status,
    taskIds: record.metadata.taskIds,
    summary: summarizeCompletion(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.status === "runner_failed" ? { error: record.error } : {}),
  };
}
