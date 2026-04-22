import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { memoryRecordSchema } from "../schemas.js";
import type { ListMemoriesInput, ListReviewQueueInput, MemoryRecord } from "../types.js";
import type { CanonicalLogStore } from "./canonical-log.js";

export class JsonlLogStore implements CanonicalLogStore {
  public constructor(private readonly filePath: string) {}

  public async append(record: MemoryRecord): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  public async list(input: ListMemoriesInput): Promise<readonly MemoryRecord[]> {
    const records = await this.readAll();

    return records
      .filter((record) => !input.scope || record.scope === input.scope)
      .filter((record) => !input.kind || record.kind === input.kind)
      .filter((record) => !input.projectId || record.projectId === input.projectId)
      .filter((record) => !input.containerId || record.containerId === input.containerId)
      .slice(0, input.limit ?? 100);
  }

  public async listReviewQueue(input: ListReviewQueueInput): Promise<readonly MemoryRecord[]> {
    const records = await this.readAll();

    return records
      .filter((record) => record.verificationStatus !== "verified")
      .filter((record) => record.reviewStatus !== "rejected")
      .filter((record) => !input.projectId || record.projectId === input.projectId)
      .filter((record) => !input.containerId || record.containerId === input.containerId)
      .sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
        const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
        return rightTime - leftTime;
      })
      .slice(0, input.limit ?? 100);
  }

  public async readAll(): Promise<readonly MemoryRecord[]> {
    try {
      const fileContent = await readFile(this.filePath, "utf8");

      return fileContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .flatMap((line) => {
          const parsed = memoryRecordSchema.safeParse(JSON.parse(line));
          return parsed.success ? [parsed.data as MemoryRecord] : [];
        });
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }

  public async readById(id: string): Promise<MemoryRecord | undefined> {
    const records = await this.readAll();
    return records.find((record) => record.id === id);
  }

  public async replaceRecordById(id: string, record: MemoryRecord): Promise<void> {
    const records = await this.readAll();
    const index = records.findIndex((existing) => existing.id === id);

    if (index === -1) {
      throw new Error(`replaceRecordById: no record with id ${id}`);
    }

    const next = records.slice();
    next[index] = record;

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${next.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
