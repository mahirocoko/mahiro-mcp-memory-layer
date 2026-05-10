import type {
  MemorySaveRecommendation,
  MemorySuggestionCandidate,
  SuggestMemoryCandidatesInput,
  SuggestMemoryCandidatesResult,
} from "../types.js";

interface Rule {
  readonly id: string;
  readonly kind: MemorySuggestionCandidate["kind"];
  readonly test: (line: string) => boolean;
  readonly reason: string;
  readonly confidence: MemorySuggestionCandidate["confidence"];
}

const MAX_CANDIDATES_DEFAULT = 5;
const MAX_CANDIDATES_CAP = 10;
const LINE_MIN_LEN = 12;
const MAX_DRAFT_LEN = 800;

const TOOL_ECHO_LABEL_PATTERN =
  /^(?:[-*+]\s*)?(?:content|draft\s*content|recommendation|reason|signals?|candidates?|review\s*only\s*suggestions|auto\s*saved|returned\s*memory\s*ids|retrieval|wiki|tool(?:\s+output)?)\s*:/i;
const DIAGRAM_FRAGMENT_PATTERN = /^(?:[-*+]\s*)?(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|participant)\b/i;

const EPHEMERAL_RULES: readonly { readonly id: string; readonly test: (text: string) => boolean }[] = [
  { id: "greeting", test: (t) => /^(?:hi|hello|hey)\b/i.test(t.trim()) },
  { id: "thanks_only", test: (t) => /^(?:thanks|thank you|thx)\b/i.test(t.trim()) && t.length < 80 },
  { id: "short_ack", test: (t) => t.length < 24 && /^ok\.?$/i.test(t.trim()) },
];

const RULES: readonly Rule[] = [
  {
    id: "decision_phrase",
    kind: "decision",
    test: (line) =>
      /\b(?:we|i)\s+(?:decided|agreed|chose)\b/i.test(line) &&
      /\b(?:that|to|on|against)\b/i.test(line),
    reason: "Explicit decision language (decided/agreed/chose).",
    confidence: "high",
  },
  {
    id: "preference",
    kind: "conversation",
    test: (line) =>
      /\b(?:i|we)\s+prefer\b/i.test(line) || /\bfrom\s+now\s+on\b/i.test(line),
    reason: "Stated preference or ongoing convention.",
    confidence: "high",
  },
  {
    id: "always_never_policy",
    kind: "conversation",
    test: (line) =>
      /\b(?:always|never)\s+(?:use|run|call|prefer|ship|merge)\b/i.test(line) ||
      /\b(?:do not|don't)\s+(?:use|run|commit)\b/i.test(line),
    reason: "Prescriptive rule (always/never/don't).",
    confidence: "medium",
  },
  {
    id: "remember_note",
    kind: "fact",
    test: (line) => /\bremember\s+(?:that\s+)?/i.test(line) || /\bimportant:\s*/i.test(line),
    reason: "Explicit remember/important marker.",
    confidence: "high",
  },
  {
    id: "stable_fact",
    kind: "fact",
    test: (line) =>
      /\b(?:the\s+)?default\s+(?:is|for)\b/i.test(line) ||
      /\b(?:api\s+key|endpoint|repo|branch)\s+(?:is|uses|points)\b/i.test(line),
    reason: "Looks like a stable configuration or factual anchor.",
    confidence: "medium",
  },
  {
    id: "task_followup",
    kind: "task",
    test: (line) =>
      /\b(?:todo|follow[-\s]?up|next\s+step|action\s+item)\b/i.test(line) && line.length >= LINE_MIN_LEN,
    reason: "Tracked task or follow-up language.",
    confidence: "medium",
  },
];

function normalizeConversation(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function isRecursiveNoiseLine(line: string): boolean {
  const trimmed = line.trim();

  return (
    TOOL_ECHO_LABEL_PATTERN.test(trimmed) ||
    DIAGRAM_FRAGMENT_PATTERN.test(trimmed) ||
    /^[-*+]\s*(?:strong_candidate|consider_saving|likely_skip)\b/i.test(trimmed) ||
    /^\|.*\b(?:content|recommendation|candidate|retrieval|wiki|tool)\b.*\|$/i.test(trimmed)
  );
}

function splitLines(text: string): readonly string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= LINE_MIN_LEN && !isRecursiveNoiseLine(line));
}

