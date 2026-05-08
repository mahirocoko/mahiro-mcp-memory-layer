import { describe, expect, it, vi } from "vitest";

import {
  resolveWikiMaterializerFilters,
  selectWikiCanonicalRecords,
  type WikiCanonicalRecordReader,
} from "../src/features/memory/wiki-materializer/selector.js";
import type { MemoryKind, MemoryRecord } from "../src/features/memory/types.js";

const scope = {
  projectId: "project-alpha",
  containerId: "container-main",
};

const otherScope = {
  projectId: "project-beta",
  containerId: "container-side",
};

function recordFixture(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id">): MemoryRecord {
  return {
    id: overrides.id,
    kind: "fact",
    scope: "project",
    verificationStatus: "verified",
    reviewDecisions: [],
    verificationEvidence: [],
    projectId: scope.projectId,
    containerId: scope.containerId,
    source: { type: "manual", uri: "file:///notes.md", title: "Notes" },
    content: `Content for ${overrides.id}`,
    tags: [],
    importance: 0.6,
    createdAt: "2026-05-08T01:00:00.000Z",
    ...overrides,
  };
}

function readOnlyStore(records: readonly MemoryRecord[]): WikiCanonicalRecordReader {
  return {
    readAll: vi.fn(async () => records),
  };
}

describe("wiki materializer selector", () => {
  it("selects verified records only within the exact project/container scope and counts scope mismatches", async () => {
    const logStore = readOnlyStore([
      recordFixture({ id: "selected-doc", kind: "doc" }),
      recordFixture({ id: "selected-task", kind: "task" }),
      recordFixture({ id: "wrong-project", projectId: otherScope.projectId }),
      recordFixture({ id: "wrong-container", containerId: otherScope.containerId }),
      recordFixture({ id: "global-record", scope: "global", projectId: undefined, containerId: undefined }),
    ]);

    const selection = await selectWikiCanonicalRecords({
      logStore,
      options: scope,
    });

    expect(selection.records.map((record) => record.id)).toEqual(["selected-doc", "selected-task"]);
    expect(selection.records.map((record) => record.kind)).toEqual(["doc", "task"]);
    expect(selection.includedCount).toBe(2);
    expect(selection.excludedCount).toBe(3);
    expect(selection.excludedByReason).toEqual({ scope_mismatch: 3 });
    expect(selection.records.every((record) => record.projectId === scope.projectId)).toBe(true);
    expect(selection.records.every((record) => record.containerId === scope.containerId)).toBe(true);
  });

  it("uses default filters to exclude hypotheses and pending, deferred, and rejected review records", async () => {
    const logStore = readOnlyStore([
      recordFixture({ id: "verified" }),
      recordFixture({ id: "hypothesis", verificationStatus: "hypothesis" }),
      recordFixture({ id: "pending", reviewStatus: "pending" }),
      recordFixture({ id: "deferred", reviewStatus: "deferred" }),
      recordFixture({ id: "rejected", reviewStatus: "rejected" }),
    ]);

    const selection = await selectWikiCanonicalRecords({
      logStore,
      options: scope,
    });

    expect(selection.filters).toMatchObject({
      mode: "verified_only",
      includeVerificationStatuses: ["verified"],
      excludeReviewStatuses: ["pending", "deferred", "rejected"],
    });
    expect(selection.records.map((record) => record.id)).toEqual(["verified"]);
    expect(selection.includedCount).toBe(1);
    expect(selection.excludedCount).toBe(4);
    expect(selection.excludedByReason).toEqual({
      unverified: 1,
      pending_review: 1,
      deferred_review: 1,
      rejected_review: 1,
    });
  });

  it("can include hypotheses and selected review statuses when explicit filter flags allow them", async () => {
    const logStore = readOnlyStore([
      recordFixture({ id: "hypothesis", verificationStatus: "hypothesis", reviewStatus: undefined }),
      recordFixture({ id: "pending", verificationStatus: "hypothesis", reviewStatus: "pending" }),
      recordFixture({ id: "deferred", reviewStatus: "deferred" }),
      recordFixture({ id: "rejected", reviewStatus: "rejected" }),
    ]);

    const selection = await selectWikiCanonicalRecords({
      logStore,
      options: {
        ...scope,
        filters: {
          includeHypotheses: true,
          includePendingReview: true,
          includeDeferredReview: true,
        },
      },
    });

    expect(selection.filters).toEqual(resolveWikiMaterializerFilters({
      includeHypotheses: true,
      includePendingReview: true,
      includeDeferredReview: true,
    }));
    expect(selection.records.map((record) => record.id)).toEqual(["deferred", "hypothesis", "pending"]);
    expect(selection.excludedByReason).toEqual({ rejected_review: 1 });
  });

  it("sorts deterministically by kind, source URI/title, createdAt, updatedAt, then id", async () => {
    const logStore = readOnlyStore([
      sortedRecord("task-late", "task", "file:///b.md", "B", "2026-05-08T03:00:00.000Z"),
      sortedRecord("doc-b", "doc", "file:///b.md", "A", "2026-05-08T01:00:00.000Z"),
      sortedRecord("doc-a-title-b", "doc", "file:///a.md", "B", "2026-05-08T01:00:00.000Z"),
      sortedRecord("doc-a-title-a-late-update", "doc", "file:///a.md", "A", "2026-05-08T01:00:00.000Z", "2026-05-08T02:00:00.000Z"),
      sortedRecord("doc-a-title-a-early-update-z", "doc", "file:///a.md", "A", "2026-05-08T01:00:00.000Z", "2026-05-08T01:30:00.000Z"),
      sortedRecord("doc-a-title-a-early-update-a", "doc", "file:///a.md", "A", "2026-05-08T01:00:00.000Z", "2026-05-08T01:30:00.000Z"),
      sortedRecord("decision-first", "decision", "file:///z.md", "Z", "2026-05-08T01:00:00.000Z"),
    ]);

    const selection = await selectWikiCanonicalRecords({
      logStore,
      options: scope,
    });

    expect(selection.records.map((record) => record.id)).toEqual([
      "decision-first",
      "doc-a-title-a-early-update-a",
      "doc-a-title-a-early-update-z",
      "doc-a-title-a-late-update",
      "doc-a-title-b",
      "doc-b",
      "task-late",
    ]);
    expect(selection.records.every((record) => record.recordHash.match(/^[a-f0-9]{64}$/))).toBe(true);
  });

  it("uses only the canonical log read API and rejects incomplete project scope", async () => {
    const readAll = vi.fn(async () => [recordFixture({ id: "verified" })]);
    const mutationTrap = vi.fn(async () => {
      throw new Error("selector must not mutate canonical storage");
    });
    const logStore = {
      readAll,
      append: mutationTrap,
      replaceRecordById: mutationTrap,
      readById: mutationTrap,
      list: mutationTrap,
      listReviewQueue: mutationTrap,
    };

    await selectWikiCanonicalRecords({
      logStore,
      options: scope,
    });

    expect(readAll).toHaveBeenCalledTimes(1);
    expect(mutationTrap).not.toHaveBeenCalled();
    await expect(selectWikiCanonicalRecords({
      logStore,
      options: { projectId: scope.projectId, containerId: "" },
    })).rejects.toThrow("Missing required scope field: containerId");
  });
});

function sortedRecord(
  id: string,
  kind: MemoryKind,
  uri: string,
  title: string,
  createdAt: string,
  updatedAt?: string,
): MemoryRecord {
  return recordFixture({
    id,
    kind,
    source: { type: "document", uri, title },
    createdAt,
    updatedAt,
  });
}
