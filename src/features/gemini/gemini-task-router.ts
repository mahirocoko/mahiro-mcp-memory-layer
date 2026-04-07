import type { ZodSchema } from "zod";

import {
  geminiExtractFactsOutputSchema,
  geminiSummaryOutputSchema,
  geminiTimelineOutputSchema,
} from "./schemas.js";
import { buildGeminiPrompt } from "./gemini-prompt-templates.js";
import type { GeminiTaskKind, GeminiWorkerInput } from "./types.js";

export interface GeminiTaskRoute {
  readonly taskKind: GeminiTaskKind;
  readonly prompt: string;
  readonly structuredSchema?: ZodSchema;
}

export function resolveGeminiTaskRoute(input: GeminiWorkerInput): GeminiTaskRoute {
  const taskKind = input.taskKind ?? "general";

  switch (taskKind) {
    case "summarize":
      return {
        taskKind,
        prompt: buildGeminiPrompt(taskKind, input.prompt),
        structuredSchema: geminiSummaryOutputSchema,
      };
    case "timeline":
      return {
        taskKind,
        prompt: buildGeminiPrompt(taskKind, input.prompt),
        structuredSchema: geminiTimelineOutputSchema,
      };
    case "extract-facts":
      return {
        taskKind,
        prompt: buildGeminiPrompt(taskKind, input.prompt),
        structuredSchema: geminiExtractFactsOutputSchema,
      };
    case "general":
    default:
      return {
        taskKind: "general",
        prompt: buildGeminiPrompt("general", input.prompt),
      };
  }
}
