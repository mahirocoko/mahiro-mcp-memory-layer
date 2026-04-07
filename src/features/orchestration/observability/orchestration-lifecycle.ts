import type { OrchestrationRunResult } from "../run-orchestration-workflow.js";
import type { OrchestrateWorkflowSpec } from "../workflow-spec.js";
import { buildRunnerFailedOrchestrationTraceEntry, OrchestrationTraceStore } from "./orchestration-trace.js";
import { OrchestrationResultStore } from "./orchestration-result-store.js";

interface BaseLifecycleInput {
  readonly requestId: string;
  readonly source: "cli" | "mcp";
  readonly spec: OrchestrateWorkflowSpec;
}

export class OrchestrationLifecycle {
  public constructor(
    private readonly traceStore: OrchestrationTraceStore,
    private readonly resultStore: OrchestrationResultStore,
  ) {}

  public async markRunning(input: BaseLifecycleInput): Promise<void> {
    await this.resultStore.writeRunning(input);
  }

  public async markCompleted(
    input: BaseLifecycleInput & {
      readonly result: OrchestrationRunResult;
    },
  ): Promise<void> {
    await this.resultStore.writeCompleted(input);
  }

  public async markRunnerFailed(
    input: BaseLifecycleInput & {
      readonly error: string;
      readonly startedAt: string;
    },
  ): Promise<void> {
    await this.traceStore.append(
      buildRunnerFailedOrchestrationTraceEntry({
        requestId: input.requestId,
        source: input.source,
        spec: input.spec,
        error: input.error,
        startedAt: input.startedAt,
      }),
    );

    await this.resultStore.writeRunnerFailed(input);
  }
}
