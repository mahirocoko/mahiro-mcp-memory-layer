import { describe, expect, it } from "vitest";

import { buildMemoryGraph } from "../src/features/memory-console/graph.js";
import { renderGraphConsolePage, renderMemoryConsolePage, renderPurgeRejectedResultPage, renderRejectedConsolePage, renderReviewConsolePage } from "../src/features/memory-console/render.js";
import type { ConsoleFilterState, ConsoleGraphLoadResult, ConsoleLoadResult, ConsoleMemory, ConsolePurgeRejectedActionResult, ConsoleReviewLoadResult } from "../src/features/memory-console/types.js";
import type { ReviewAssistResult, ReviewQueueOverviewItem } from "../src/features/memory/types.js";

const filters = {
  view: "verified",
  scope: "all",
  kind: "all",
  verificationStatus: "verified",
  reviewStatus: "active",
  limit: 50,
} satisfies ConsoleFilterState;

describe("memory console rendering", () => {
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
    } satisfies ConsoleMemory;

    const html = renderMemoryConsolePage(createResult([memory], memory));

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
    const html = renderMemoryConsolePage(createResult([], undefined));

    expect(html).toContain("No memories matched the current filters.");
    expect(html).toContain("Select a memory to inspect its source, evidence, and review decisions.");
  });

  it("renders console navigation labels without stale scoped ids", () => {
    const html = renderMemoryConsolePage({
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
    expect(html).toContain('>Browse</a>');
    expect(html).toContain('href="/review"');
    expect(html).toContain('>Review Queue</a>');
    expect(html).toContain('href="/rejected"');
    expect(html).toContain('>Rejected</a>');
    expect(html).toContain('href="/graph"');
    expect(html).toContain('>Graph</a>');
    expect(html).not.toContain('>Verified</a>');
    expect(html).not.toContain('>Inbox</a>');
    expect(html).not.toContain('>Firehose</a>');
    expect(html).not.toContain('projectId=project-a&amp;containerId=container-a&amp;id=mem-1');
  });

  it("renders project scope summaries with detail links that populate project filters", () => {
    const html = renderMemoryConsolePage({
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
    const html = renderMemoryConsolePage({
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
    const html = renderMemoryConsolePage(createResult([], undefined));

    expect(html).toContain('<button type="submit">Search</button>');
    expect(html).toContain('<details class="advanced-filters">');
    expect(html).toContain('<summary>Advanced filters</summary>');
    expect(html).toContain('<select name="limit">');
    expect(html).toContain('<option value="25">25</option>');
    expect(html).toContain('<option value="50" selected>50</option>');
    expect(html).not.toContain('max="100"');
    expect(html).not.toContain('<button type="submit">Apply</button>');
  });

  it("renders graph warnings with escaped missing related ids and grouped projection data", () => {
    const memory = createMemory("mem-<graph>", "Graph node content should stay out of graph shape.", {
      source: { type: "document", uri: "file:///tmp/<graph>.md", title: "Graph <source>" },
      tags: ["graph<tag>"],
      verificationEvidence: [{ type: "human", value: "checked<ok>", note: "manual" }],
      reviewDecisions: [
        {
          action: "defer",
          decidedAt: "2026-05-04T12:30:00.000Z",
          note: "needs graph review",
          evidence: [{ type: "test", value: "graph<test>" }],
        },
      ],
    });
    const graph = buildMemoryGraph([memory], {
      related: [
        {
          memoryId: memory.id,
          hints: [{ type: "possible_contradiction", relatedMemoryIds: ["missing-<id>"], note: "not loaded" }],
        },
      ],
    });
    const html = renderGraphConsolePage(createGraphResult(graph, `memory:${memory.id}`));

    expect(html).toContain("Memory graph");
    expect(html).toContain('<form class="filters graph-filters" method="get" action="/graph"');
    expect(html).toContain('<select name="edgeType">');
    expect(html).toContain("Nodes: memory 1 · source 1 · tag 1 · evidence 2");
    expect(html).toContain("Edges: has_source 1 · tagged_with 1 · has_evidence 2 · reviewed_as 1");
    expect(html).toContain("memory (1)");
    expect(html).toContain("source (1)");
    expect(html).toContain("tag (1)");
    expect(html).toContain("evidence (2)");
    expect(html).toContain("has source (1)");
    expect(html).toContain("tagged with (1)");
    expect(html).toContain("has evidence (2)");
    expect(html).toContain("reviewed as (1)");
    expect(html).toContain("memory details");
    expect(html).toContain("Graph &lt;source&gt;");
    expect(html).toContain("Related memory missing-&lt;id&gt; referenced by mem-&lt;graph&gt; was not included in the graph input.");
    expect(html).toContain("missing_related_memory");
    expect(html).not.toContain("missing-<id>");
    expect(html).not.toContain('method="post"');
    expect(html).not.toContain('action="/actions/review"');
    expect(html).not.toContain('action="/actions/promote"');
    expect(html).not.toContain('action="/actions/purge-rejected"');
  });

  it("does not render mutation controls", () => {
    const html = renderMemoryConsolePage(createResult([], undefined));

    expect(html).not.toContain("method=\"post\"");
    expect(html).not.toContain("data-action=");
    expect(html).not.toMatch(/<button[^>]*>\s*(Edit|Promote|Reject|Delete|Reset|Upsert)/i);
  });

  it("renders rejected quarantine with preview-only purge controls and no browse or review mutation bleed-through", () => {
    const rejected = createMemory("mem-rejected", "Rejected <quarantine> memory.", {
      reviewStatus: "rejected",
      summary: "Rejected <summary>",
    });
    const html = renderRejectedConsolePage({
      ...createResult([rejected], rejected),
      filters: rejectedFilters,
      fetchedCount: 4,
    });

    expect(html).toContain("Rejected memory quarantine");
    expect(html).toContain("Only records with <strong>reviewStatus rejected</strong> belong here.");
    expect(html).toContain("Rejected &lt;summary&gt;");
    expect(html).toContain("Rejected &lt;quarantine&gt; memory.");
    expect(html).toContain('method="post" action="/actions/purge-rejected"');
    expect(html).toContain('name="dryRun" value="true"');
    expect(html).toContain('name="ids" value="mem-rejected"');
    expect(html).toContain("Preview purge");
    expect(html).toContain("DELETE REJECTED");
    expect(html).not.toContain('action="/actions/review"');
    expect(html).not.toContain('action="/actions/promote"');
    expect(html).not.toContain('name="action" value="reject"');
    expect(html).not.toContain("Verified active memory.");
    expect(html).not.toContain("Pending memory.");
    expect(html).not.toContain("Deferred memory.");
  });

  it("renders rejected quarantine purge preview with escaped per-id statuses and final typed confirmation", () => {
    const result = {
      status: "accepted",
      dryRun: true,
      outcomes: [
        { id: "mem-<rejected>", status: "dry_run" },
        { id: "mem-pending", status: "skipped_not_rejected" },
      ],
      deletedRecords: [],
      missingIds: [],
    } satisfies ConsolePurgeRejectedActionResult;

    const html = renderPurgeRejectedResultPage(rejectedFilters, {
      ids: ["mem-<rejected>", "mem-pending"],
      scope: "project",
      projectId: "project-a",
      containerId: "container-a",
      confirmation: "DELETE REJECTED",
      dryRun: true,
    }, result);

    expect(html).toContain("Dry-run preview only. No records were deleted.");
    expect(html).toContain("mem-&lt;rejected&gt;");
    expect(html).toContain("dry_run");
    expect(html).toContain("skipped_not_rejected");
    expect(html).toContain('method="post" action="/actions/purge-rejected"');
    expect(html).toContain('placeholder="DELETE REJECTED"');
    expect(html).toContain('name="ids" value="mem-&lt;rejected&gt;"');
    expect(html).not.toContain("mem-<rejected>");
  });

  it("renders review queue overview, advisory assist, and explicit POST actions", () => {
    const reviewItem = createReviewItem();
    const assist = {
      id: reviewItem.id,
      status: "ready",
      hints: reviewItem.hints,
      suggestions: [
        {
          kind: "gather_evidence",
          rationale: "Check the linked issue before promotion <now>.",
          relatedMemoryIds: ["mem-related"],
          draftContent: "Suggested context <draft>",
          suggestedAction: "collect_evidence",
        },
      ],
    } satisfies ReviewAssistResult;
    const html = renderReviewConsolePage(createReviewResult([reviewItem], reviewItem, assist));

    expect(html).toContain("priority 8.75");
    expect(html).toContain("duplicate risk &lt;high&gt;");
    expect(html).toContain("possible_contradiction");
    expect(html).toContain("Conflicts with existing memory &lt;id&gt;");
    expect(html).toContain("Check the linked issue before promotion &lt;now&gt;.");
    expect(html).toContain("Suggested context &lt;draft&gt;");
    expect(html).toContain("Advisory only. Suggestions are not selected, applied, or submitted automatically.");
    expect(html).toContain('method="post" action="/actions/review"');
    expect(html).toContain('method="post" action="/actions/promote"');
    expect(html).toContain('name="action" value="reject"');
    expect(html).toContain('name="action" value="defer"');
    expect(html).toContain('name="action" value="edit_then_promote"');
    expect(html).not.toContain('name="suggestedAction"');
    expect(html).not.toContain('name="draftContent"');
  });
});

function createResult(memories: readonly ConsoleMemory[], selectedMemory: ConsoleMemory | undefined): ConsoleLoadResult {
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

function createGraphResult(
  graph: ConsoleGraphLoadResult["graph"],
  selectedId: string | undefined,
): ConsoleGraphLoadResult {
  const selectedGraphNode = graph.nodes.find((node) => node.id === selectedId);
  return {
    ...createResult([], undefined),
    filters: {
      ...filters,
      view: "projects",
      verificationStatus: "all",
      ...(selectedId ? { selectedId } : {}),
    },
    graph,
    ...(selectedGraphNode ? { selectedGraphNode } : {}),
  };
}

const rejectedFilters = {
  ...filters,
  view: "firehose",
  verificationStatus: "all",
  reviewStatus: "rejected",
  scope: "project",
  projectId: "project-a",
  containerId: "container-a",
} satisfies ConsoleFilterState;

function createMemory(
  id: string,
  content: string,
  overrides: Partial<ConsoleMemory> = {},
): ConsoleMemory {
  return {
    id,
    kind: "fact",
    scope: "project",
    verificationStatus: "verified",
    reviewDecisions: [],
    verificationEvidence: [],
    projectId: "project-a",
    containerId: "container-a",
    source: { type: "manual", title: "Console source" },
    content,
    tags: [],
    importance: 0.5,
    createdAt: "2026-05-04T12:00:00.000Z",
    reasons: [],
    ...overrides,
  };
}

function createReviewResult(
  reviewItems: readonly ReviewQueueOverviewItem[],
  selectedReviewItem: ReviewQueueOverviewItem | undefined,
  reviewAssist: ReviewAssistResult | undefined,
): ConsoleReviewLoadResult {
  return {
    filters: {
      ...filters,
      view: "inbox",
      verificationStatus: "hypothesis",
      reviewStatus: "pending",
    },
    reviewItems,
    selectedReviewItem,
    reviewAssist,
    refreshedAt: "2026-05-04T13:00:00.000Z",
  };
}

function createReviewItem(): ReviewQueueOverviewItem {
  return {
    id: "review-1",
    kind: "fact",
    scope: "project",
    content: "Needs review <content>.",
    summary: "Needs review <summary>.",
    verificationStatus: "hypothesis",
    reviewStatus: "pending",
    reviewDecisions: [],
    source: { type: "manual", title: "Review <source>" },
    tags: ["queue"],
    importance: 0.8,
    createdAt: "2026-05-04T12:00:00.000Z",
    priorityScore: 8.75,
    priorityReasons: ["duplicate risk <high>"],
    hints: [
      {
        type: "possible_contradiction",
        relatedMemoryIds: ["mem-related"],
        note: "Conflicts with existing memory <id>",
      },
    ],
  };
}
