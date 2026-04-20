export function extractInteractiveGeminiResponse(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line?.startsWith("✦ ")) {
      return line.slice(2).trim();
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const modelPrefix = "Model:";
    if (line.startsWith(modelPrefix)) {
      return line.slice(modelPrefix.length).trim();
    }
  }

  return lines.at(-1) ?? "";
}
