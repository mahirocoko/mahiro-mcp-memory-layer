import type { BuildContextForTaskResult, RetrievalMode, SearchMemoryItem } from "../types.js";

export function buildContextFromItems(input: {
  readonly task: string;
  readonly mode: RetrievalMode;
  readonly items: readonly SearchMemoryItem[];
  readonly maxItems: number;
  readonly maxChars: number;
  readonly degraded: boolean;
}): BuildContextForTaskResult {
  const selectedItems: SearchMemoryItem[] = [];
  let truncated = false;
  let context = `Task: ${input.task}\n\n${preambleForMode(input.mode)}`;

  for (const item of input.items.slice(0, input.maxItems)) {
    const section = `${formatItemForMode(input.mode, item)}\n`;

    if ((context + section).length > input.maxChars) {
      truncated = true;
      break;
    }

    context += section;
    selectedItems.push(item);
  }

  return {
    context,
    items: selectedItems.map((item) => item.id),
    truncated,
    degraded: input.degraded,
  };
}

function preambleForMode(mode: RetrievalMode): string {
  switch (mode) {
    case "profile":
      return "Key user/project context:\n";
    case "recent":
      return "Recent activity:\n";
    case "query":
    case "full":
      return "Relevant memories:\n";
  }
}

function formatItemForMode(mode: RetrievalMode, item: SearchMemoryItem): string {
  switch (mode) {
    case "profile":
      return `- [${item.kind}] ${item.summary ?? item.content}`;
    case "recent":
      return `- [${item.kind} · ${formatShortDate(item.createdAt)}] ${item.content}`;
    case "query":
    case "full":
      return `- [${item.kind}] ${item.content}`;
  }
}

function formatShortDate(input: string): string {
  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    return input;
  }

  return date.toISOString().slice(0, 16).replace("T", " ");
}
