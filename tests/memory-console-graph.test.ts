import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildMemoryGraph } from "../src/features/memory-console/graph.js";
import type { MemoryRecord, ReviewAssistSuggestion } from "../src/features/memory/types.js";

describe("memory console graph projection", () => {
  it("returns an empty graph for empty input", () => {
    expect(buildMemoryGraph([])).toEqual({ nodes: [], edges: [], warnings: [] });
  });

  it("projects source, tag, evidence, and review metadata edges with exact keys", () => {
    const graph = buildMemoryGraph([
      createMemory("mem-a", {
        source: { type: "document", uri: "file:///a.md", title: "Guide" },
        tags: ["zeta", "alpha"],
        verificationEvidence: [{ type: "human", value: "ok", note: "approved" }],
        reviewDecisions: [
          {
            action: "defer",
            decidedAt: "2026-05-04T12:00:00.000Z",
            note: "needs another pass",
            evidence: [{ type: "test", value: "passed" }],
          },
        ],
      }),
    ]);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "memory:mem-a",
      "source:document:file:///a.md:Guide",
      "tag:alpha",
      "tag:zeta",
      "evidence:human:ok",
      "evidence:test:passed",
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "has_source:memory:mem-a->source:document:file:///a.md:Guide:has source",
      "tagged_with:memory:mem-a->tag:alpha:tagged with",
      "tagged_with:memory:mem-a->tag:zeta:tagged with",
      "has_evidence:memory:mem-a->evidence:human:ok:has evidence",
      "has_evidence:memory:mem-a->evidence:test:passed:has evidence",
      "reviewed_as:memory:mem-a->memory:mem-a:defer",
    ]);
    expect(graph.warnings).toEqual([]);
  });

  it("derives related memory edges from review hints and assist suggestions", () => {
    const suggestion = {
      kind: "gather_evidence",
      rationale: "collect more proof",
      relatedMemoryIds: ["mem-a"],
      suggestedAction: "collect_evidence",
    } satisfies ReviewAssistSuggestion;

    const graph = buildMemoryGraph(
      [createMemory("mem-b"), createMemory("mem-a")],
      {
        related: [
          {
            memoryId: "mem-b",
            hints: [{ type: "likely_duplicate", relatedMemoryIds: ["mem-a"], note: "same source" }],
            assistSuggestions: [suggestion],
          },
        ],
      },
    );

    expect(graph.edges.filter((edge) => edge.type === "related_memory")).toEqual([
      expect.objectContaining({
        id: "related_memory:memory:mem-b->memory:mem-a:gather_evidence",
        metadata: expect.objectContaining({ relationSource: "review_assist_suggestion", relationType: "gather_evidence" }),
      }),
      expect.objectContaining({
        id: "related_memory:memory:mem-b->memory:mem-a:likely_duplicate",
        metadata: expect.objectContaining({ relationSource: "review_hint", relationType: "likely_duplicate" }),
      }),
    ]);
    expect(graph.warnings).toEqual([]);
  });

  it("warns instead of throwing when supplied related ids are missing", () => {
    const graph = buildMemoryGraph(
      [createMemory("mem-a")],
      {
        related: [
          {
            memoryId: "mem-a",
            hints: [{ type: "possible_contradiction", relatedMemoryIds: ["missing-memory"], note: "not in input" }],
          },
        ],
      },
    );

    expect(graph.edges.filter((edge) => edge.type === "related_memory")).toEqual([]);
    expect(graph.warnings).toEqual([
      {
        type: "missing_related_memory",
        memoryId: "mem-a",
        relatedMemoryId: "missing-memory",
        relationSource: "review_hint",
        relationType: "possible_contradiction",
        message: "Related memory missing-memory referenced by mem-a was not included in the graph input.",
      },
    ]);
  });

  it("omits related edges and warnings when raw records have no related hint data", () => {
    const graph = buildMemoryGraph([createMemory("mem-a"), createMemory("mem-b")]);

    expect(graph.edges.some((edge) => edge.type === "related_memory")).toBe(false);
    expect(graph.warnings).toEqual([]);
  });

  it("uses deterministic ordering independent of input ordering", () => {
    const left = buildMemoryGraph(
      [createMemory("mem-b", { tags: ["beta"] }), createMemory("mem-a", { tags: ["alpha"] })],
      { related: [{ memoryId: "mem-b", hints: [{ type: "likely_duplicate", relatedMemoryIds: ["mem-a"], note: "same" }] }] },
    );
    const right = buildMemoryGraph(
      [createMemory("mem-a", { tags: ["alpha"] }), createMemory("mem-b", { tags: ["beta"] })],
      { related: [{ memoryId: "mem-b", hints: [{ type: "likely_duplicate", relatedMemoryIds: ["mem-a"], note: "same" }] }] },
    );

    expect(left).toEqual(right);
    expect(left.nodes.map((node) => node.id)).toEqual([
      "memory:mem-a",
      "memory:mem-b",
      "source:manual::",
      "tag:alpha",
      "tag:beta",
    ]);
    expect(left.edges.map((edge) => edge.id)).toEqual([
      "has_source:memory:mem-a->source:manual:::has source",
      "tagged_with:memory:mem-a->tag:alpha:tagged with",
      "has_source:memory:mem-b->source:manual:::has source",
      "tagged_with:memory:mem-b->tag:beta:tagged with",
      "related_memory:memory:mem-b->memory:mem-a:likely_duplicate",
    ]);
  });

  it("keeps graph projection free of filesystem, log, index, and persistence imports", async () => {
    const source = await readFile(new URL("../src/features/memory-console/graph.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/node:fs|node:path|JsonlLogStore|MemoryRecordsTable|lancedb|retrieval|persistence|log-store|canonical-log/);
  });
});

function createMemory(id: string, overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    kind: overrides.kind ?? "fact",
    scope: overrides.scope ?? "project",
    verificationStatus: overrides.verificationStatus ?? "hypothesis",
    reviewStatus: overrides.reviewStatus,
    reviewDecisions: overrides.reviewDecisions ?? [],
    verifiedAt: overrides.verifiedAt,
    verificationEvidence: overrides.verificationEvidence ?? [],
    projectId: overrides.projectId ?? "project-a",
    containerId: overrides.containerId ?? "container-a",
    source: overrides.source ?? { type: "manual" },
    content: overrides.content ?? `${id} content should not drive graph shape.`,
    summary: overrides.summary,
    tags: overrides.tags ?? [],
    importance: overrides.importance ?? 0.5,
    createdAt: overrides.createdAt ?? "2026-05-04T10:00:00.000Z",
    updatedAt: overrides.updatedAt,
  };
}
