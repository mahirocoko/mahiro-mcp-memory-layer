import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";

import type { ListMemoriesInput, MemoryRecord } from "../types.js";
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
      .filter((record) => !input.userId || record.userId === input.userId)
      .filter((record) => !input.projectId || record.projectId === input.projectId)
      .filter((record) => !input.containerId || record.containerId === input.containerId)
      .filter((record) => !input.sessionId || record.sessionId === input.sessionId)
      .slice(0, input.limit ?? 100);
  }

  public async readAll(): Promise<readonly MemoryRecord[]> {
    try {
      const fileContent = await readFile(this.filePath, "utf8");

      return fileContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as MemoryRecord);
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
