import type { BuildContextForTaskResult, MemoryKind, RetrievalMode, SearchMemoryItem } from "../types.js";

export function buildContextFromItems(input: {
  readonly task: string;
  readonly mode: RetrievalMode;
  readonly items: readonly SearchMemoryItem[];
  readonly maxItems: number;
  readonly maxChars: number;
  readonly degraded: boolean;
}): BuildContextForTaskResult {
  if (input.mode === "profile") {
    return buildProfileContext(input);
  }

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

/**
 * Order for profile-mode rendering: identity and commitments before references and work,
 * with chat-derived memories last (usually noisier for a stable profile snapshot).
 */
const PROFILE_KIND_ORDER: readonly MemoryKind[] = [
  "fact",
  "decision",
  "doc",
  "task",
  "conversation",
];

const PROFILE_SECTION_TITLE: Record<MemoryKind, string> = {
  fact: "Facts",
  decision: "Decisions",
  doc: "Documents",
  task: "Tasks",
  conversation: "Conversation",
};

function profileKindRank(kind: MemoryKind): number {
  const idx = PROFILE_KIND_ORDER.indexOf(kind);
  return idx === -1 ? PROFILE_KIND_ORDER.length : idx;
}

/** Kind-priority order, stable within the same kind (retrieval order preserved). */
function orderItemsForProfile(items: readonly SearchMemoryItem[]): SearchMemoryItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = profileKindRank(a.item.kind) - profileKindRank(b.item.kind);
      if (diff !== 0) {
        return diff;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function buildProfileContext(input: {
  readonly task: string;
  readonly items: readonly SearchMemoryItem[];
  readonly maxItems: number;
  readonly maxChars: number;
  readonly degraded: boolean;
}): BuildContextForTaskResult {
  const selectedItems: SearchMemoryItem[] = [];
  let truncated = false;
  let context = `Task: ${input.task}\n\n${preambleForMode("profile")}`;
  const ordered = orderItemsForProfile(input.items.slice(0, input.maxItems));

  let currentKind: MemoryKind | null = null;

  for (const item of ordered) {
    let section = "";
    if (item.kind !== currentKind) {
      currentKind = item.kind;
      section = `\n${PROFILE_SECTION_TITLE[item.kind]}:\n`;
    }
    section += `- ${item.summary ?? item.content}\n`;

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

function formatItemForMode(mode: Exclude<RetrievalMode, "profile">, item: SearchMemoryItem): string {
  switch (mode) {
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
