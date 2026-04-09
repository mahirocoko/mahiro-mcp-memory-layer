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

type ProfileSnapshotSection =
  | "preferences"
  | "stableFacts"
  | "broadFacts"
  | "decisions"
  | "activeWork"
  | "notes";

const PROFILE_SNAPSHOT_LABEL: Record<ProfileSnapshotSection, string> = {
  preferences: "Preferences",
  stableFacts: "Stable Facts",
  broadFacts: "Facts",
  decisions: "Decisions",
  activeWork: "Tasks",
  notes: "Conversation",
};

const PROFILE_SNAPSHOT_EMIT_ORDER: readonly ProfileSnapshotSection[] = [
  "preferences",
  "stableFacts",
  "broadFacts",
  "decisions",
  "activeWork",
  "notes",
];

/**
 * Lightweight lexical cues for preference-style profile lines (fact/decision only).
 * Keeps retrieval/index unchanged; profile rendering only.
 */
function isPreferenceProfileLine(line: string): boolean {
  const t = line.trim();
  if (!t) {
    return false;
  }
  const lower = t.toLowerCase();
  if (/^use\s+/i.test(t)) {
    return true;
  }
  if (/\b(prefer|prefers|preferred|preferring|preference)\b/i.test(t)) {
    return true;
  }
  if (/\bstandardize\s+on\b/.test(lower)) {
    return true;
  }
  if (/\bdefault(s)?\s+to\b/.test(lower)) {
    return true;
  }
  if (/\brather\s+than\b/.test(lower)) {
    return true;
  }
  if (/\binstead\s+of\b/.test(lower)) {
    return true;
  }
  if (/\bopt(s|ed)?\s+for\b/.test(lower)) {
    return true;
  }
  if (/\b(favor|favour)s?\b/.test(lower)) {
    return true;
  }
  if (/\b(always|never)\s+use\b/.test(lower)) {
    return true;
  }
  if (/\bavoid\s+[a-z0-9]/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Heuristic: lines that read like durable project truths (declarative subject/predicate or stack/repo cues).
 * Negative filters drop questions, links, and scratch-pad noise. Profile rendering only.
 */
function isStableFactProfileLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 16) {
    return false;
  }
  if (/\?/.test(t)) {
    return false;
  }
  if (/https?:\/\//i.test(t)) {
    return false;
  }
  if (/\b(todo|fixme)\b/i.test(t)) {
    return false;
  }
  if (/^see\s+/i.test(t)) {
    return false;
  }
  const lower = t.toLowerCase();
  if (/\b(is|are|was|were)\s+/.test(lower)) {
    return true;
  }
  if (/^(the|this|our)\s+[\w'-]+\s+(uses|runs|stores|keeps|targets)\b/i.test(t)) {
    return true;
  }
  if (/^[a-z][\w-]*\s+(uses|runs|stores|keeps|targets|powers|supports|provides)\b/i.test(lower)) {
    return true;
  }
  if (/^uses\s+/i.test(t)) {
    return true;
  }
  if (/^(repository|project|codebase|stack|service|the\s+stack)\b/i.test(t)) {
    return true;
  }
  if (/\b(canonical|default)\s+(is|for|format|store)\b/.test(lower)) {
    return true;
  }
  return false;
}

function partitionProfileEntriesByPreference(
  entries: readonly ProfileDedupEntry[],
): { readonly main: ProfileDedupEntry[]; readonly preference: ProfileDedupEntry[] } {
  const main: ProfileDedupEntry[] = [];
  const preference: ProfileDedupEntry[] = [];
  for (const e of entries) {
    if (isPreferenceProfileLine(e.line)) {
      preference.push(e);
    } else {
      main.push(e);
    }
  }
  return { main, preference };
}

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

function emptyProfileSnapshotBuckets(): Record<ProfileSnapshotSection, ProfileDedupEntry[]> {
  return {
    preferences: [],
    stableFacts: [],
    broadFacts: [],
    decisions: [],
    activeWork: [],
    notes: [],
  };
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
  const buckets = emptyProfileSnapshotBuckets();

  for (const run of runs) {
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

    switch (kind) {
      case "fact": {
        const { main, preference } = partitionProfileEntriesByPreference(deduped);
        for (const e of main) {
          if (isStableFactProfileLine(e.line)) {
            buckets.stableFacts.push(e);
          } else {
            buckets.broadFacts.push(e);
          }
        }
        buckets.preferences.push(...preference);
        break;
      }
      case "decision": {
        const { main, preference } = partitionProfileEntriesByPreference(deduped);
        buckets.decisions.push(...main);
        buckets.preferences.push(...preference);
        break;
      }
      case "doc": {
        const { main, preference } = partitionProfileEntriesByPreference(deduped);
        for (const e of main) {
          if (isStableFactProfileLine(e.line)) {
            buckets.stableFacts.push(e);
          } else {
            buckets.broadFacts.push(e);
          }
        }
        buckets.preferences.push(...preference);
        break;
      }
      case "task":
        buckets.activeWork.push(...deduped);
        break;
      case "conversation":
        buckets.notes.push(...deduped);
        break;
    }
  }

  buckets.preferences = finalizeProfileSectionEntries(buckets.preferences);
  buckets.stableFacts = finalizeProfileSectionEntries(buckets.stableFacts);
  buckets.broadFacts = finalizeProfileSectionEntries(buckets.broadFacts);

  outer: for (const section of PROFILE_SNAPSHOT_EMIT_ORDER) {
    const list = buckets[section];

    for (let i = 0; i < list.length; i++) {
      const d = list[i];

      if (!d) {
        continue;
      }

      const header = `\n${PROFILE_SNAPSHOT_LABEL[section]}:\n`;
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
const PROFILE_CONFLICT_MIN_SHARED_WORDS = 2;

/**
 * True when two normalized keys agree on a short shared prefix then disagree on the next word
 * (not one extending the other). Catches "… is Postgres …" vs "… is SQLite …" without indexing changes.
 */
function profileKeysConflictAtDivergence(a: string, b: string): boolean {
  if (a === b) {
    return false;
  }
  const wa = significantProfileWords(a);
  const wb = significantProfileWords(b);
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
  return key
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter(Boolean);
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

/**
 * Stopwords for evidence overlap only (profile rendering). Keeps short proper nouns/tool names.
 */
const PROFILE_AGG_STOPWORDS = new Set([
  "the",
  "and",
  "but",
  "for",
  "not",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "with",
  "from",
  "into",
  "onto",
  "over",
  "under",
  "than",
  "that",
  "this",
  "these",
  "those",
  "then",
  "them",
  "they",
  "their",
  "there",
  "here",
  "what",
  "when",
  "where",
  "which",
  "while",
  "about",
  "after",
  "before",
  "between",
  "because",
  "also",
  "just",
  "only",
  "very",
  "such",
  "same",
  "some",
  "any",
  "all",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "our",
  "your",
  "its",
  "his",
  "her",
  "she",
  "him",
  "you",
  "how",
  "why",
  "who",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "may",
  "might",
  "must",
]);

function significantProfileWords(key: string): string[] {
  return profileKeyWords(key).filter((w) => w.length >= 3 && !PROFILE_AGG_STOPWORDS.has(w));
}

/**
 * True when two lines look like rephrased supporting evidence for the same preference/fact
 * (high overlap on significant words), but not a supersede-style conflict or strict duplicate.
 * Profile formatting only; no retrieval/index changes.
 */
function profileLinesAreSupportingEvidence(a: ProfileDedupEntry, b: ProfileDedupEntry): boolean {
  if (a.key === b.key) {
    return false;
  }
  if (profileKeysConflictAtDivergence(a.key, b.key)) {
    return false;
  }
  if (shorterProfileKeyEmbedsInLonger(a.key, b.key) || shorterProfileKeyEmbedsInLonger(b.key, a.key)) {
    return false;
  }

  const wa = significantProfileWords(a.key);
  const wb = significantProfileWords(b.key);
  if (wa.length < 2 || wb.length < 2) {
    return false;
  }

  const setA = new Set(wa);
  const setB = new Set(wb);
  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) {
      inter++;
    }
  }
  const union = setA.size + setB.size - inter;
  if (union === 0) {
    return false;
  }
  const jaccard = inter / union;
  if (jaccard < 0.4) {
    return false;
  }
  if (inter < 2) {
    return false;
  }
  if (Math.min(setA.size, setB.size) >= 5 && inter < 3) {
    return false;
  }
  return true;
}

/** Prefer the more informative line, then newer / stronger memory. */
function pickBetterEvidenceRepresentative(a: ProfileDedupEntry, b: ProfileDedupEntry): ProfileDedupEntry {
  if (a.key.length !== b.key.length) {
    return a.key.length > b.key.length ? a : b;
  }
  return compareProfileConflictPreference(a, b) < 0 ? b : a;
}

/**
 * Collapse rephrased supporting lines into one bullet per cluster (greedy, first-match wins).
 * Order within the section is preserved for representatives.
 */
function aggregateSupportingProfileEvidence(entries: readonly ProfileDedupEntry[]): ProfileDedupEntry[] {
  const out: ProfileDedupEntry[] = [];

  for (const cur of entries) {
    let merged = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[i];

      if (!prev) {
        continue;
      }

      if (profileLinesAreSupportingEvidence(prev, cur)) {
        out[i] = pickBetterEvidenceRepresentative(prev, cur);
        merged = true;
        break;
      }
    }
    if (!merged) {
      out.push(cur);
    }
  }

  return out;
}

/**
 * Cross-kind-run cleanup for profile sections: dedupe again at section scope, then merge
 * rephrased supporting statements (evidence overlap) into a single representative bullet.
 */
function finalizeProfileSectionEntries(entries: readonly ProfileDedupEntry[]): ProfileDedupEntry[] {
  const deduped = dedupeProfileEntriesForKind(entries);
  return aggregateSupportingProfileEvidence(deduped);
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
