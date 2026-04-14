import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSupervisorRequestId } from "../../../lib/ids.js";
import type { OrchestrationResultRecord } from "./orchestration-result-store.js";

interface BaseOrchestrationSupervisionRecord {
  readonly requestId: string;
  readonly targetRequestId: string;
  readonly source: "mcp";
  readonly pollIntervalMs: number;
  readonly timeoutMs?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pollCount: number;
}

export type OrchestrationSupervisionRecord =
  | (BaseOrchestrationSupervisionRecord & {
      readonly status: "running";
      readonly lastObservedWorkflowStatus?: OrchestrationResultRecord["status"];
    })
  | (BaseOrchestrationSupervisionRecord & {
      readonly status: Exclude<OrchestrationResultRecord["status"], "running">;
      readonly workflowStatus: Exclude<OrchestrationResultRecord["status"], "running">;
      readonly taskIds: readonly string[];
      readonly summary: string;
      readonly error?: string;
    })
  | (BaseOrchestrationSupervisionRecord & {
      readonly status: "supervisor_failed";
      readonly error: string;
      readonly lastObservedWorkflowStatus?: OrchestrationResultRecord["status"];
    });

export class OrchestrationSupervisionStore {
  public constructor(private readonly directoryPath: string) {}

  public async writeRunning(input: {
    readonly requestId: string;
    readonly targetRequestId: string;
    readonly source: "mcp";
    readonly pollIntervalMs: number;
    readonly timeoutMs?: number;
    readonly pollCount: number;
    readonly lastObservedWorkflowStatus?: OrchestrationResultRecord["status"];
  }): Promise<OrchestrationSupervisionRecord> {
    const existing = await this.read(input.requestId);
    const timestamp = new Date().toISOString();
    const record: OrchestrationSupervisionRecord = {
      requestId: input.requestId,
      targetRequestId: input.targetRequestId,
      source: input.source,
      status: "running",
      pollIntervalMs: input.pollIntervalMs,
      ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      pollCount: input.pollCount,
      ...(input.lastObservedWorkflowStatus !== undefined
        ? { lastObservedWorkflowStatus: input.lastObservedWorkflowStatus }
        : {}),
    };

    await this.writeRecord(record);
    return record;
  }

  public async writeCompleted(input: {
    readonly requestId: string;
    readonly targetRequestId: string;
    readonly source: "mcp";
    readonly pollIntervalMs: number;
    readonly timeoutMs?: number;
    readonly pollCount: number;
    readonly workflowStatus: Exclude<OrchestrationResultRecord["status"], "running">;
    readonly taskIds: readonly string[];
    readonly summary: string;
    readonly error?: string;
  }): Promise<OrchestrationSupervisionRecord> {
    const existing = await this.read(input.requestId);
    const timestamp = new Date().toISOString();
    const record: OrchestrationSupervisionRecord = {
      requestId: input.requestId,
      targetRequestId: input.targetRequestId,
      source: input.source,
      status: input.workflowStatus,
      workflowStatus: input.workflowStatus,
      taskIds: input.taskIds,
      summary: input.summary,
      ...(input.error !== undefined ? { error: input.error } : {}),
      pollIntervalMs: input.pollIntervalMs,
      ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      pollCount: input.pollCount,
    };

    await this.writeRecord(record);
    return record;
  }

  public async writeSupervisorFailed(input: {
    readonly requestId: string;
    readonly targetRequestId: string;
    readonly source: "mcp";
    readonly pollIntervalMs: number;
    readonly timeoutMs?: number;
    readonly pollCount: number;
    readonly error: string;
    readonly lastObservedWorkflowStatus?: OrchestrationResultRecord["status"];
  }): Promise<OrchestrationSupervisionRecord> {
    const existing = await this.read(input.requestId);
    const timestamp = new Date().toISOString();
    const record: OrchestrationSupervisionRecord = {
      requestId: input.requestId,
      targetRequestId: input.targetRequestId,
      source: input.source,
      status: "supervisor_failed",
      error: input.error,
      pollIntervalMs: input.pollIntervalMs,
      ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      pollCount: input.pollCount,
      ...(input.lastObservedWorkflowStatus !== undefined
        ? { lastObservedWorkflowStatus: input.lastObservedWorkflowStatus }
        : {}),
    };

    await this.writeRecord(record);
    return record;
  }

  public async read(requestId: string): Promise<OrchestrationSupervisionRecord | null> {
    if (!isSupervisorRequestId(requestId)) {
      return null;
    }

    try {
      const content = await readFile(this.resolveConfinedPath(requestId), "utf8");
      return JSON.parse(content) as OrchestrationSupervisionRecord;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async writeRecord(record: OrchestrationSupervisionRecord): Promise<void> {
    await mkdir(this.directoryPath, { recursive: true });
    await writeFile(this.resolveConfinedPath(record.requestId), JSON.stringify(record, null, 2), "utf8");
  }

  private resolveConfinedPath(requestId: string): string {
    if (!isSupervisorRequestId(requestId)) {
      throw new Error("Invalid orchestration supervision requestId");
    }

    const base = path.resolve(this.directoryPath);
    const filePath = path.resolve(base, `${requestId}.json`);
    const relative = path.relative(base, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Orchestration supervision path escapes store directory");
    }

    return filePath;
  }
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
