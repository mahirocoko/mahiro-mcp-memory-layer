import { readFile } from "node:fs/promises";

import { normalizeOrchestrationTraceEntry } from "./effective-orchestration-trace-status.js";
import { listOrchestrationTracesInputSchema } from "../schemas.js";
import type { ListOrchestrationTracesInput, OrchestrationTraceEntry } from "../types.js";

export async function listOrchestrationTraces(input: {
  readonly payload: ListOrchestrationTracesInput;
  readonly filePath: string;
}): Promise<readonly OrchestrationTraceEntry[]> {
  const payload = listOrchestrationTracesInputSchema.parse(input.payload);
  const content = await readTraceFile(input.filePath);

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OrchestrationTraceEntry)
    .map((entry) => normalizeOrchestrationTraceEntry(entry))
    .reverse()
    .filter((entry) => matchesTraceFilter(entry, payload))
    .slice(0, payload.limit ?? 20);
}

async function readTraceFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return "";
    }

    throw error;
  }
}

function matchesTraceFilter(
  entry: OrchestrationTraceEntry,
  filter: ListOrchestrationTracesInput,
): boolean {
  if (filter.source && entry.source !== filter.source) {
    return false;
  }

  if (filter.mode && entry.mode !== filter.mode) {
    return false;
  }

  if (filter.status && entry.status !== filter.status) {
    return false;
  }

  if (filter.requestId && entry.requestId !== filter.requestId) {
    return false;
  }

  if (filter.taskId && !entry.taskIds.includes(filter.taskId)) {
    return false;
  }

  const startedAtMs = Date.parse(entry.startedAt);

  if (filter.fromDate && startedAtMs < normalizeDateFilterValue(filter.fromDate, "from")) {
    return false;
  }

  if (filter.toDate && startedAtMs > normalizeDateFilterValue(filter.toDate, "to")) {
    return false;
  }

  return true;
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function normalizeDateFilterValue(value: string, bound: "from" | "to"): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = bound === "from" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return Date.parse(`${value}${suffix}`);
  }

  return Date.parse(value);
}
