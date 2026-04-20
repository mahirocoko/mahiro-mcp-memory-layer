import { readFile } from "node:fs/promises";

export async function listOrchestrationTraces(input: { filePath: string; payload?: Record<string, unknown> }): Promise<unknown[]> {
  try {
    const content = await readFile(input.filePath, "utf8");
    let entries = content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
    const payload = input.payload ?? {};
    if (typeof payload.source === "string") {
      entries = entries.filter((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).source === payload.source);
    }
    if (typeof payload.limit === "number") {
      entries = entries.slice(0, payload.limit);
    }
    return entries;
  } catch {
    return [];
  }
}
