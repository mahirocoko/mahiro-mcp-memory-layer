import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

interface TimestampedRecord {
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly startedAt?: string;
}

export async function pruneExpiredOrchestrationResultRecords(input: {
  readonly directoryPath: string;
  readonly ttlMs: number;
  readonly now?: () => Date;
}): Promise<void> {
  const entries = await readDirectorySafely(input.directoryPath);
  const now = (input.now ?? (() => new Date()))().getTime();

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(input.directoryPath, entry.name);
        const record = await readJsonRecord(filePath);
        const recordTime = getRetentionTimestamp(record);

        if (recordTime !== null && now - recordTime > input.ttlMs) {
          await rm(filePath, { force: true });
        }
      }),
  );
}

export async function pruneExpiredOrchestrationSupervisionRecords(input: {
  readonly directoryPath: string;
  readonly ttlMs: number;
  readonly now?: () => Date;
}): Promise<void> {
  const entries = await readDirectorySafely(input.directoryPath);
  const now = (input.now ?? (() => new Date()))().getTime();

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(input.directoryPath, entry.name);
        const record = await readJsonRecord(filePath);
        const recordTime = getRetentionTimestamp(record);

        if (recordTime !== null && now - recordTime > input.ttlMs) {
          await rm(filePath, { force: true });
        }
      }),
  );
}

export async function pruneExpiredOrchestrationTraceEntries(input: {
  readonly filePath: string;
  readonly ttlMs: number;
  readonly now?: () => Date;
}): Promise<void> {
  const content = await readTextFileSafely(input.filePath);

  if (!content) {
    return;
  }

  const now = (input.now ?? (() => new Date()))().getTime();
  const retainedLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      try {
        const record = JSON.parse(line) as TimestampedRecord;
        const recordTime = getRetentionTimestamp(record);

        if (recordTime === null) {
          return true;
        }

        return now - recordTime <= input.ttlMs;
      } catch {
        return true;
      }
    });

  await writeFile(input.filePath, retainedLines.length > 0 ? `${retainedLines.join("\n")}
` : "", "utf8");
}

function getRetentionTimestamp(record: TimestampedRecord): number | null {
  const timestamp = record.updatedAt ?? record.createdAt ?? record.startedAt;

  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readDirectorySafely(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

async function readJsonRecord(filePath: string): Promise<TimestampedRecord> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as TimestampedRecord;
}

async function readTextFileSafely(filePath: string): Promise<string> {
  try {
    await stat(filePath);
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return "";
    }

    throw error;
  }
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
