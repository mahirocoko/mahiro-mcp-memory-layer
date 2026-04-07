import type { OrchestrateWorkflowSpec } from "./workflow-spec.js";

export interface WorkflowDryRunResult {
  readonly status: "dry_run";
  readonly mode: "parallel" | "sequential";
  readonly spec: OrchestrateWorkflowSpec;
  readonly summary: {
    readonly totalJobs: number;
    readonly maxConcurrency?: number;
    readonly timeoutMs?: number;
  };
}

export function dryRunWorkflow(spec: OrchestrateWorkflowSpec): WorkflowDryRunResult {
  if (spec.mode === "parallel") {
    return {
      status: "dry_run",
      mode: spec.mode,
      spec,
      summary: {
        totalJobs: spec.jobs.length,
        maxConcurrency: spec.maxConcurrency,
        timeoutMs: spec.timeoutMs,
      },
    };
  }

  return {
    status: "dry_run",
    mode: spec.mode,
    spec,
    summary: {
      totalJobs: spec.steps.length,
      timeoutMs: spec.timeoutMs,
    },
  };
}
