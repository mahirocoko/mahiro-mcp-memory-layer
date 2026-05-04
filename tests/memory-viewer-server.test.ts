import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { loadViewerMemories, memoryViewerHost } from "../src/features/memory-viewer/server.js";
import type { ReadOnlyMemoryReader, ViewerFilterState } from "../src/features/memory-viewer/types.js";
import type { MemoryRecord, SearchMemoriesInput, SearchMemoriesResult } from "../src/features/memory/types.js";

describe("memory viewer server", () => {
  it("is localhost-only", () => {
    expect(memoryViewerHost).toBe("127.0.0.1");
  });

  it("loads list results through read-only list behavior when indexed search is unavailable", async () => {
    const reader = createReader({
      records: [createRecord("mem-1", "Memory viewer lists records.")],
      searchResult: { items: [], degraded: false },
    });

    const result = await loadViewerMemories(reader, {
      query: "viewer",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 100,
    });

    expect(reader.list).toHaveBeenCalledWith({ limit: 100 });
    expect(reader.search).not.toHaveBeenCalled();
    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-1"]);
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
    expect(source).not.toMatch(/\.(remember|promoteMemory|reviewMemory|resetStorage|upsertDocument|enqueueMemoryProposal|resetMemoryStorage)\(/);
  });
});

function createReader(input: {
  readonly records: readonly MemoryRecord[];
  readonly searchResult: SearchMemoriesResult;
}): ReadOnlyMemoryReader {
  return {
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
