import type { MemoryRecord } from "../../src/features/memory/types.js";

export const wikiE2eScope = {
  projectId: "project-alpha",
  containerId: "container-main",
} as const;

export const wikiE2eOtherScope = {
  projectId: "project-beta",
  containerId: "container-side",
} as const;

export function wikiE2eRecord(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id">): MemoryRecord {
  return {
    id: overrides.id,
    kind: "doc",
    scope: "project",
    verificationStatus: "verified",
    reviewDecisions: [],
    verificationEvidence: [{ type: "test", value: "wiki-materializer-e2e", note: "seed fixture" }],
    projectId: wikiE2eScope.projectId,
    containerId: wikiE2eScope.containerId,
    source: { type: "document", uri: `file:///docs/${overrides.id}.md`, title: "Guide" },
    content: `Canonical content for ${overrides.id}`,
    summary: `Summary for ${overrides.id}`,
    tags: ["wiki", "e2e"],
    importance: 0.7,
    createdAt: "2026-05-08T01:00:00.000Z",
    updatedAt: "2026-05-08T01:05:00.000Z",
    verifiedAt: "2026-05-08T01:10:00.000Z",
    ...overrides,
  };
}

export function wikiE2eCanonicalRecords(): readonly MemoryRecord[] {
  return [
    wikiE2eRecord({
      id: "mem-doc-alpha",
      source: { type: "document", uri: "file:///docs/alpha.md", title: "Duplicate Title" },
      content: "Alpha canonical content.",
      createdAt: "2026-05-08T01:00:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-doc-beta",
      source: { type: "document", uri: "file:///docs/beta.md", title: "Duplicate Title" },
      content: "Beta canonical content.",
      createdAt: "2026-05-08T01:01:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-manual-missing-source",
      kind: "fact",
      source: { type: "manual" },
      content: "Manual note with missing URI and title.",
      createdAt: "2026-05-08T01:02:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-non-ascii-title",
      source: { type: "document", uri: "file:///docs/cafe-東京.md", title: "Café 東京/研究" },
      content: "Non-ASCII title content remains projectable.",
      createdAt: "2026-05-08T01:03:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-hypothesis-excluded",
      verificationStatus: "hypothesis",
      source: { type: "chat", title: "Hypothesis" },
      content: "Hypothesis should not be materialized by default.",
      createdAt: "2026-05-08T01:04:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-pending-excluded",
      reviewStatus: "pending",
      source: { type: "manual", title: "Pending" },
      content: "Pending review should not be materialized by default.",
      createdAt: "2026-05-08T01:05:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-deferred-excluded",
      reviewStatus: "deferred",
      source: { type: "manual", title: "Deferred" },
      content: "Deferred review should not be materialized by default.",
      createdAt: "2026-05-08T01:06:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-rejected-excluded",
      reviewStatus: "rejected",
      source: { type: "manual", title: "Rejected" },
      content: "Rejected review should not be materialized by default.",
      createdAt: "2026-05-08T01:07:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-other-project-excluded",
      projectId: wikiE2eOtherScope.projectId,
      containerId: wikiE2eScope.containerId,
      source: { type: "document", title: "Other project" },
      content: "Other project content must stay isolated.",
      createdAt: "2026-05-08T01:08:00.000Z",
    }),
    wikiE2eRecord({
      id: "mem-other-container-excluded",
      projectId: wikiE2eScope.projectId,
      containerId: wikiE2eOtherScope.containerId,
      source: { type: "document", title: "Other container" },
      content: "Other container content must stay isolated.",
      createdAt: "2026-05-08T01:09:00.000Z",
    }),
  ];
}
