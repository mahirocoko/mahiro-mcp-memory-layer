import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAppEnv } from "../../../config/env.js";
import { isWorkflowRequestId } from "../../../lib/ids.js";
import type { OrchestrationRunResult } from "../run-orchestration-workflow.js";
import type { WorkerJob } from "../types.js";
import type { OrchestrateWorkflowSpec } from "../workflow-spec.js";
import { pruneExpiredOrchestrationResultRecords } from "./orchestration-retention.js";

interface OrchestrationResultMetadata {
  readonly mode: OrchestrateWorkflowSpec["mode"];
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
  readonly taskIds: readonly string[];
  readonly workerRuntimes?: readonly ("shell" | "mcp")[];
  readonly jobs?: readonly OrchestrationResultJobMetadata[];
}

interface OrchestrationResultJobMetadata {
  readonly taskId: string;
  readonly workerRuntime?: "shell" | "mcp";
  readonly configuredRetries?: number;
  readonly configuredRetryDelayMs?: number;
  readonly routeReason?: string;
}

interface BaseOrchestrationResultRecord {
  readonly requestId: string;
  readonly source: "cli" | "mcp";
  readonly metadata: OrchestrationResultMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type OrchestrationResultRecord =
  | (BaseOrchestrationResultRecord & {
      readonly status: "running";
    })
  | (BaseOrchestrationResultRecord & {
      readonly status: "completed" | "failed" | "step_failed" | "timed_out";
      readonly result: OrchestrationRunResult;
    })
  | (BaseOrchestrationResultRecord & {
      readonly status: "runner_failed";
      readonly error: string;
    });

export class OrchestrationResultStore {
  public constructor(private readonly directoryPath: string) {}

  public async writeRunning(input: {
    readonly requestId: string;
    readonly source: "cli" | "mcp";
    readonly spec: OrchestrateWorkflowSpec;
  }): Promise<OrchestrationResultRecord> {
    const timestamp = new Date().toISOString();
    const record: OrchestrationResultRecord = {
      requestId: input.requestId,
      source: input.source,
      metadata: buildMetadata(input.spec),
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.writeRecord(record);
    return record;
  }

  public async writeCompleted(input: {
    readonly requestId: string;
    readonly source: "cli" | "mcp";
    readonly spec: OrchestrateWorkflowSpec;
    readonly result: OrchestrationRunResult;
  }): Promise<OrchestrationResultRecord> {
    const existing = await this.read(input.requestId);
    const timestamp = new Date().toISOString();
    const record: OrchestrationResultRecord = {
      requestId: input.requestId,
      source: input.source,
      metadata: buildMetadata(input.spec),
      status: input.result.status,
      result: input.result,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await this.writeRecord(record);
    return record;
  }

  public async writeRunnerFailed(input: {
    readonly requestId: string;
    readonly source: "cli" | "mcp";
    readonly spec: OrchestrateWorkflowSpec;
    readonly error: string;
  }): Promise<OrchestrationResultRecord> {
    const existing = await this.read(input.requestId);
    const timestamp = new Date().toISOString();
    const record: OrchestrationResultRecord = {
      requestId: input.requestId,
      source: input.source,
      metadata: buildMetadata(input.spec),
      status: "runner_failed",
      error: input.error,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await this.writeRecord(record);
    return record;
  }

  public async read(requestId: string): Promise<OrchestrationResultRecord | null> {
    if (!isWorkflowRequestId(requestId)) {
      return null;
    }

    try {
      const content = await readFile(this.resolveConfinedPath(requestId), "utf8");
      return JSON.parse(content) as OrchestrationResultRecord;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async writeRecord(record: OrchestrationResultRecord): Promise<void> {
    await mkdir(this.directoryPath, { recursive: true });
    await writeFile(this.resolveConfinedPath(record.requestId), JSON.stringify(record, null, 2), "utf8");
    await pruneExpiredOrchestrationResultRecords({
      directoryPath: this.directoryPath,
      ttlMs: getAppEnv().orchestrationRetention.ttlMs,
    });
  }

  private resolveConfinedPath(requestId: string): string {
    if (!isWorkflowRequestId(requestId)) {
      throw new Error("Invalid orchestration result requestId");
    }

    const base = path.resolve(this.directoryPath);
    const filePath = path.resolve(base, `${requestId}.json`);
    const relative = path.relative(base, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Orchestration result path escapes store directory");
    }

    return filePath;
  }
}

function buildMetadata(spec: OrchestrateWorkflowSpec): OrchestrationResultMetadata {
  const concreteJobs = getConcreteJobs(spec);
  const workerRuntimes = concreteJobs
    .map((job) => job.workerRuntime)
    .filter((runtime): runtime is "shell" | "mcp" => runtime === "shell" || runtime === "mcp");
  const jobs = concreteJobs.map((job) => ({
    taskId: job.input.taskId,
    ...(job.workerRuntime !== undefined ? { workerRuntime: job.workerRuntime } : {}),
    ...(typeof job.retries === "number" ? { configuredRetries: job.retries } : {}),
    ...(typeof job.retryDelayMs === "number" ? { configuredRetryDelayMs: job.retryDelayMs } : {}),
    ...(job.routeReason ? { routeReason: job.routeReason } : {}),
  }));

  if (spec.mode === "parallel") {
    return {
      mode: spec.mode,
      maxConcurrency: spec.maxConcurrency,
      timeoutMs: spec.timeoutMs,
      taskIds: spec.jobs.map((job) => job.input.taskId),
      ...(workerRuntimes.length > 0 ? { workerRuntimes } : {}),
      ...(jobs.length > 0 ? { jobs } : {}),
    };
  }

  return {
    mode: spec.mode,
    timeoutMs: spec.timeoutMs,
    taskIds: spec.steps.flatMap((step) => (typeof step === "function" ? [] : [step.input.taskId])),
    ...(workerRuntimes.length > 0 ? { workerRuntimes } : {}),
    ...(jobs.length > 0 ? { jobs } : {}),
  };
}

function getConcreteJobs(spec: OrchestrateWorkflowSpec): readonly WorkerJob[] {
  if (spec.mode === "parallel") {
    return spec.jobs;
  }

  return spec.steps.flatMap((step) => (typeof step === "function" ? [] : [step]));
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
