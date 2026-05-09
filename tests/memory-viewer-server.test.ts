import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { loadViewerMemories, memoryViewerHost } from "../src/features/memory-viewer/server.js";
import type { ReadOnlyMemoryReader } from "../src/features/memory-viewer/types.js";
import type { MemoryRecord, SearchMemoriesInput, SearchMemoriesResult } from "../src/features/memory/types.js";

describe("memory viewer server", () => {
  it("is localhost-only", () => {
    expect(memoryViewerHost).toBe("127.0.0.1");
  });

  it("loads non-indexed results from canonical records after viewer filters", async () => {
    const reader = createReader({
      records: [
        createRecord("mem-noise", "Hypothesis noise."),
        {
          ...createRecord("mem-keep", "Memory viewer lists records."),
          verificationStatus: "verified",
          createdAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    const result = await loadViewerMemories(reader, {
      view: "verified",
      query: "viewer",
      scope: "all",
      kind: "all",
      verificationStatus: "verified",
      reviewStatus: "active",
      limit: 50,
    });

    expect(reader.readAll).toHaveBeenCalledTimes(1);
    expect(reader.list).not.toHaveBeenCalled();
    expect(reader.search).not.toHaveBeenCalled();
    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-keep"]);
    expect(result.projectScopes.map((scope) => `${scope.projectId}/${scope.containerId}`)).toEqual(["project-a/container-a"]);
  });

  it("applies the display limit after non-indexed viewer filters", async () => {
    const reader = createReader({
      records: [
        createRecord("mem-noise", "Hypothesis noise."),
        {
          ...createRecord("mem-older-keep", "Older keep-worthy memory."),
          verificationStatus: "verified",
          createdAt: "2026-05-04T11:00:00.000Z",
        },
        {
          ...createRecord("mem-newer-keep", "Newer keep-worthy memory."),
          verificationStatus: "verified",
          createdAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    const result = await loadViewerMemories(reader, {
      view: "verified",
      scope: "all",
      kind: "all",
      verificationStatus: "verified",
      reviewStatus: "active",
      limit: 1,
    });

    expect(result.fetchedCount).toBe(3);
    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-newer-keep"]);
  });

  it("loads indexed search results for complete scoped searches and keeps status filtering local", async () => {
    const reader = createReader({
      records: [],
      searchResult: {
        degraded: false,
        items: [
          {
            id: "mem-search",
            kind: "fact",
            content: "Indexed memory content.",
            score: 0.7,
            reasons: ["keyword_match"],
            createdAt: "2026-05-04T10:00:00.000Z",
            importance: 0.6,
            verificationStatus: "verified",
            reviewDecisions: [],
            verificationEvidence: [],
            source: { type: "manual" },
          },
        ],
      },
    });

    const result = await loadViewerMemories(reader, {
      view: "verified",
      query: "indexed",
      scope: "global",
      kind: "all",
      verificationStatus: "verified",
      reviewStatus: "none",
      limit: 25,
    });

    expect(reader.search).toHaveBeenCalledWith({
      query: "indexed",
      mode: "full",
      scope: "global",
      projectId: undefined,
      containerId: undefined,
      limit: 25,
    } satisfies SearchMemoriesInput);
    expect(result.fetchMode).toBe("search");
    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-search"]);
  });

  it("aggregates project/container summaries from canonical records independently of the visible list", async () => {
    const reader = createReader({
      records: [createRecord("mem-visible", "Visible memory.")],
      allRecords: [
        createRecord("mem-visible", "Visible memory."),
        {
          ...createRecord("mem-hidden", "Hidden by list limit."),
          kind: "doc",
          verificationStatus: "verified",
          reviewStatus: "pending",
          updatedAt: "2026-05-04T12:00:00.000Z",
        },
        {
          ...createRecord("mem-other", "Other project memory."),
          projectId: "project-b",
          containerId: "container-b",
          kind: "task",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    const result = await loadViewerMemories(reader, {
      view: "projects",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 1,
    });

    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-hidden"]);
    expect(result.projectScopes).toHaveLength(2);
    expect(result.projectScopes[0]).toMatchObject({
      projectId: "project-a",
      containerId: "container-a",
      totalCount: 2,
      latestTimestamp: "2026-05-04T12:00:00.000Z",
    });
    expect(result.projectScopes[0]?.kindCounts).toMatchObject({ fact: 1, doc: 1 });
    expect(result.projectScopes[0]?.reviewStatusCounts).toMatchObject({ none: 1, pending: 1 });
  });

  it("loads the verified default as high-signal active memory and hides rejected noise", async () => {
    const reader = createReader({
      records: [
        {
          ...createRecord("mem-verified", "Keep-worthy memory."),
          verificationStatus: "verified",
        },
        createRecord("mem-hypothesis", "Still a hypothesis."),
        {
          ...createRecord("mem-rejected", "Rejected noise."),
          verificationStatus: "verified",
          reviewStatus: "rejected",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    const result = await loadViewerMemories(reader, {
      view: "verified",
      scope: "all",
      kind: "all",
      verificationStatus: "verified",
      reviewStatus: "active",
      limit: 50,
    });

    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-verified"]);
  });

  it("does not import or call write-capable memory service APIs in viewer source", async () => {
    const viewerFiles = [
      "src/features/memory-viewer/filters.ts",
      "src/features/memory-viewer/reader.ts",
      "src/features/memory-viewer/render.ts",
      "src/features/memory-viewer/server.ts",
      "src/features/memory-viewer/types.ts",
      "src/memory-viewer.ts",
    ];
    const source = (await Promise.all(viewerFiles.map((file) => readFile(file, "utf8")))).join("\n");

    expect(source).not.toContain("MemoryService");
    expect(source).not.toContain("RetrievalTraceStore");
    expect(source).not.toMatch(/\.(remember|promoteMemory|reviewMemory|resetStorage|upsertDocument|enqueueMemoryProposal|resetMemoryStorage)\(/);
  });
});

function createReader(input: {
  readonly records: readonly MemoryRecord[];
  readonly allRecords?: readonly MemoryRecord[];
  readonly searchResult: SearchMemoriesResult;
}): ReadOnlyMemoryReader {
  return {
    readAll: vi.fn(async () => input.allRecords ?? input.records),
    list: vi.fn(async () => input.records),
    search: vi.fn(async () => input.searchResult),
  };
}

function createRecord(id: string, content: string): MemoryRecord {
  return {
    id,
    kind: "fact",
    scope: "project",
    verificationStatus: "hypothesis",
    projectId: "project-a",
    containerId: "container-a",
    source: { type: "manual" },
    content,
    tags: [],
    importance: 0.5,
    createdAt: "2026-05-04T10:00:00.000Z",
  };
}
