import { mkdir, appendFile, readFile } from "node:fs/promises";
import path from "node:path";

import type { RetrievalTraceEntry } from "../types.js";

export class RetrievalTraceStore {
  public constructor(private readonly filePath: string) {}

  public async append(entry: RetrievalTraceEntry): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  public async readLatest(): Promise<RetrievalTraceEntry | undefined> {
    const entries = await this.readAll();
    return entries.at(-1);
  }

  public async readLatestMatching(filter: {
    readonly projectId?: string;
    readonly containerId?: string;
  }): Promise<RetrievalTraceEntry | undefined> {
    const entries = await this.readAll();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];

      if (entry && matchesLatestScopeFilter(entry, filter)) {
        return entry;
      }
    }

    return undefined;
  }

  public async readByRequestId(requestId: string): Promise<RetrievalTraceEntry | undefined> {
    const entries = await this.readAll();
    return entries.find((entry) => entry.requestId === requestId);
  }

  private async readAll(): Promise<RetrievalTraceEntry[]> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as RetrievalTraceEntry);
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }
}

function matchesLatestScopeFilter(
  entry: RetrievalTraceEntry,
  filter: {
    readonly projectId?: string;
    readonly containerId?: string;
  },
): boolean {
  if (filter.projectId && entry.enforcedFilters.projectId !== filter.projectId) {
    return false;
  }

  if (filter.containerId && entry.enforcedFilters.containerId !== filter.containerId) {
    return false;
  }

  return true;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
