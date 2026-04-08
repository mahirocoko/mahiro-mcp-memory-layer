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
    const firstInRun = run[0];

    if (!firstInRun) {
      continue;
    }

    const kind = firstInRun.kind;
    const entries: ProfileDedupEntry[] = run.map((item, indexInKind) => {
      const line = extractProfileStatement(item);
      return { item, line, key: profileStatementDedupKey(line), indexInKind };
    });
    const deduped = resolveProfilePrefixConflicts(dedupeProfileEntriesForKind(entries));
    if (deduped.length === 0) {
      continue;
    }

    const header = `\n${PROFILE_SECTION_TITLE[kind]}:\n`;

    for (let i = 0; i < deduped.length; i++) {
      const d = deduped[i];

      if (!d) {
        continue;
      }

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

type ProfileDedupEntry = {
  readonly item: SearchMemoryItem;
  readonly line: string;
  readonly key: string;
  /** Order within this kind run (retrieval order); used for conflict tie-breaks. */
  readonly indexInKind: number;
};

/** Minimum shared prefix length (words) before a divergent tail counts as a supersede-style conflict. */
const PROFILE_CONFLICT_MIN_SHARED_WORDS = 3;

/**
 * True when two normalized keys agree on a short shared prefix then disagree on the next word
 * (not one extending the other). Catches "… is Postgres …" vs "… is SQLite …" without indexing changes.
 */
function profileKeysConflictAtDivergence(a: string, b: string): boolean {
  if (a === b) {
    return false;
  }
  const wa = profileKeyWords(a);
  const wb = profileKeyWords(b);
  let i = 0;
  while (i < wa.length && i < wb.length && wa[i] === wb[i]) {
    i++;
  }
  if (i < PROFILE_CONFLICT_MIN_SHARED_WORDS) {
    return false;
  }
  if (i === wa.length || i === wb.length) {
    return false;
  }
  return wa[i] !== wb[i];
}

/**
 * Cluster lines that pairwise diverge after a shared prefix; within each cluster, keep the newer /
 * stronger statement. Ordering: createdAt (newer wins), then importance, then later position within
 * the kind run (retrieval order).
 */
function resolveProfilePrefixConflicts(entries: readonly ProfileDedupEntry[]): ProfileDedupEntry[] {
  const n = entries.length;
  if (n < 2) {
    return [...entries];
  }

  const parent = Array.from({ length: n }, (_, idx) => idx);
  function find(x: number): number {
    const current = parent[x];

    if (current === undefined) {
      return x;
    }

    if (current !== x) {
      parent[x] = find(current);
    }

    return parent[x] ?? x;
  }
  function union(x: number, y: number): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) {
      parent[rx] = ry;
    }
  }

  for (let i = 0; i < n; i++) {
    const left = entries[i];

    if (!left) {
      continue;
    }

    for (let j = i + 1; j < n; j++) {
      const right = entries[j];

      if (!right) {
        continue;
      }

      if (profileKeysConflictAtDivergence(left.key, right.key)) {
        union(i, j);
      }
    }
  }

  const rootToIndices = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = rootToIndices.get(r);
    if (list) {
      list.push(i);
    } else {
      rootToIndices.set(r, [i]);
    }
  }

  const loserIds = new Set<string>();
  for (const indices of rootToIndices.values()) {
    if (indices.length < 2) {
      continue;
    }
    let winnerIdx = indices[0];

    if (winnerIdx === undefined) {
      continue;
    }

    for (let k = 1; k < indices.length; k++) {
      const candidateIndex = indices[k];

      if (candidateIndex === undefined) {
        continue;
      }

      const cand = entries[candidateIndex];
      const win = entries[winnerIdx];

      if (!cand || !win) {
        continue;
      }

      if (compareProfileConflictPreference(cand, win) < 0) {
        winnerIdx = candidateIndex;
      }
    }
    for (const idx of indices) {
      const entry = entries[idx];

      if (idx !== winnerIdx && entry) {
        loserIds.add(entry.item.id);
      }
    }
  }

  return entries.filter((e) => !loserIds.has(e.item.id));
}

/** Negative if `a` should win over `b` (prefer newer / stronger). */
function compareProfileConflictPreference(a: ProfileDedupEntry, b: ProfileDedupEntry): number {
  const ta = Date.parse(a.item.createdAt);
  const tb = Date.parse(b.item.createdAt);
  const na = Number.isNaN(ta) ? 0 : ta;
  const nb = Number.isNaN(tb) ? 0 : tb;
  if (na !== nb) {
    return nb - na;
  }
  if (a.item.importance !== b.item.importance) {
    return b.item.importance - a.item.importance;
  }
  return b.indexInKind - a.indexInKind;
}

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

      if (!prev) {
        continue;
      }

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
  const first = ordered[0];

  if (!first) {
    return [];
  }

  let currentKind = first.kind;
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
