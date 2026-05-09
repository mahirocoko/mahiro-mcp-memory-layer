import { describe, expect, it } from "vitest";

import {
  aggregateViewerProjectScopes,
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
  it("defaults the root viewer to verified active memories", () => {
    const filters = normalizeViewerFilters(new URLSearchParams());

    expect(filters).toMatchObject({
      view: "verified",
      verificationStatus: "verified",
      reviewStatus: "active",
      scope: "all",
      limit: 50,
    });
  });

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
      view: "verified",
      query: "memory",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 50,
    });
  });

  it("clears project, container, and selected memory filters for global navigation", () => {
    const filters = normalizeViewerFilters(new URLSearchParams({
      scope: "global",
      projectId: "stale-project",
      containerId: "stale-container",
      id: "stale-memory",
    }));

    expect(filters.scope).toBe("global");
    expect(filters.projectId).toBeUndefined();
    expect(filters.containerId).toBeUndefined();
    expect(filters.selectedId).toBeUndefined();
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
      view: "verified",
      query: "viewer",
      scope: "project",
      kind: "task",
      verificationStatus: "verified",
      reviewStatus: "deferred",
      projectId: "project-a",
      containerId: "container-a",
      limit: 50,
    });

    expect(filtered.map((memory) => memory.id)).toEqual(["mem-2"]);
  });

  it("maps the active review preset to every status except rejected", () => {
    const memories = [
      baseMemory,
      {
        ...baseMemory,
        id: "mem-pending",
        reviewStatus: "pending",
        createdAt: "2026-05-04T11:00:00.000Z",
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-deferred",
        reviewStatus: "deferred",
        createdAt: "2026-05-04T12:00:00.000Z",
      } satisfies ViewerMemory,
      { ...baseMemory, id: "mem-rejected", reviewStatus: "rejected" } satisfies ViewerMemory,
    ];

    const filtered = filterViewerMemories(memories, {
      view: "verified",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "active",
      limit: 50,
    });

    expect(filtered.map((memory) => memory.id)).toEqual(["mem-deferred", "mem-pending", "mem-1"]);
  });

  it("uses inbox semantics for review-needed non-rejected memories", () => {
    const memories = [
      baseMemory,
      {
        ...baseMemory,
        id: "mem-verified-pending",
        verificationStatus: "verified",
        reviewStatus: "pending",
        createdAt: "2026-05-04T12:00:00.000Z",
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-verified-deferred",
        verificationStatus: "verified",
        reviewStatus: "deferred",
        createdAt: "2026-05-04T13:00:00.000Z",
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-rejected-hypothesis",
        reviewStatus: "rejected",
        createdAt: "2026-05-04T14:00:00.000Z",
      } satisfies ViewerMemory,
    ];

    const filtered = filterViewerMemories(memories, {
      view: "inbox",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "active",
      limit: 50,
    });

    expect(filtered.map((memory) => memory.id)).toEqual(["mem-verified-pending", "mem-1"]);
  });

  it("keeps firehose as the raw view that includes rejected memories by default", () => {
    const filters = normalizeViewerFilters(new URLSearchParams({ view: "firehose" }));
    const memories = [
      baseMemory,
      {
        ...baseMemory,
        id: "mem-rejected",
        reviewStatus: "rejected",
        createdAt: "2026-05-04T12:00:00.000Z",
      } satisfies ViewerMemory,
    ];

    const filtered = filterViewerMemories(memories, filters);

    expect(filters).toMatchObject({ verificationStatus: "all", reviewStatus: "all" });
    expect(filtered.map((memory) => memory.id)).toEqual(["mem-rejected", "mem-1"]);
  });

  it("aggregates complete project and container scopes from canonical records", () => {
    const summaries = aggregateViewerProjectScopes([
      baseMemory,
      {
        ...baseMemory,
        id: "mem-2",
        kind: "doc",
        verificationStatus: "verified",
        reviewStatus: "pending",
        updatedAt: "2026-05-04T12:30:00.000Z",
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-3",
        projectId: "project-b",
        containerId: "container-b",
        kind: "task",
        reviewStatus: "rejected",
        createdAt: "2026-05-04T08:00:00.000Z",
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-missing-container",
        containerId: undefined,
      } satisfies ViewerMemory,
      {
        ...baseMemory,
        id: "mem-global",
        scope: "global",
        projectId: undefined,
        containerId: undefined,
      } satisfies ViewerMemory,
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      projectId: "project-a",
      containerId: "container-a",
      totalCount: 2,
      latestTimestamp: "2026-05-04T12:30:00.000Z",
    });
    expect(summaries[0]?.kindCounts).toMatchObject({ fact: 1, doc: 1 });
    expect(summaries[0]?.verificationStatusCounts).toMatchObject({ hypothesis: 1, verified: 1 });
    expect(summaries[0]?.reviewStatusCounts).toMatchObject({ none: 1, pending: 1 });
  });

  it("uses indexed search only for complete searchable scopes", () => {
    expect(canUseIndexedSearch({
      view: "firehose",
      query: "local",
      scope: "global",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 50,
    })).toBe(true);

    expect(canUseIndexedSearch({
      view: "verified",
      query: "local",
      scope: "project",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      projectId: "project-a",
      containerId: "container-a",
      limit: 50,
    })).toBe(true);

    expect(canUseIndexedSearch({
      view: "verified",
      query: "local",
      scope: "all",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "all",
      limit: 50,
    })).toBe(false);
  });
});
