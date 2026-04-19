const interactiveRuntimeCaptureHistoryLines = 200;

export function getInteractiveRuntimeCaptureHistoryLines(): number {
  return interactiveRuntimeCaptureHistoryLines;
}

export function extractInteractiveGeminiResponse(pane: string): string | undefined {
  const normalizedPane = stripAnsiCodes(pane).replace(/\r/g, "");
  const lines = normalizedPane.split("\n");
  const modelLineIndex = lines.findIndex((line) => line.startsWith("Model:"));

  if (modelLineIndex < 0) {
    return undefined;
  }

  const responseLines: string[] = [];

  for (const line of lines.slice(modelLineIndex)) {
    if (line.startsWith("Model:")) {
      const inlineResponse = line.replace(/^Model:\s*/, "").trim();
      if (inlineResponse.length > 0) {
        responseLines.push(inlineResponse);
      }
      continue;
    }

    if (
      line.startsWith("You are currently in screen reader-friendly view.")
      || line.startsWith("Do you trust the files in this folder?")
      || line.startsWith("Trusting a folder allows Gemini CLI")
      || /^~\/.+·/.test(line)
      || /^\(checked\)\s+1\./.test(line)
      || /^\d+\.\s/.test(line)
    ) {
      break;
    }

    if (line.trim().length === 0) {
      if (responseLines.length > 0) {
        break;
      }
      continue;
    }

    responseLines.push(line.trim());
  }

  const response = responseLines.join("\n").trim();
  return response.length > 0 ? response : undefined;
}

export function buildInteractiveSessionName(taskId: string): string {
  const normalizedTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "gemini";
  return `mahiro-gemini-${normalizedTaskId}`;
}

export function shellEscapeArg(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripAnsiCodes(input: string): string {
  return input.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}
