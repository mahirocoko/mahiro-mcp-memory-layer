import { describe, expect, it } from "vitest";

import {
  evaluateKeywordMatch,
  scoreCombined,
  scoreKeywordMatch,
  weightsForMode,
} from "../src/features/memory/retrieval/rank.js";
import type { RetrievalRow } from "../src/features/memory/types.js";

function textRow(content: string, summary = "", tags = "[]"): RetrievalRow {
  return {
    id: "mem-test",
    content,
    summary,
    embedding: [],
    kind: "fact",
    scope: "project",
    userId: "",
    projectId: "",
    containerId: "",
    sessionId: "",
    importance: 0.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceType: "manual",
    sourceUri: "",
    sourceTitle: "",
    tags,
    embeddingVersion: "",
    indexVersion: "v0",
  };
}

describe("retrieval rank helpers", () => {
  it("applies weight profiles correctly", () => {
    const input = {
      keyword: 0.2,
      vector: 0.4,
      recency: 0.6,
      importance: 0.8,
    };

    const fullScore = scoreCombined(input, weightsForMode("full"));
    const recentScore = scoreCombined(input, weightsForMode("recent"));

    expect(fullScore).toBeCloseTo(0.43);
    expect(recentScore).toBeCloseTo(0.51);
    expect(recentScore).toBeGreaterThan(fullScore);
  });

  it("returns distinct weight profiles for each mode", () => {
    const modes = ["profile", "query", "full", "recent"] as const;
    const entries = modes.map((mode) => [mode, weightsForMode(mode)] as const);

    for (const [, weights] of entries) {
      expect(weights.keyword + weights.vector + weights.recency + weights.importance).toBeCloseTo(1);
    }

    expect(entries.map(([, weights]) => JSON.stringify(weights))).toEqual([
      '{"keyword":0.2,"vector":0.15,"recency":0.1,"importance":0.55}',
      '{"keyword":0.4,"vector":0.4,"recency":0.1,"importance":0.1}',
      '{"keyword":0.35,"vector":0.3,"recency":0.2,"importance":0.15}',
      '{"keyword":0.2,"vector":0.15,"recency":0.55,"importance":0.1}',
    ]);
  });

  it("treats camelCase query tokens as matching snake_case / spaced identifiers in content", () => {
    const row = textRow("We validate request_id on every inbound hook before persistence.");
    const identifierScore = scoreKeywordMatch(row, "requestId hardening");
    const genericScore = scoreKeywordMatch(
      textRow("General API safeguards without identifier talk."),
      "requestId hardening",
    );

    expect(identifierScore).toBeGreaterThanOrEqual(0.5);
    expect(identifierScore).toBeGreaterThan(genericScore);
  });

  it("ranks in-order multi-token mentions above same tokens scattered (tie-break)", () => {
    const query = "store split rationale";
    const ordered = evaluateKeywordMatch(
      textRow("We chose a store split; the rationale was failure-domain isolation."),
      query,
    );
    const scattered = evaluateKeywordMatch(
      textRow("Split the batch first. Store results separately. Rationale lives in the wiki."),
      query,
    );

    expect(ordered.scoreForFusion).toBe(1);
    expect(scattered.scoreForFusion).toBe(1);
    expect(ordered.tieBreak).toBeGreaterThan(scattered.tieBreak);
  });
});
