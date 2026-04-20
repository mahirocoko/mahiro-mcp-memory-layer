import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSupervisorRequestId } from "../../../lib/ids.js";

export interface OrchestrationSupervisionRecord {
  readonly requestId: string;
  readonly targetRequestId: string;
  readonly source: "cli" | "mcp";
  readonly status: "running" | "completed" | "failed" | "timed_out" | "step_failed" | "runner_failed" | "supervisor_failed";
  readonly workflowStatus?: "completed" | "failed" | "timed_out" | "step_failed" | "runner_failed";
  readonly taskIds?: string[];
  readonly subagentIds?: string[];
  readonly sessionNames?: string[];
  readonly paneIds?: string[];
  readonly summary?: string;
  readonly error?: string;
  readonly pollIntervalMs: number;
  readonly timeoutMs?: number;
  readonly pollCount: number;
  readonly lastObservedWorkflowStatus?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class OrchestrationSupervisionStore {
  public constructor(private readonly directory: string) {}

  private assertId(requestId: string): void {
    if (!isSupervisorRequestId(requestId)) {
      throw new Error("Invalid orchestration supervision requestId");
    }
  }

  private async write(record: OrchestrationSupervisionRecord): Promise<OrchestrationSupervisionRecord> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, `${record.requestId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  public async writeRunning(input: Omit<OrchestrationSupervisionRecord, "status" | "createdAt" | "updatedAt">): Promise<OrchestrationSupervisionRecord> {
    this.assertId(input.requestId);
    const now = new Date().toISOString();
    return await this.write({ ...input, status: "running", createdAt: now, updatedAt: now });
  }

  public async writeCompleted(input: Omit<OrchestrationSupervisionRecord, "status" | "createdAt" | "updatedAt"> & { workflowStatus: NonNullable<OrchestrationSupervisionRecord["workflowStatus"]> }): Promise<OrchestrationSupervisionRecord> {
    this.assertId(input.requestId);
    const existing = await this.read(input.requestId);
    return await this.write({ ...input, status: input.workflowStatus, createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  public async writeSupervisorFailed(input: Omit<OrchestrationSupervisionRecord, "status" | "createdAt" | "updatedAt">): Promise<OrchestrationSupervisionRecord> {
    this.assertId(input.requestId);
    const existing = await this.read(input.requestId);
    return await this.write({ ...input, status: "supervisor_failed", createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  public async read(requestId: string): Promise<OrchestrationSupervisionRecord | null> {
    if (!isSupervisorRequestId(requestId)) {
      return null;
    }
    try {
      return JSON.parse(await readFile(path.join(this.directory, `${requestId}.json`), "utf8")) as OrchestrationSupervisionRecord;
    } catch {
      return null;
    }
  }
}
