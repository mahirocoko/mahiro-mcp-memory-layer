import type { GeminiCommandRunResult } from "../../types.js";

export function finalizeGeminiCommandResult(
  startedAtDate: Date,
  result: Omit<GeminiCommandRunResult, "finishedAt" | "durationMs">,
): GeminiCommandRunResult {
  const finishedAtDate = new Date();

  return {
    ...result,
    finishedAt: finishedAtDate.toISOString(),
    durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
  };
}
