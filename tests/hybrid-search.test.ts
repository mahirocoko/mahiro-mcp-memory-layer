import { describe, expect, it } from "vitest";

import { defaultKeywordCandidateLimit } from "../src/features/memory/constants.js";
import { runHybridSearch } from "../src/features/memory/retrieval/hybrid-search.js";
import type { EmbeddingProvider } from "../src/features/memory/index/embedding-provider.js";
import type { RetrievalRow, ScopeFilter } from "../src/features/memory/types.js";

const baseFilter: ScopeFilter = {
  scope: "project",
  userId: "mahiro",
  projectId: "mahiro-mcp-memory-layer",
  containerId: "workspace:mahiro-mcp-memory-layer",
};

function createRow(input: Partial<RetrievalRow> & Pick<RetrievalRow, "id" | "content" | "createdAt">): RetrievalRow {
  return {
    id: input.id,
    content: input.content,
    summary: input.summary ?? "",
    embedding: input.embedding ?? [1, 0],
    kind: input.kind ?? "fact",
    scope: input.scope ?? "project",
    userId: input.userId ?? "mahiro",
    projectId: input.projectId ?? "mahiro-mcp-memory-layer",
    containerId: input.containerId ?? "workspace:mahiro-mcp-memory-layer",
    sessionId: input.sessionId ?? "",
    importance: input.importance ?? 0.5,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    sourceType: input.sourceType ?? "manual",
    sourceUri: input.sourceUri ?? "",
    sourceTitle: input.sourceTitle ?? "",
    tags: input.tags ?? "[]",
    embeddingVersion: input.embeddingVersion ?? "test-v1",
    indexVersion: input.indexVersion ?? "v0",
  };
}

describe("runHybridSearch", () => {
  it("degrades to keyword-only results when embedding lookup fails", async () => {
    const keywordRows = [
      createRow({
        id: "mem-1",
        content: "Keyword only fallback result",
        createdAt: "2026-04-05T00:00:00.000Z",
      }),
    ];

    const table = {
      queryScopedRows: async () => keywordRows,
      queryScopedLexicalCandidates: async () => [],
      vectorSearch: async () => {
        throw new Error("should not run vector search when embeddings fail");
      },
    };

    const embeddingProvider: EmbeddingProvider = {
      version: "test-v1",
      dimensions: 2,
      embedText: async () => {
        throw new Error("embedding unavailable");
      },
    };

    const { result, trace } = await runHybridSearch({
      search: {
        query: "keyword fallback",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        limit: 5,
      },
      filter: baseFilter,
      table: table as never,
      embeddingProvider,
    });

    expect(result.degraded).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(["mem-1"]);
    expect(trace.degraded).toBe(true);
    expect(trace.rankingReasonsById["mem-1"]).toContain("keyword_match");
    expect(trace.rankingReasonsById["mem-1"]).not.toContain("semantic_match");
  });

  it("prefers the memory that actually discusses requestId when vector similarity is ambiguous", async () => {
    const onTopic = createRow({
      id: "mem-request-id",
      content:
        "Hook hardening: reject payloads when request_id is missing, malformed, or replayed.",
      embedding: [0.92, 0.08],
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    });

    const generic = createRow({
      id: "mem-generic-hardening",
      content: "Security hardening: rate limits, auth checks, and audit logging on the API layer.",
      embedding: [0.99, 0.01],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const keywordRows = [generic, onTopic];
    const vectorRows = [generic, onTopic];

    const table = {
      queryScopedRows: async () => keywordRows,
      queryScopedLexicalCandidates: async () => [],
      vectorSearch: async () => vectorRows,
    };

    const embeddingProvider: EmbeddingProvider = {
      version: "test-v1",
      dimensions: 2,
      embedText: async () => [1, 0],
    };

    const { result } = await runHybridSearch({
      search: {
        query: "requestId hardening",
        mode: "query",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        limit: 5,
      },
      filter: baseFilter,
      table: table as never,
      embeddingProvider,
    });

    expect(result.items[0]?.id).toBe("mem-request-id");
  });

  it("does not cap keyword candidates before scoring lexical matches", async () => {
    const fillerRows = Array.from({ length: 64 }, (_, index) =>
      createRow({
        id: `mem-filler-${index}`,
        content: `Generic memory ${index}`,
        createdAt: `2026-04-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
        updatedAt: `2026-04-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      }),
    );
    const lexicalHit = createRow({
      id: "mem-lexical-hit",
      content: "Detailed notes about the retrieval fallback candidate coverage.",
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const table = {
      queryScopedRows: async (_filter: ScopeFilter, limit?: number) => {
        expect(limit).toBeUndefined();
        return [...fillerRows, lexicalHit];
      },
      vectorSearch: async () => [],
    };

    const embeddingProvider: EmbeddingProvider = {
      version: "test-v1",
      dimensions: 2,
      embedText: async () => {
        throw new Error("embedding unavailable");
      },
    };

    const { result } = await runHybridSearch({
      search: {
        query: "retrieval fallback candidate coverage",
        mode: "full",
        scope: "project",
        userId: "mahiro",
        projectId: "mahiro-mcp-memory-layer",
        containerId: "workspace:mahiro-mcp-memory-layer",
        limit: 5,
      },
      filter: baseFilter,
      table: table as never,
      embeddingProvider,
    });

    expect(result.items[0]?.id).toBe("mem-lexical-hit");
  });
});
