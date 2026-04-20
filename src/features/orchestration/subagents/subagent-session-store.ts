import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSubagentId } from "../../../lib/ids.js";
import type { SubagentSessionRecord } from "./subagent-session-types.js";

export class SubagentSessionStore {
  public constructor(private readonly directory: string) {}

  private assertId(subagentId: string): void {
    if (!isSubagentId(subagentId)) {
      throw new Error("Invalid subagent session id");
    }
  }

  private filePath(subagentId: string): string {
    return path.join(this.directory, `${subagentId}.json`);
  }

  public async read(subagentId: string): Promise<SubagentSessionRecord | null> {
    if (!isSubagentId(subagentId)) {
      return null;
    }
    try {
      return JSON.parse(await readFile(this.filePath(subagentId), "utf8")) as SubagentSessionRecord;
    } catch {
      return null;
    }
  }

  public async write(record: SubagentSessionRecord): Promise<SubagentSessionRecord> {
    this.assertId(record.subagentId);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.filePath(record.subagentId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  public async upsert(input: Omit<SubagentSessionRecord, "createdAt" | "updatedAt">): Promise<SubagentSessionRecord> {
    const existing = await this.read(input.subagentId);
    const now = new Date().toISOString();
    return await this.write({
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  public async list(): Promise<SubagentSessionRecord[]> {
    try {
      const files = await readdir(this.directory);
      const records = await Promise.all(
        files.filter((fileName) => fileName.endsWith(".json")).map(async (fileName) => {
          try {
            return JSON.parse(await readFile(path.join(this.directory, fileName), "utf8")) as SubagentSessionRecord;
          } catch {
            return null;
          }
        }),
      );
      return records.filter((record): record is SubagentSessionRecord => record !== null);
    } catch {
      return [];
    }
  }
}
