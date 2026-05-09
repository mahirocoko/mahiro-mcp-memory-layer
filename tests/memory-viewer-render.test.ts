import { describe, expect, it } from "vitest";

import { renderMemoryViewerPage } from "../src/features/memory-viewer/render.js";
import type { ViewerFilterState, ViewerLoadResult, ViewerMemory } from "../src/features/memory-viewer/types.js";

const filters = {
  view: "verified",
  scope: "all",
  kind: "all",
  verificationStatus: "verified",
  reviewStatus: "active",
  limit: 50,
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
    expect(html).toContain("<h2>Memory details</h2>");
    expect(html).toContain('<span class="signal-badge verification-verified">verified</span>');
    expect(html).toContain('<span class="signal-badge review-pending">pending</span>');
    expect(html).toContain('<details class="technical-details">');
    expect(html).toContain("<summary>Technical metadata</summary>");
    expect(html).toContain("<h3>Summary</h3>");
    expect(html).toContain("Unsafe &lt;summary&gt;");
    expect(html).toContain("Evidence: human: &lt;ok&gt; — quoted &quot;note&quot;");
    expect(html).not.toContain("Decision evidence");
  });

  it("renders a clear empty state when no memories match", () => {
    const html = renderMemoryViewerPage(createResult([], undefined));

    expect(html).toContain("No memories matched the current filters.");
    expect(html).toContain("Select a memory to inspect its source, evidence, and review decisions.");
  });

  it("renders signal-first navigation links without stale scoped ids", () => {
    const html = renderMemoryViewerPage({
      ...createResult([], undefined),
      filters: {
        ...filters,
        query: "profile",
        scope: "project",
        projectId: "project-a",
        containerId: "container-a",
        selectedId: "mem-1",
      },
    });

    expect(html).toContain('href="/"');
    expect(html).toContain('>Verified</a>');
    expect(html).toContain('href="/?view=inbox"');
    expect(html).toContain('href="/?view=projects"');
    expect(html).toContain('href="/?view=firehose"');
    expect(html).not.toContain('projectId=project-a&amp;containerId=container-a&amp;id=mem-1');
  });

  it("renders project scope summaries with detail links that populate project filters", () => {
    const html = renderMemoryViewerPage({
      ...createResult([], undefined),
      filters: {
        ...filters,
        view: "projects",
      },
      projectScopes: [
        {
          projectId: "project-a",
          containerId: "container-a",
          totalCount: 2,
          kindCounts: { fact: 1, conversation: 0, decision: 0, doc: 1, task: 0 },
          verificationStatusCounts: { hypothesis: 1, verified: 1 },
          reviewStatusCounts: { none: 1, pending: 1, deferred: 0, rejected: 0 },
          latestTimestamp: "2026-05-04T12:30:00.000Z",
        },
      ],
    });

    expect(html).toContain("<strong>1</strong> project/container scope discovered from canonical records");
    expect(html).toContain('href="/?scope=project&amp;projectId=project-a&amp;containerId=container-a"');
    expect(html).toContain("fact 1");
    expect(html).toContain("doc 1");
    expect(html).toContain("verified 1");
    expect(html).toContain("pending 1");
    expect(html).not.toContain("conversation 0");
    expect(html).not.toContain("deferred 0");
    expect(html).not.toContain("count-stack");
    expect(html).toContain("latest 2026-05-04T12:30:00.000Z");
  });

  it("renders scoped project filters as read-only context with hidden inputs", () => {
    const html = renderMemoryViewerPage({
      ...createResult([], undefined),
      filters: {
        ...filters,
        scope: "project",
        projectId: "project-a",
        containerId: "container-a",
      },
    });

    expect(html).toContain('class="scope-context"');
    expect(html).toContain('<input type="hidden" name="scope" value="project">');
    expect(html).toContain('<input type="hidden" name="projectId" value="project-a">');
    expect(html).toContain('<input type="hidden" name="containerId" value="container-a">');
    expect(html).not.toContain('<span>Project ID</span>');
    expect(html).not.toContain('<span>Container ID</span>');
  });

  it("renders the limit control as a 25 or 50 select", () => {
    const html = renderMemoryViewerPage(createResult([], undefined));

    expect(html).toContain('<button type="submit">Search</button>');
    expect(html).toContain('<details class="advanced-filters">');
    expect(html).toContain('<summary>Advanced filters</summary>');
    expect(html).toContain('<select name="limit">');
    expect(html).toContain('<option value="25">25</option>');
    expect(html).toContain('<option value="50" selected>50</option>');
    expect(html).not.toContain('max="100"');
    expect(html).not.toContain('<button type="submit">Apply</button>');
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
    projectScopes: [],
    selectedMemory,
    fetchedCount: memories.length,
    fetchMode: "list",
    degraded: false,
    refreshedAt: "2026-05-04T13:00:00.000Z",
  };
}
