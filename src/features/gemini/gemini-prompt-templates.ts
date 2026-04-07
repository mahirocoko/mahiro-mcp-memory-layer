import type { GeminiTaskKind } from "./types.js";

export function buildGeminiPrompt(taskKind: GeminiTaskKind, prompt: string): string {
  switch (taskKind) {
    case "summarize":
      return [
        "You are a concise summarization worker.",
        "Return JSON only with this shape:",
        '{"summary":"string","keyPoints":["string"]}',
        "Keep the summary short and the key points concrete.",
        `Input: ${prompt}`,
      ].join("\n");
    case "timeline":
      return [
        "You are a timeline extraction worker.",
        "Return JSON only with this shape:",
        '{"overview":"string","timeline":[{"period":"string","change":"string","detail":"string"}]}',
        "Keep periods readable and changes explicit.",
        `Input: ${prompt}`,
      ].join("\n");
    case "extract-facts":
      return [
        "You are a fact extraction worker.",
        "Return JSON only with this shape:",
        '{"summary":"string","facts":[{"fact":"string","confidence":"low|medium|high"}],"warnings":["string"]}',
        "Only extract concrete facts and use warnings for uncertainty.",
        `Input: ${prompt}`,
      ].join("\n");
    case "general":
    default:
      return prompt;
  }
}
