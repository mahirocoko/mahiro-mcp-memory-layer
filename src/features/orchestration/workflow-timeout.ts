import type { WorkerJob } from "./types.js";

export interface PreparedWorkflowJob {
  readonly job: WorkerJob;
  readonly workflowTimeoutBounded: boolean;
}

export function prepareJobForWorkflowTimeout(
  job: WorkerJob,
  deadlineAt: number | undefined,
): PreparedWorkflowJob | undefined {
  if (deadlineAt === undefined) {
    return {
      job,
      workflowTimeoutBounded: false,
    };
  }

  const remainingMs = Math.floor(deadlineAt - Date.now());

  if (remainingMs <= 0) {
    return undefined;
  }

  const effectiveTimeoutMs = Math.max(1, remainingMs);
  const currentTimeoutMs = job.input.timeoutMs;

  if (currentTimeoutMs !== undefined && currentTimeoutMs <= effectiveTimeoutMs) {
    return {
      job,
      workflowTimeoutBounded: false,
    };
  }

  return {
    workflowTimeoutBounded: true,
    job: {
      ...job,
      input: {
        ...job.input,
        timeoutMs: effectiveTimeoutMs,
      },
    },
  };
}
