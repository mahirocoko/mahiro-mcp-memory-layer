/** Max tokens pulled from the query for DB-side lexical prefiltering (bounds SQL size). */
export const maxLexicalPrefilterTokens = 12;

/** Minimum token length for prefiltering (avoids ultra-noisy single-character scans). */
export const minLexicalPrefilterTokenLength = 2;

/**
 * Tokens used to widen keyword-leg candidate coverage via a scoped SQL prefilter.
 * Aligned with `evaluateKeywordMatch` word splitting (`[\p{L}\p{N}_]+`), case-insensitive deduped.
 */
export function extractLexicalTokensForCandidateQuery(query: string): readonly string[] {
  const words = query.match(/[\p{L}\p{N}_]+/gu)?.filter((word) => word.length >= minLexicalPrefilterTokenLength) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();

    if (seen.has(lower)) {
      continue;
    }

    seen.add(lower);
    out.push(lower);

    if (out.length >= maxLexicalPrefilterTokens) {
      break;
    }
  }

  return out;
}
