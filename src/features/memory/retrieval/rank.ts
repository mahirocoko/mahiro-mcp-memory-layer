import type { MemoryRecord, RetrievalMode, RetrievalRow, SearchMemoryItem } from "../types.js";

import { nowIso, toTimestamp } from "../lib/time.js";

const indexVersion = "v0";

export interface RetrievalWeights {
  readonly keyword: number;
  readonly vector: number;
  readonly recency: number;
  readonly importance: number;
}

export function toRetrievalRow(record: MemoryRecord, embedding: readonly number[], embeddingVersion: string): RetrievalRow {
  return {
    id: record.id,
    content: record.content,
    summary: record.summary ?? "",
    embedding,
    kind: record.kind,
    scope: record.scope,
    userId: record.userId ?? "",
    projectId: record.projectId ?? "",
    containerId: record.containerId ?? "",
    sessionId: record.sessionId ?? "",
    importance: record.importance,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
    sourceType: record.source.type,
    sourceUri: record.source.uri ?? "",
    sourceTitle: record.source.title ?? "",
    tags: JSON.stringify(record.tags),
    embeddingVersion,
    indexVersion,
  };
}

export function toSearchMemoryItem(
  row: RetrievalRow,
  score: number,
  reasons: readonly string[],
): SearchMemoryItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    summary: row.summary || undefined,
    score,
    reasons,
    createdAt: row.createdAt,
    importance: row.importance,
    source: {
      type: (row.sourceType || "system") as SearchMemoryItem["source"]["type"],
      uri: row.sourceUri || undefined,
      title: row.sourceTitle || undefined,
    },
  };
}

/** Split camelCase / snake_case runs so "requestId" can match "request_id" / "request id". */
function decomposeIdentifierWord(word: string): readonly string[] {
  const withSpaces = word
    .replace(/_/g, " ")
    .replace(/([0-9])([a-z])/gi, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

  return withSpaces
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function wordMatchesHaystack(haystack: string, word: string): boolean {
  const lower = word.toLowerCase();

  if (lower.length === 0) {
    return false;
  }

  if (haystack.includes(lower)) {
    return true;
  }

  const parts = decomposeIdentifierWord(word);

  if (parts.length <= 1) {
    return false;
  }

  return parts.every((part) => haystack.includes(part));
}

function queryWordsAppearInOrder(haystackNorm: string, wordsLower: readonly string[]): boolean {
  let idx = 0;

  for (const w of wordsLower) {
    const found = haystackNorm.indexOf(w, idx);

    if (found < 0) {
      return false;
    }

    idx = found + w.length;
  }

  return true;
}

export interface KeywordMatchEvaluation {
  /** Bounded [0,1] for use inside `scoreCombined`. */
  readonly scoreForFusion: number;
  /** Lexical ordering hint when fusion scores tie (not capped). */
  readonly tieBreak: number;
}

export function evaluateKeywordMatch(row: RetrievalRow, query: string): KeywordMatchEvaluation {
  const haystack = `${row.content}\n${row.summary}\n${row.tags}`.toLowerCase();
  const words = query.match(/[\p{L}\p{N}_]+/gu)?.filter((word) => word.length > 0) ?? [];

  if (words.length === 0) {
    return { scoreForFusion: 0, tieBreak: 0 };
  }

  const matches = words.filter((word) => wordMatchesHaystack(haystack, word)).length;
  const coverage = matches / words.length;

  const haystackNorm = haystack.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const queryNorm = query
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  let phraseBonus = 0;

  if (queryNorm.length >= 6 && haystackNorm.includes(queryNorm)) {
    phraseBonus = 0.12;
  }

  const wordsLower = words.map((w) => w.toLowerCase());
  const literalsAllInHaystack = wordsLower.every((w) => haystack.includes(w));
  const orderBonus =
    words.length >= 2 && literalsAllInHaystack && queryWordsAppearInOrder(haystackNorm, wordsLower) ? 0.08 : 0;

  const scoreForFusion = Math.min(1, coverage + phraseBonus + orderBonus);
  const tieBreak = matches * 10_000 + coverage * 1000 + (phraseBonus > 0 ? 100 : 0) + (orderBonus > 0 ? 10 : 0);

  return { scoreForFusion, tieBreak };
}

export function scoreKeywordMatch(row: RetrievalRow, query: string): number {
  return evaluateKeywordMatch(row, query).scoreForFusion;
}

export function scoreVectorMatch(queryVector: readonly number[], rowVector: readonly number[]): number {
  if (queryVector.length === 0 || rowVector.length === 0 || queryVector.length !== rowVector.length) {
    return 0;
  }

  let dotProduct = 0;

  for (let index = 0; index < queryVector.length; index += 1) {
    dotProduct += (queryVector[index] ?? 0) * (rowVector[index] ?? 0);
  }

  return Math.max(0, dotProduct);
}

export function scoreRecency(createdAt: string): number {
  const ageMs = Math.max(0, toTimestamp(nowIso()) - toTimestamp(createdAt));
  const dayMs = 24 * 60 * 60 * 1000;

  return 1 / (1 + ageMs / dayMs);
}

export function weightsForMode(mode: RetrievalMode): RetrievalWeights {
  switch (mode) {
    case "profile":
      return {
        keyword: 0.2,
        vector: 0.15,
        recency: 0.1,
        importance: 0.55,
      };
    case "query":
      return {
        keyword: 0.4,
        vector: 0.4,
        recency: 0.1,
        importance: 0.1,
      };
    case "recent":
      return {
        keyword: 0.2,
        vector: 0.15,
        recency: 0.55,
        importance: 0.1,
      };
    case "full":
      return {
        keyword: 0.35,
        vector: 0.3,
        recency: 0.2,
        importance: 0.15,
      };
  }
}

export function scoreCombined(input: {
  readonly keyword: number;
  readonly vector: number;
  readonly recency: number;
  readonly importance: number;
}, weights: RetrievalWeights): number {
  return (
    input.keyword * weights.keyword +
    input.vector * weights.vector +
    input.recency * weights.recency +
    input.importance * weights.importance
  );
}
