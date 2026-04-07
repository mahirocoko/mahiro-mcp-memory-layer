import type { ZodSchema } from "zod";

import { geminiJsonResponseSchema } from "../schemas.js";
import type { GeminiCommandRunResult, GeminiWorkerInput, GeminiWorkerResult } from "../types.js";

export function normalizeGeminiResult(
  input: GeminiWorkerInput,
  commandResult: GeminiCommandRunResult,
  structuredSchema?: ZodSchema,
): GeminiWorkerResult {
  const baseResult = {
    taskId: input.taskId,
    taskKind: input.taskKind,
    requestedModel: input.model,
    stderr: commandResult.stderr.trim() || undefined,
    stdout: commandResult.stdout,
    exitCode: commandResult.exitCode,
    signal: commandResult.signal,
    durationMs: commandResult.durationMs,
    startedAt: commandResult.startedAt,
    finishedAt: commandResult.finishedAt,
  } satisfies Omit<GeminiWorkerResult, "status">;

  if (commandResult.timedOut) {
    return {
      ...baseResult,
      status: "timeout",
      error: `Gemini command timed out after ${input.timeoutMs}ms.`,
    };
  }

  if (commandResult.spawnError) {
    return {
      ...baseResult,
      status: "spawn_error",
      error: commandResult.spawnError,
    };
  }

  const trimmedStdout = commandResult.stdout.trim();

  if (!trimmedStdout) {
    return {
      ...baseResult,
      status: "empty_output",
      error: commandResult.exitCode === 0 ? "Gemini returned no stdout." : "Gemini failed without stdout.",
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(trimmedStdout);
  } catch (error) {
    return {
      ...baseResult,
      status: "invalid_json",
      error: error instanceof Error ? error.message : "Failed to parse Gemini JSON output.",
    };
  }

  const rawResult = geminiJsonResponseSchema.safeParse(parsedJson);

  if (!rawResult.success) {
    return {
      ...baseResult,
      status: "invalid_json",
      error: rawResult.error.issues
        .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
        .join("; "),
    };
  }

  const raw = rawResult.data;
  const reportedModel = readReportedModel(raw);
  const cachedTokens = readCachedTokens(raw);

  if (commandResult.exitCode !== 0) {
    return {
      ...baseResult,
      status: "command_failed",
      reportedModel,
      cachedTokens,
      response: raw.response,
      raw,
      error: readCommandFailureError(raw),
    };
  }

  const structuredResult = parseStructuredData(raw.response, structuredSchema);

  if (structuredResult && !structuredResult.success) {
    return {
      ...baseResult,
      status: "invalid_structured_output",
      reportedModel,
      cachedTokens,
      response: raw.response,
      raw,
      error: structuredResult.error,
    };
  }

  return {
    ...baseResult,
    status: "completed",
    reportedModel,
    cachedTokens,
    response: raw.response,
    raw,
    structuredData: structuredResult?.data,
    error: readStructuredError(raw),
  };
}

function parseStructuredData(response: string | undefined, structuredSchema: ZodSchema | undefined) {
  if (!structuredSchema) {
    return undefined;
  }

  if (!response) {
    return {
      success: false as const,
      error: "Gemini did not return a response body for structured output.",
    };
  }

  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(stripJsonFences(response));
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to parse structured response JSON.",
    };
  }

  const result = structuredSchema.safeParse(parsedResponse);

  if (!result.success) {
    return {
      success: false as const,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "structured"}: ${issue.message}`)
        .join("; "),
    };
  }

  return {
    success: true as const,
    data: result.data,
  };
}

function stripJsonFences(input: string): string {
  const trimmed = input.trim();

  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return trimmed;
  }

  const firstNewlineIndex = trimmed.indexOf("\n");

  if (firstNewlineIndex < 0) {
    return trimmed;
  }

  const openingFence = trimmed.slice(0, firstNewlineIndex).trim().toLowerCase();

  if (openingFence !== "```" && openingFence !== "```json") {
    return trimmed;
  }

  return trimmed.slice(firstNewlineIndex + 1, -3).trim();
}

function readReportedModel(raw: { readonly [key: string]: unknown }): string | undefined {
  const topLevelModel = typeof raw.model === "string" ? raw.model : undefined;
  if (topLevelModel) {
    return topLevelModel;
  }

  const stats = raw.stats;
  if (!stats || typeof stats !== "object") {
    return undefined;
  }

  const statsRecord = stats as Record<string, unknown>;
  const statsModel = typeof statsRecord.model === "string" ? statsRecord.model : undefined;

  if (statsModel) {
    return statsModel;
  }

  const models = statsRecord.models;

  if (!models || typeof models !== "object") {
    return undefined;
  }

  const modelNames = Object.keys(models as Record<string, unknown>);
  return modelNames.length === 1 ? modelNames[0] : undefined;
}

function readStructuredError(raw: { readonly [key: string]: unknown }): string | undefined {
  if (typeof raw.error === "string") {
    return raw.error;
  }

  if (raw.error && typeof raw.error === "object") {
    return JSON.stringify(raw.error);
  }

  return undefined;
}

function readCommandFailureError(raw: { readonly [key: string]: unknown }): string {
  return readStructuredError(raw) ?? "Gemini command exited with a non-zero code.";
}

function readCachedTokens(raw: { readonly [key: string]: unknown }): number | undefined {
  const stats = raw.stats;

  if (!stats || typeof stats !== "object") {
    return undefined;
  }

  const statsRecord = stats as Record<string, unknown>;
  const models = statsRecord.models;

  if (models && typeof models === "object") {
    const cachedTokenValues = Object.values(models)
      .map((model) => readModelCachedTokens(model))
      .filter((value): value is number => typeof value === "number");

    if (cachedTokenValues.length > 0) {
      return cachedTokenValues.reduce((sum, value) => sum + value, 0);
    }
  }

  return readModelCachedTokens(statsRecord);
}

function readModelCachedTokens(modelStats: unknown): number | undefined {
  if (!modelStats || typeof modelStats !== "object") {
    return undefined;
  }

  const tokens = (modelStats as Record<string, unknown>).tokens;

  if (!tokens || typeof tokens !== "object") {
    return undefined;
  }

  const cached = (tokens as Record<string, unknown>).cached;
  return typeof cached === "number" ? cached : undefined;
}
