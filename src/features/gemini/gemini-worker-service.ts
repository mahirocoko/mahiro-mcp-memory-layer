import { ZodError } from "zod";

import { getAppEnv } from "../../config/env.js";
import { resolveGeminiTaskRoute } from "./gemini-task-router.js";
import { FileGeminiCacheStore, type GeminiCacheStore } from "./core/gemini-cache-store.js";
import { normalizeGeminiResult } from "./core/normalize-gemini-result.js";
import { runGeminiCommand } from "./core/run-gemini-command.js";
import { geminiWorkerInputSchema } from "./schemas.js";
import type { GeminiCommandRunResult, GeminiWorkerInput, GeminiWorkerResult } from "./types.js";

export interface RunGeminiWorkerDependencies {
  readonly runCommand?: (input: GeminiWorkerInput) => Promise<GeminiCommandRunResult>;
  readonly cacheStore?: GeminiCacheStore;
}

export async function runGeminiWorker(
  input: GeminiWorkerInput,
  dependencies: RunGeminiWorkerDependencies = {},
): Promise<GeminiWorkerResult> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    geminiWorkerInputSchema.parse(input);
  } catch (error) {
    const failedAtDate = new Date();
    return {
      status: "invalid_input",
      durationMs: failedAtDate.getTime() - startedAtDate.getTime(),
      startedAt,
      finishedAt: failedAtDate.toISOString(),
      error: formatZodError(error),
    };
  }

  const runCommand = dependencies.runCommand ?? runGeminiCommand;
  const env = getAppEnv();
  const cacheStore = dependencies.cacheStore
    ?? new FileGeminiCacheStore(env.dataPaths.geminiCacheFilePath, env.geminiCache);
  const route = resolveGeminiTaskRoute(input);
  const cacheInput = {
    model: input.model,
    prompt: route.prompt,
    taskKind: route.taskKind,
    cwd: input.cwd,
  };
  const cachedEntry = await cacheStore.get(cacheInput);

  if (cachedEntry) {
    const now = new Date().toISOString();
    return {
      taskId: input.taskId,
      taskKind: route.taskKind,
      requestedModel: input.model,
      reportedModel: cachedEntry.reportedModel,
      response: cachedEntry.response,
      raw: cachedEntry.raw,
      structuredData: cachedEntry.structuredData,
      durationMs: 0,
      startedAt: now,
      finishedAt: now,
      status: "completed",
      cached: true,
    };
  }

  const commandResult = await runCommand({
    ...input,
    prompt: route.prompt,
    taskKind: route.taskKind,
  });

  const result = normalizeGeminiResult(
    {
      ...input,
      taskKind: route.taskKind,
    },
    commandResult,
    route.structuredSchema,
  );

  if (result.status === "completed") {
    await cacheStore.set(cacheInput, result);
  }

  return result;
}

function formatZodError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown input error.";
}
