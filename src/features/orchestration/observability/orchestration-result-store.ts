import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isWorkflowRequestId } from "../../../lib/ids.js";
import type { OrchestrateWorkflowSpec } from "../workflow-spec.js";
import type { OrchestrationRunResult } from "../run-orchestration-workflow.js";

export interface OrchestrationResultRecord {
  readonly requestId: string;
  readonly source: "cli" | "mcp";
  readonly metadata: {
    readonly mode: OrchestrateWorkflowSpec["mode"];
    readonly taskIds: string[];
    readonly workerRuntimes?: string[];
    readonly jobs?: Array<{
      readonly taskId: string;
      readonly intent?: string;
      readonly requestedExecutor?: string;
      readonly resolvedExecutor?: string;
      readonly approvalRequired?: boolean;
      readonly approvalPrompt?: string;
      readonly paneState?: string;
      readonly paneStateReason?: string;
      readonly lastVisiblePaneExcerpt?: string;
      readonly promptSubmissionAttempted?: boolean;
      readonly workerRuntime?: string;
      readonly routeReason?: string;
      readonly subagentId?: string;
      readonly sessionName?: string;
      readonly paneId?: string;
      readonly configuredRetries?: number;
      readonly configuredRetryDelayMs?: number;
    }>;
  };
  readonly status: "requested" | "completed" | "failed" | "timed_out" | "step_failed" | "runner_failed";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly result?: OrchestrationRunResult;
  readonly error?: string;
}

function buildMetadata(spec: OrchestrateWorkflowSpec, result?: OrchestrationRunResult): OrchestrationResultRecord["metadata"] {
  const jobs = spec.mode === "parallel" ? spec.jobs : spec.steps;
  const workerRuntimes = jobs.map((job) => job.workerRuntime).filter((value): value is NonNullable<typeof value> => typeof value === "string");

  const resolveJobResult = (index: number) => {
    const item = result?.results[index];

    if (!item || !("result" in item)) {
      return undefined;
    }

    return item.result;
  };

  const resolveApprovalPrompt = (index: number) => {
    const jobResult = resolveJobResult(index);

    if (jobResult?.status !== "approval_required") {
      return undefined;
    }

    return jobResult.approvalPrompt;
  };

  const resolveGeminiPaneState = (index: number) => {
    const jobResult = resolveJobResult(index);
    return jobResult && "paneState" in jobResult && typeof jobResult.paneState === "string"
      ? jobResult.paneState
      : undefined;
  };

  const resolveGeminiPaneStateReason = (index: number) => {
    const jobResult = resolveJobResult(index);
    return jobResult && "paneStateReason" in jobResult && typeof jobResult.paneStateReason === "string"
      ? jobResult.paneStateReason
      : undefined;
  };

  const resolveGeminiPaneExcerpt = (index: number) => {
    const jobResult = resolveJobResult(index);
    return jobResult && "lastVisiblePaneExcerpt" in jobResult && typeof jobResult.lastVisiblePaneExcerpt === "string"
      ? jobResult.lastVisiblePaneExcerpt
      : undefined;
  };

  const resolvePromptSubmissionAttempted = (index: number) => {
    const jobResult = resolveJobResult(index);
    return jobResult && "promptSubmissionAttempted" in jobResult && typeof jobResult.promptSubmissionAttempted === "boolean"
      ? jobResult.promptSubmissionAttempted
      : undefined;
  };

  return {
    mode: spec.mode,
    taskIds: jobs.map((job) => job.input.taskId),
    ...(workerRuntimes.length > 0 ? { workerRuntimes: [...new Set(workerRuntimes)] } : {}),
    jobs: jobs.map((job, index) => ({
      taskId: job.input.taskId,
      ...(job.intent ? { intent: job.intent } : {}),
      ...(job.requestedExecutor ? { requestedExecutor: job.requestedExecutor } : {}),
      resolvedExecutor: job.kind,
      ...(job.workerRuntime ? { workerRuntime: job.workerRuntime } : {}),
      ...(job.routeReason ? { routeReason: job.routeReason } : {}),
      ...(typeof job.input.subagentId === "string" ? { subagentId: job.input.subagentId } : {}),
      ...(resolveJobResult(index)?.status === "approval_required" ? { approvalRequired: true } : {}),
      ...(typeof resolveApprovalPrompt(index) === "string" ? { approvalPrompt: resolveApprovalPrompt(index) } : {}),
      ...(typeof resolveGeminiPaneState(index) === "string" ? { paneState: resolveGeminiPaneState(index) } : {}),
      ...(typeof resolveGeminiPaneStateReason(index) === "string" ? { paneStateReason: resolveGeminiPaneStateReason(index) } : {}),
      ...(typeof resolveGeminiPaneExcerpt(index) === "string" ? { lastVisiblePaneExcerpt: resolveGeminiPaneExcerpt(index) } : {}),
      ...(typeof resolvePromptSubmissionAttempted(index) === "boolean" ? { promptSubmissionAttempted: resolvePromptSubmissionAttempted(index) } : {}),
      ...(resolveJobResult(index)?.sessionName ? { sessionName: resolveJobResult(index)?.sessionName } : {}),
      ...(resolveJobResult(index)?.paneId ? { paneId: resolveJobResult(index)?.paneId } : {}),
      ...(job.retries !== undefined ? { configuredRetries: job.retries } : {}),
      ...(job.retryDelayMs !== undefined ? { configuredRetryDelayMs: job.retryDelayMs } : {}),
    })),
  };
}

export class OrchestrationResultStore {
  public constructor(private readonly directory: string) {}

  private assertId(requestId: string): void {
    if (!isWorkflowRequestId(requestId)) {
      throw new Error("Invalid orchestration result requestId");
    }
  }

  private async write(record: OrchestrationResultRecord): Promise<OrchestrationResultRecord> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, `${record.requestId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  public async writeRequested(input: {
    readonly requestId: string;
    readonly source: "cli" | "mcp";
    readonly spec: OrchestrateWorkflowSpec;
  }): Promise<OrchestrationResultRecord> {
    this.assertId(input.requestId);
    const now = new Date().toISOString();
    return await this.write({
      requestId: input.requestId,
      source: input.source,
      metadata: buildMetadata(input.spec),
      status: "requested",
      createdAt: now,
      updatedAt: now,
    });
  }

  public async writeCompleted(input: {
    readonly requestId: string;
    readonly source: "cli" | "mcp";
    readonly spec: OrchestrateWorkflowSpec;
    readonly result: OrchestrationRunResult;
  }): Promise<OrchestrationResultRecord> {
    this.assertId(input.requestId);
    const existing = await this.read(input.requestId);
    return await this.write({
      requestId: input.requestId,
      source: input.source,
      metadata: buildMetadata(input.spec, input.result),
      status: input.result.status,
      result: input.result,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public async writeRunnerFailed(input: {
    readonly requestId: string;
    readonly source: "cli" | "mcp";
    readonly spec: OrchestrateWorkflowSpec;
    readonly error: string;
    readonly startedAt?: string;
  }): Promise<OrchestrationResultRecord> {
    this.assertId(input.requestId);
    return await this.write({
      requestId: input.requestId,
      source: input.source,
      metadata: buildMetadata(input.spec),
      status: "runner_failed",
      error: input.error,
      createdAt: input.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public async read(requestId: string): Promise<OrchestrationResultRecord | null> {
    if (!isWorkflowRequestId(requestId)) {
      return null;
    }
    try {
      return JSON.parse(await readFile(path.join(this.directory, `${requestId}.json`), "utf8")) as OrchestrationResultRecord;
    } catch {
      return null;
    }
  }
}
