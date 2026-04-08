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

/** Leading hedges / chat noise that weakens declarative profile lines. */
const PROFILE_DISCOURSE_PREFIX =
  /^(I think|I believe|I guess|probably|maybe|perhaps|btw|fyi:?|note:?|just fyi:?)\s+/i;

/**
 * Collapse whitespace and strip common discourse prefixes so profile bullets read as stable facts.
 * For long text or chat-derived kinds, keep the first substantive sentence to drop trailing ramble.
 */
function formatProfileItemLine(kind: MemoryKind, raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  // Strip repeatedly in case of stacked prefixes ("FYI note: ...")
  while (PROFILE_DISCOURSE_PREFIX.test(text)) {
    text = text.replace(PROFILE_DISCOURSE_PREFIX, "").trim();
  }

  const longForKind = kind === "conversation" ? text.length > 48 : text.length > 120;
  if (!longForKind) {
    return text;
  }

  const first = firstProfileSentence(text, 12);
  return first.length >= 8 ? first : text;
}

/**
 * First sentence boundary at or after `minPos` avoids splitting on "Dr. " style abbreviations at the start.
 */
function firstProfileSentence(text: string, minPos: number): string {
  const seps = [". ", "! ", "? "] as const;
  let cut = -1;
  for (const sep of seps) {
    let from = 0;
    while (true) {
      const i = text.indexOf(sep, from);
      if (i === -1) {
        break;
      }
      if (i >= minPos) {
        if (cut === -1 || i < cut) {
          cut = i + 1;
        }
        break;
      }
      from = i + sep.length;
    }
  }
  if (cut === -1) {
    return text;
  }
  return text.slice(0, cut).trim();
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
  const runs = splitOrderedIntoKindRuns(ordered);

  outer: for (const run of runs) {
    const kind = run[0].kind;
    const entries: ProfileDedupEntry[] = run.map((item) => {
      const line = extractProfileStatement(item);
      return { item, line, key: profileStatementDedupKey(line) };
    });
    const deduped = dedupeProfileEntriesForKind(entries);
    if (deduped.length === 0) {
      continue;
    }

    const header = `\n${PROFILE_SECTION_TITLE[kind]}:\n`;

    for (let i = 0; i < deduped.length; i++) {
      const d = deduped[i];
      const bullet = `- ${d.line}\n`;
      const addition = i === 0 ? header + bullet : bullet;
      if ((context + addition).length > input.maxChars) {
        truncated = true;
        break outer;
      }
      context += addition;
      selectedItems.push(d.item);
    }
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

function extractProfileStatement(item: SearchMemoryItem): string {
  let raw = normalizeProfileText(item.summary);

  if (!raw) {
    const firstLine =
      item.content.split("\n").map((line) => line.trim()).find(Boolean) ?? item.content;
    raw = normalizeProfileText(firstLine);
  }

  if (!raw) {
    return "(empty memory)";
  }

  const line = formatProfileItemLine(item.kind, raw);
  return truncateProfileStatement(line);
}

function normalizeProfileText(input: string | undefined): string {
  if (!input) {
    return "";
  }

  return input
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateProfileStatement(input: string): string {
  const maxLength = 180;

  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength - 3).trimEnd()}...`;
}

/** Minimum normalized length for prefix-style redundancy (avoids tiny substring false positives). */
const PROFILE_DEDUP_PREFIX_MIN_LEN = 8;

/** Minimum word count on the shorter line for embedding-style dedup (avoids tiny phrase false positives). */
const PROFILE_DEDUP_EMBED_MIN_WORDS = 3;

/**
 * Stable key for profile dedup: case/whitespace-insensitive, trailing punctuation stripped.
 * Profile-mode only; keeps retrieval/index unchanged.
 */
function profileStatementDedupKey(line: string): string {
  let s = line.toLowerCase().replace(/\s+/g, " ").trim();
  while (/[.!?;:]$/.test(s)) {
    s = s.slice(0, -1).trimEnd();
  }
  return s;
}

type ProfileDedupEntry = { readonly item: SearchMemoryItem; readonly line: string; readonly key: string };

function profileKeyWords(key: string): string[] {
  return key.split(/\s+/).filter(Boolean);
}

/**
 * True when `needleWords` appears as one contiguous run inside `haystackWords` (same order, token equality).
 */
function isContiguousWordSubsequence(
  needleWords: readonly string[],
  haystackWords: readonly string[],
): boolean {
  if (needleWords.length === 0 || needleWords.length > haystackWords.length) {
    return false;
  }
  outer: for (let i = 0; i <= haystackWords.length - needleWords.length; i++) {
    for (let j = 0; j < needleWords.length; j++) {
      if (haystackWords[i + j] !== needleWords[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/**
 * Shorter line is redundant when its full word sequence is embedded in a longer line (not only strict prefix),
 * e.g. "uses lancedb for local search" inside "the stack uses lancedb for local search".
 */
function shorterProfileKeyEmbedsInLonger(shorterKey: string, longerKey: string): boolean {
  if (shorterKey.length >= longerKey.length) {
    return false;
  }
  const sw = profileKeyWords(shorterKey);
  const lw = profileKeyWords(longerKey);
  if (sw.length === 0 || sw.length >= lw.length) {
    return false;
  }
  if (sw.length < PROFILE_DEDUP_EMBED_MIN_WORDS) {
    return false;
  }
  return isContiguousWordSubsequence(sw, lw);
}

/**
 * Within one kind section, drop exact duplicates (after keying) and collapse strict-prefix pairs:
 * if a longer line extends a shorter one with a space boundary ("foo" vs "foo bar"), keep one line
 * (the longer unless order dictates replacing an earlier short with a later long).
 * Also drops lines whose words form a contiguous subsequence of another line (near-duplicate embedding).
 */
function dedupeProfileEntriesForKind(entries: readonly ProfileDedupEntry[]): ProfileDedupEntry[] {
  const out: ProfileDedupEntry[] = [];

  for (const cur of entries) {
    if (out.some((prev) => prev.key === cur.key)) {
      continue;
    }

    const superseded: number[] = [];
    for (let i = 0; i < out.length; i++) {
      const prev = out[i];
      const prefixExtension =
        cur.key.length > prev.key.length &&
        prev.key.length >= PROFILE_DEDUP_PREFIX_MIN_LEN &&
        cur.key.startsWith(`${prev.key} `);
      const embedded = shorterProfileKeyEmbedsInLonger(prev.key, cur.key);
      if (prefixExtension || embedded) {
        superseded.push(i);
      }
    }
    for (const i of superseded.sort((a, b) => b - a)) {
      out.splice(i, 1);
    }

    const redundantPrefix =
      cur.key.length >= PROFILE_DEDUP_PREFIX_MIN_LEN &&
      out.some(
        (prev) =>
          prev.key.length > cur.key.length && prev.key.startsWith(`${cur.key} `),
      );
    const redundantEmbedded = out.some(
      (prev) => prev.key.length > cur.key.length && shorterProfileKeyEmbedsInLonger(cur.key, prev.key),
    );
    if (redundantPrefix || redundantEmbedded) {
      continue;
    }

    out.push(cur);
  }

  return out;
}

function splitOrderedIntoKindRuns(ordered: readonly SearchMemoryItem[]): SearchMemoryItem[][] {
  if (ordered.length === 0) {
    return [];
  }
  const runs: SearchMemoryItem[][] = [];
  let currentKind = ordered[0].kind;
  let current: SearchMemoryItem[] = [];
  for (const item of ordered) {
    if (item.kind !== currentKind) {
      runs.push(current);
      current = [];
      currentKind = item.kind;
    }
    current.push(item);
  }
  runs.push(current);
  return runs;
}
