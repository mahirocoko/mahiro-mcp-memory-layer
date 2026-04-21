import { buildRunnerFailedOrchestrationTraceEntry } from "./orchestration-trace.js";
import type { OrchestrationTraceStore } from "./orchestration-trace.js";
import type { OrchestrationResultStore } from "./orchestration-result-store.js";
import type { OrchestrateWorkflowSpec } from "../workflow-spec.js";
import type { OrchestrationRunResult } from "../run-orchestration-workflow.js";

export class OrchestrationLifecycle {
  public constructor(
    private readonly traceStore: Pick<OrchestrationTraceStore, "append">,
    private readonly resultStore: Pick<OrchestrationResultStore, "writeRequested" | "writeCompleted" | "writeRunnerFailed">,
  ) {}

  public async markRequested(input: { requestId: string; source: "cli" | "mcp"; spec: OrchestrateWorkflowSpec }): Promise<void> {
    await this.resultStore.writeRequested(input);
  }

  public async markCompleted(input: { requestId: string; source: "cli" | "mcp"; spec: OrchestrateWorkflowSpec; result: OrchestrationRunResult }): Promise<void> {
    await this.resultStore.writeCompleted(input);
  }

  public async markRunnerFailed(input: { requestId: string; source: "cli" | "mcp"; spec: OrchestrateWorkflowSpec; error: string; startedAt: string }): Promise<void> {
    await this.traceStore.append(
      buildRunnerFailedOrchestrationTraceEntry({
        ...input,
        finishedAt: new Date().toISOString(),
      }),
    );
    await this.resultStore.writeRunnerFailed(input);
  }
}
