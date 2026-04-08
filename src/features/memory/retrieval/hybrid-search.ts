import { defaultKeywordCandidateLimit, defaultSearchLimit, defaultVectorCandidateLimit } from "../constants.js";
import { dedupeSearchItems } from "./dedupe.js";
import { evaluateKeywordMatch, scoreCombined, scoreRecency, scoreVectorMatch, toSearchMemoryItem, weightsForMode } from "./rank.js";
import type { EmbeddingProvider } from "../index/embedding-provider.js";
import type { MemoryRecordsTable } from "../index/memory-records-table.js";
import type { RetrievalRow, RetrievalTraceEntry, ScopeFilter, SearchMemoriesInput, SearchMemoriesResult } from "../types.js";
import { newId } from "../../../lib/ids.js";
import { nowIso, toTimestamp } from "../lib/time.js";

export async function runHybridSearch(input: {
  readonly search: SearchMemoriesInput;
  readonly filter: ScopeFilter;
  readonly table: MemoryRecordsTable;
  readonly embeddingProvider: EmbeddingProvider;
}): Promise<{ readonly result: SearchMemoriesResult; readonly trace: RetrievalTraceEntry }> {
  const limit = input.search.limit ?? defaultSearchLimit;
  const weights = weightsForMode(input.search.mode);
  let queryVector: readonly number[] | undefined;

  try {
    queryVector = await input.embeddingProvider.embedText(input.search.query);
  } catch {
    queryVector = undefined;
  }

  const degraded = queryVector === undefined;
  const keywordLimit = Math.max(limit * 4, defaultKeywordCandidateLimit);
  const [keywordBaseline, keywordLexical, vectorRows] = await Promise.all([
    input.table.queryScopedRows(input.filter, keywordLimit),
    input.table.queryScopedLexicalCandidates(input.filter, input.search.query, keywordLimit),
    queryVector
      ? input.table.vectorSearch(input.filter, queryVector, Math.max(limit * 3, defaultVectorCandidateLimit))
      : Promise.resolve([]),
  ]);
  const keywordRows = mergeRetrievalRowsById(keywordBaseline, keywordLexical);

  const rowsById = new Map<string, {
    row: (typeof keywordRows)[number];
    reasons: Set<string>;
    score: number;
    keywordScore: number;
    keywordTieBreak: number;
    vectorScore: number;
  }>();

  for (const row of keywordRows) {
    const { scoreForFusion: keywordScore, tieBreak: keywordTieBreak } = evaluateKeywordMatch(row, input.search.query);

    if (keywordScore <= 0) {
      continue;
    }

    const vectorScore = queryVector ? scoreVectorMatch(queryVector, row.embedding) : 0;

    const combinedScore = scoreCombined({
      keyword: keywordScore,
      vector: vectorScore,
      recency: scoreRecency(row.createdAt),
      importance: row.importance,
    }, weights);

    rowsById.set(row.id, {
      row,
      reasons: new Set(["scope_match", "keyword_match"]),
      score: combinedScore,
      keywordScore,
      keywordTieBreak,
      vectorScore,
    });
  }

  for (const row of vectorRows) {
    const vectorScore = queryVector ? scoreVectorMatch(queryVector, row.embedding) : 0;

    if (vectorScore <= 0) {
      continue;
    }

    const { scoreForFusion: keywordScore, tieBreak: keywordTieBreak } = evaluateKeywordMatch(row, input.search.query);

    const combinedScore = scoreCombined({
      keyword: keywordScore,
      vector: vectorScore,
      recency: scoreRecency(row.createdAt),
      importance: row.importance,
    }, weights);
    const existing = rowsById.get(row.id);

    if (existing) {
      existing.reasons.add("semantic_match");
      existing.score = Math.max(existing.score, combinedScore);
      existing.keywordScore = Math.max(existing.keywordScore, keywordScore);
      existing.keywordTieBreak = Math.max(existing.keywordTieBreak, keywordTieBreak);
      existing.vectorScore = Math.max(existing.vectorScore, vectorScore);
      continue;
    }

    rowsById.set(row.id, {
      row,
      reasons: new Set(["scope_match", "semantic_match"]),
      score: combinedScore,
      keywordScore,
      keywordTieBreak,
      vectorScore,
    });
  }

  const items = dedupeSearchItems(
    [...rowsById.values()]
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.keywordTieBreak !== left.keywordTieBreak) {
          return right.keywordTieBreak - left.keywordTieBreak;
        }

        if (right.keywordScore !== left.keywordScore) {
          return right.keywordScore - left.keywordScore;
        }

        if (right.vectorScore !== left.vectorScore) {
          return right.vectorScore - left.vectorScore;
        }

        return toTimestamp(right.row.updatedAt) - toTimestamp(left.row.updatedAt);
      })
      .slice(0, limit)
      .map((entry) => toSearchMemoryItem(entry.row, entry.score, [...entry.reasons])),
  );

  const trace: RetrievalTraceEntry = {
    requestId: newId("req"),
    query: input.search.query,
    retrievalMode: input.search.mode,
    enforcedFilters: input.filter,
    returnedMemoryIds: items.map((item) => item.id),
    rankingReasonsById: Object.fromEntries(items.map((item) => [item.id, item.reasons])),
    contextSize: 0,
    embeddingVersion: input.embeddingProvider.version,
    indexVersion: "v0",
    degraded,
    createdAt: nowIso(),
  };

  return {
    result: {
      items,
      degraded,
    },
    trace,
  };
}

function mergeRetrievalRowsById(primary: readonly RetrievalRow[], secondary: readonly RetrievalRow[]): RetrievalRow[] {
  const map = new Map<string, RetrievalRow>();

  for (const row of primary) {
    map.set(row.id, row);
  }

  for (const row of secondary) {
    if (!map.has(row.id)) {
      map.set(row.id, row);
    }
  }

  return [...map.values()];
}
