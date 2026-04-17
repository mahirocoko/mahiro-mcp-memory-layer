export const ORCHESTRATION_RUNNING_WARNING =
  'status=running means the workflow is still in progress in background, not stale or failed. Keep polling get_orchestration_result with this requestId or start repo-owned supervision with supervise_orchestration_result. wait_for_orchestration_result is only a short blocking helper. Do not fall back to waitForCompletion: true, sync worker tools, or local CLI execution while this requestId is still running.';

export const ORCHESTRATION_RUNNING_MESSAGE =
  'Workflow result is still running in background. Prefer supervise_orchestration_result for repo-owned polling, or keep polling get_orchestration_result with this requestId until terminal. Treat running as healthy in-progress state and do not switch to sync/local execution just because the workflow has not finished yet or a bounded wait timed out.';

export function buildAsyncWorkflowStartEnvelope(input: {
  readonly requestId: string;
  readonly waitMode: "explicit_async" | "auto_async";
}): {
  readonly requestId: string;
  readonly status: "running";
  readonly executionMode: "async";
  readonly waitMode: "explicit_async" | "auto_async";
  readonly pollWith: "get_orchestration_result";
  readonly superviseWith: "supervise_orchestration_result";
  readonly superviseResultWith: "get_orchestration_supervision_result";
  readonly waitWith: "wait_for_orchestration_result";
  readonly recommendedFollowUp: "supervise_orchestration_result";
  readonly nextArgs: {
    readonly requestId: string;
  };
  readonly warning: string;
  readonly message: string;
  readonly autoAsync?: true;
} {
  return {
    requestId: input.requestId,
    status: "running",
    executionMode: "async",
    waitMode: input.waitMode,
    pollWith: "get_orchestration_result",
    superviseWith: "supervise_orchestration_result",
    superviseResultWith: "get_orchestration_supervision_result",
    waitWith: "wait_for_orchestration_result",
    recommendedFollowUp: "supervise_orchestration_result",
    nextArgs: {
      requestId: input.requestId,
    },
    warning:
      "Prefer background polling in production hosts. Treat status=running as healthy in-progress state, not as failure or staleness. Use supervise_orchestration_result to start repo-owned supervision, or a host-side poller built on get_orchestration_result. wait_for_orchestration_result is only for short blocking checks because MCP or host request timeouts may fire before the workflow finishes; do not fall back to sync/local execution just because a workflow is still running or a bounded wait timed out.",
    message:
      input.waitMode === "auto_async"
        ? "Workflow started in background because waitForCompletion was omitted. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Treat running as in-progress state and keep polling; do not switch to sync/local execution just because the workflow has not reached terminal yet. Use wait_for_orchestration_result only for short blocking checks."
        : "Workflow started in background because waitForCompletion was false. Hand this requestId to supervise_orchestration_result to start repo-owned supervision, or to a host-side poller that calls get_orchestration_result until terminal. Treat running as in-progress state and keep polling; do not switch to sync/local execution just because the workflow has not reached terminal yet. Use wait_for_orchestration_result only for short blocking checks.",
    ...(input.waitMode === "auto_async" ? { autoAsync: true } : {}),
  };
}

export function enrichRunningWorkflowResult<TRecord extends object>(input: {
  readonly requestId: string;
  readonly record: TRecord;
}) {
  const routeSummary = summarizeRouteReasonsFromRecord(input.record as {
    readonly metadata?: {
      readonly jobs?: readonly {
        readonly routeReason?: string;
      }[];
    };
  });

  return {
    ...input.record,
    executionMode: "async",
    pollWith: "get_orchestration_result",
    superviseWith: "supervise_orchestration_result",
    superviseResultWith: "get_orchestration_supervision_result",
    waitWith: "wait_for_orchestration_result",
    recommendedFollowUp: "supervise_orchestration_result",
    nextArgs: {
      requestId: input.requestId,
    },
    warning: ORCHESTRATION_RUNNING_WARNING,
    message: ORCHESTRATION_RUNNING_MESSAGE,
    ...(routeSummary ? { routeSummary } : {}),
  };
}

export function summarizeRouteReasonsFromRecord(input: {
  readonly metadata?: {
    readonly jobs?: readonly {
      readonly routeReason?: string;
    }[];
  };
}):
  | {
      readonly primaryReason: string;
      readonly uniqueReasons: readonly string[];
      readonly jobsWithReasons: number;
    }
  | undefined {
  const reasons = (input.metadata?.jobs ?? [])
    .map((job) => job.routeReason)
    .filter((reason): reason is string => typeof reason === "string" && reason.length > 0);

  if (reasons.length === 0) {
    return undefined;
  }

  const uniqueReasons = Array.from(new Set(reasons));

  return {
    primaryReason: uniqueReasons[0] ?? reasons[0]!,
    uniqueReasons,
    jobsWithReasons: reasons.length,
  };
}
