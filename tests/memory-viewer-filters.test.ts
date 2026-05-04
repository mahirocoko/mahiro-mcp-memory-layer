import { describe, expect, it } from "vitest";

import {
  canUseIndexedSearch,
  filterViewerMemories,
  normalizeMemoryRecord,
  normalizeViewerFilters,
} from "../src/features/memory-viewer/filters.js";
import type { ViewerMemory } from "../src/features/memory-viewer/types.js";
import type { MemoryRecord } from "../src/features/memory/types.js";

const baseMemory = {
  id: "mem-1",
  kind: "fact",
  scope: "project",
  verificationStatus: "hypothesis",
  reviewDecisions: [],
  verificationEvidence: [],
  projectId: "project-a",
  containerId: "container-a",
  source: { type: "manual" },
  content: "Bun runs local memory scripts.",
  tags: ["runtime"],
  importance: 0.5,
  createdAt: "2026-05-04T10:00:00.000Z",
  reasons: [],
} satisfies ViewerMemory;

describe("memory viewer filters", () => {
  it("normalizes invalid filter values and clamps the result limit", () => {
    const filters = normalizeViewerFilters(new URLSearchParams({
      q: "  memory  ",
      scope: "invalid",
      kind: "nope",
      verificationStatus: "unknown",
      reviewStatus: "bad",
      limit: "999",
    }));

    expect(filters).toMatchObject({
      query: "memory",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 100,
    });
  });

  it("normalizes missing memory status fields for display and filtering", () => {
    const record = {
      id: "mem-2",
      kind: "decision",
      scope: "global",
      source: { type: "tool", title: "<unsafe>" },
      content: "Use JSONL as the canonical log.",
      tags: [],
      importance: 0.7,
      createdAt: "2026-05-04T11:00:00.000Z",
    } satisfies MemoryRecord;

    const normalized = normalizeMemoryRecord(record);

    expect(normalized.verificationStatus).toBe("hypothesis");
    expect(normalized.reviewDecisions).toEqual([]);
    expect(normalized.verificationEvidence).toEqual([]);
  });

  it("filters fetched memories by scope, kind, verification status, review status, ids, and query", () => {
    const memories = [
      baseMemory,
      {
        ...baseMemory,
        id: "mem-2",
        kind: "task",
        verificationStatus: "verified",
        reviewStatus: "deferred",
        content: "Follow up on viewer tests.",
        createdAt: "2026-05-04T12:00:00.000Z",
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-3",
        scope: "global",
        projectId: undefined,
        containerId: undefined,
        content: "Global profile memory.",
      } satisfies ViewerMemory,
    ];

    const filtered = filterViewerMemories(memories, {
      query: "viewer",
      scope: "project",
      kind: "task",
      verificationStatus: "verified",
      reviewStatus: "deferred",
      projectId: "project-a",
      containerId: "container-a",
      limit: 100,
    });

    expect(filtered.map((memory) => memory.id)).toEqual(["mem-2"]);
  });

  it("uses indexed search only for complete searchable scopes", () => {
    expect(canUseIndexedSearch({
      query: "local",
      scope: "global",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 100,
    })).toBe(true);

    expect(canUseIndexedSearch({
      query: "local",
      scope: "project",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      projectId: "project-a",
      containerId: "container-a",
      limit: 100,
    })).toBe(true);

    expect(canUseIndexedSearch({
      query: "local",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 100,
    })).toBe(false);
  });
});