function suggestScope(input: SuggestMemoryCandidatesInput): MemorySuggestionCandidate["scope"] {
  if (input.projectId || input.containerId) {
    return "project";
  }
  return "global";
}

function trimDraft(line: string): string {
  const oneLine = line.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_DRAFT_LEN) {
    return oneLine;
  }
  return `${oneLine.slice(0, MAX_DRAFT_LEN - 1)}…`;
}

function collectSignalTags(text: string): {
  durable: string[];
  ephemeral: string[];
} {
  const durable: string[] = [];
  const ephemeral: string[] = [];

  const lower = text.toLowerCase();
  if (/\b(?:decided|agreed|chose|prefer|remember\s+that|important:)\b/i.test(text)) {
    durable.push("explicit_durable_language");
  }
  if (/\b(?:always|never|from\s+now\s+on)\b/i.test(lower)) {
    durable.push("rule_style_language");
  }

  for (const rule of EPHEMERAL_RULES) {
    if (rule.test(text)) {
      ephemeral.push(rule.id);
    }
  }

  if (text.length < 40 && !/[.!?]/.test(text) && durable.length === 0) {
    ephemeral.push("very_short_turn");
  }

  return { durable: [...new Set(durable)], ephemeral: [...new Set(ephemeral)] };
}

function pickRecommendation(
  candidates: readonly MemorySuggestionCandidate[],
  signals: { durable: readonly string[]; ephemeral: readonly string[] },
): MemorySaveRecommendation {
  if (candidates.length === 0) {
    return "likely_skip";
  }

  const hasHigh = candidates.some((c) => c.confidence === "high");
  if (hasHigh) {
    return "strong_candidate";
  }

  const ephemeralHeavy = signals.ephemeral.length >= 2 && signals.durable.length === 0;
  if (ephemeralHeavy && candidates.every((c) => c.confidence === "low")) {
    return "likely_skip";
  }

  return "consider_saving";
}

/**
 * Heuristic, deterministic extraction of memory candidates from conversation text.
 * Intended for agent loops: call before `remember` to decide whether persistence is warranted.
 */
export function suggestMemoryCandidates(input: SuggestMemoryCandidatesInput): SuggestMemoryCandidatesResult {
  const conversation = normalizeConversation(input.conversation);
  const maxRaw = input.maxCandidates ?? MAX_CANDIDATES_DEFAULT;
  const max = Math.min(Math.max(1, maxRaw), MAX_CANDIDATES_CAP);

  const signals = collectSignalTags(conversation);
  const scope = suggestScope(input);

  if (!conversation) {
    return {
      recommendation: "likely_skip",
      signals,
      candidates: [],
    };
  }

  const lines = splitLines(conversation);
  const candidates: MemorySuggestionCandidate[] = [];
  const seen = new Set<string>();

  outer: for (const line of lines) {
    for (const rule of RULES) {
      if (!rule.test(line)) {
        continue;
      }
      const draft = trimDraft(line);
      const key = `${rule.kind}:${draft.slice(0, 120)}`;
      if (seen.has(key)) {
        continue outer;
      }
      seen.add(key);
      candidates.push({
        kind: rule.kind,
        scope,
        reason: rule.reason,
        draftContent: draft,
        confidence: rule.confidence,
      });
      if (candidates.length >= max) {
        break outer;
      }
      continue outer;
    }
  }

  const recommendation = pickRecommendation(candidates, signals);

  return {
    recommendation,
    signals,
    candidates,
  };
}
