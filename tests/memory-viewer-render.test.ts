import { describe, expect, it } from "vitest";

import { renderMemoryViewerPage } from "../src/features/memory-viewer/render.js";
import type { ViewerFilterState, ViewerLoadResult, ViewerMemory } from "../src/features/memory-viewer/types.js";

const filters = {
  scope: "all",
  kind: "all",
  verificationStatus: "all",
  reviewStatus: "all",
  limit: 100,
} satisfies ViewerFilterState;

describe("memory viewer rendering", () => {
  it("escapes memory content, source fields, evidence, and review decisions", () => {
    const memory = {
      id: "mem-escape",
      kind: "doc",
      scope: "project",
      verificationStatus: "verified",
      reviewStatus: "pending",
      reviewDecisions: [
        {
          action: "defer",
          decidedAt: "2026-05-04T12:30:00.000Z",
          note: "Needs <review>",
          evidence: [{ type: "human", value: "<ok>", note: "quoted \"note\"" }],
        },
      ],
      verifiedAt: "2026-05-04T12:00:00.000Z",
      verificationEvidence: [{ type: "link", value: "https://example.test/?x=<script>", note: "safe & sound" }],
      projectId: "project-a",
      containerId: "container-a",
      source: { type: "document", uri: "file:///tmp/<guide>.md", title: "Guide & notes" },
      content: "<script>alert(1)</script> & memory",
      summary: "Unsafe <summary>",
      tags: ["<tag>"],
      importance: 0.9,
      createdAt: "2026-05-04T11:00:00.000Z",
      reasons: ["keyword_<match>"],
    } satisfies ViewerMemory;

    const html = renderMemoryViewerPage(createResult([memory], memory));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("file:///tmp/<guide>.md");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; memory");
    expect(html).toContain("file:///tmp/&lt;guide&gt;.md");
    expect(html).toContain("Needs &lt;review&gt;");
    expect(html).toContain("quoted &quot;note&quot;");
  });

  it("renders a clear empty state when no memories match", () => {
    const html = renderMemoryViewerPage(createResult([], undefined));

    expect(html).toContain("No memories matched the current filters.");
    expect(html).toContain("Select a memory to inspect its source, evidence, and review decisions.");
  });

  it("does not render mutation controls", () => {
    const html = renderMemoryViewerPage(createResult([], undefined));

    expect(html).not.toContain("method=\"post\"");
    expect(html).not.toContain("data-action=");
    expect(html).not.toMatch(/<button[^>]*>\s*(Edit|Promote|Reject|Delete|Reset|Upsert)/i);
  });
});

function createResult(memories: readonly ViewerMemory[], selectedMemory: ViewerMemory | undefined): ViewerLoadResult {
  return {
    filters,
    memories,
    selectedMemory,
    fetchedCount: memories.length,
    fetchMode: "list",
    degraded: false,
    refreshedAt: "2026-05-04T13:00:00.000Z",
  };
}
