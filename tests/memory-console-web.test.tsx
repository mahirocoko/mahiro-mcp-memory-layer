import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryConsoleShell, PurgeRejectedResultSummary, ReviewMutationAlert } from "../src/features/memory-console/web/src/App.js";
import {
  apiSearchParamsForRoute,
  createRouteState,
  memoryViewHref,
  projectBrowseHref,
  routeHref,
} from "../src/features/memory-console/web/src/lib/routes.js";
import { ConsoleApiRequestError, submitPromote, submitPurgeRejected, submitReview } from "../src/features/memory-console/web/src/lib/api.js";
import type { ConsoleLoadState } from "../src/features/memory-console/web/src/types.js";
import type { ConsoleApiSuccessResponse, ConsoleGraphLoadResult, ConsoleLoadResult, ConsoleMemory, ConsoleReviewLoadResult } from "../src/features/memory-console/types.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("memory console React shell", () => {
  it("derives active navigation from the path and preserves selected query ids in links and filters", () => {
    const routeState = createRouteState("/review?id=mem-pending&scope=project");
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data: createReviewLoadResult() }} routeState={routeState} />,
    );

    expect(html).toContain('href="/?id=mem-pending&amp;scope=project"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Filter memory console records"');
    expect(html).toContain('name="id"');
    expect(html).toContain('value="mem-pending"');
    expect(html).toContain('href="/review?id=mem-pending&amp;scope=project"');
    expect(html).toContain("Needs review.");
    expect(html).toContain("Actions");
  });

  it("renders selected review detail, hints, and assist suggestions", () => {
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data: createReviewLoadResult() }} routeState={createRouteState("/review?id=mem-pending")} />,
    );

    expect(html).toContain("Review hints");
    expect(html).toContain("likely_duplicate");
    expect(html).toContain("related mem-existing");
    expect(html).toContain("Assist suggestions");
    expect(html).toContain("merge_duplicate");
    expect(html).toContain("Draft: Merged duplicate memory content.");
    expect(html).toContain("Reviewer note");
    expect(html).toContain('aria-label="Reject review item mem-pending"');
    expect(html).toContain("Edit then promote");
    expect(html).toContain("Promote");
  });

  it("renders invalid and unavailable mutation errors with distinguishable copy", () => {
    const invalidHtml = renderToStaticMarkup(
      <ReviewMutationAlert state={{ status: "error", error: { action: "review", code: "invalid_payload", message: "Evidence is required.", statusCode: 400 } }} />,
    );
    const unavailableHtml = renderToStaticMarkup(
      <ReviewMutationAlert state={{ status: "error", error: { action: "promote", code: "unavailable", message: "Promote actions are unavailable.", statusCode: 501 } }} />,
    );

    expect(invalidHtml).toContain("Action failed");
    expect(invalidHtml).toContain("400 (invalid_payload): Evidence is required.");
    expect(unavailableHtml).toContain("Action unavailable");
    expect(unavailableHtml).toContain("501 (unavailable): Promote actions are unavailable.");
  });

  it("renders purge confirmation errors visibly without needing a server mutation", () => {
    const html = renderToStaticMarkup(
      <ReviewMutationAlert state={{ status: "error", error: { action: "purge-rejected", code: "invalid_payload", message: "Confirmation must be DELETE REJECTED.", statusCode: 400 } }} />,
    );

    expect(html).toContain("Action failed");
    expect(html).toContain("purge-rejected returned 400 (invalid_payload): Confirmation must be DELETE REJECTED.");
  });

  it("renders a route loading state without needing loaded API data", () => {
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "loading" }} routeState={createRouteState("/review")} />,
    );

    expect(html).toContain("Loading Review");
    expect(html).toContain('aria-busy="true"');
  });

  it("renders API errors with retry affordance", () => {
    const loadState = { status: "error", message: "Memory console request failed." } satisfies ConsoleLoadState;
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={loadState} routeState={createRouteState("/graph?edgeType=related_memory")} />,
    );

    expect(html).toContain("Could not load Graph");
    expect(html).toContain("Memory console request failed.");
    expect(html).toContain("Retry");
  });

  it("keeps rejected-route API defaults separate from the deep-link query string", () => {
    const routeState = createRouteState("/rejected?id=mem-rejected");
    const apiParams = apiSearchParamsForRoute(routeState);

    expect(routeHref("/graph", routeState)).toBe("/graph?id=mem-rejected");
    expect(apiParams.get("id")).toBe("mem-rejected");
    expect(apiParams.get("view")).toBe("firehose");
    expect(apiParams.get("verificationStatus")).toBe("all");
    expect(apiParams.get("reviewStatus")).toBe("rejected");
  });

  it("builds memory view URLs without carrying selected detail state into view switches", () => {
    const params = createRouteState("/?q=console&id=mem-1&scope=project&projectId=project-a&containerId=container-a").searchParams;

    expect(memoryViewHref("projects", params)).toBe("/?q=console&scope=project&projectId=project-a&containerId=container-a&view=projects");
    expect(memoryViewHref("firehose", params)).toBe("/?q=console&scope=project&projectId=project-a&containerId=container-a&view=firehose&verificationStatus=all&reviewStatus=all");
    expect(memoryViewHref("verified", new URLSearchParams("view=firehose&id=mem-1&verificationStatus=all&reviewStatus=all"))).toBe("/");
  });

  it("renders browse filters, memory rows, and selected memory detail", () => {
    const routeState = createRouteState("/?q=console&scope=project&projectId=project-a&containerId=container-a&id=mem-safe&limit=10");
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data: createMemoryLoadResult() }} routeState={routeState} />,
    );

    expect(html).toContain('name="q"');
    expect(html).toContain('value="console"');
    expect(html).toContain('name="limit"');
    expect(html).toContain('value="10"');
    expect(html).toContain("Search and filter canonical memories");
    expect(html).toContain('href="/?q=console&amp;scope=project&amp;projectId=project-a&amp;containerId=container-a&amp;id=mem-safe&amp;limit=10"');
    expect(html).toContain("Selected safe summary");
    expect(html).toContain("Verification evidence");
    expect(html).toContain("trace-1");
    expect(html).toContain("chat import");
  });

  it("renders the read-only graph canvas, selected node details, warnings, and browse links", () => {
    const routeState = createRouteState("/graph?scope=project&projectId=project-a&containerId=container-a&id=memory%3Amem-safe");
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data: createGraphLoadResult() }} routeState={routeState} />,
    );

    expect(html).toContain("Read-only projection of canonical memory metadata");
    expect(html).toContain("Memory graph layout");
    expect(html).toContain('aria-label="Accessible graph text fallback"');
    expect(html).toContain('aria-label="Select graph node Selected safe summary"');
    expect(html).toContain('class="graph-node graph-node-memory graph-node-selected"');
    expect(html).toContain("Selected safe summary");
    expect(html).toContain("Open browse detail");
    expect(html).toContain('href="/?scope=project&amp;projectId=project-a&amp;containerId=container-a&amp;id=mem-safe"');
    expect(html).toContain("missing_related_memory");
  });

  it("filters graph edges through route state while preserving text fallback lists", () => {
    const graphData = createGraphLoadResult({
      filters: { ...createGraphLoadResult().filters, graphEdgeType: "tagged_with" },
    });
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data: graphData }} routeState={createRouteState("/graph?edgeType=tagged_with")} />,
    );

    expect(html).toContain("Showing 1 of 4 total edges because an edge type filter is active.");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('class="graph-filter-link graph-filter-link-active"');
    expect(html).toContain("tagged_with (1)");
    expect(html).toContain("No has_source edges with the current filters.");
  });

  it("renders projects summaries with links into filtered browse scope", () => {
    const routeState = createRouteState("/?view=projects");
    const data = createMemoryLoadResult({ filters: { ...createMemoryLoadResult().filters, view: "projects" } });
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data }} routeState={routeState} />,
    );

    expect(projectBrowseHref(data.projectScopes[0], routeState.searchParams)).toBe("/?scope=project&verificationStatus=all&reviewStatus=all&projectId=project-a&containerId=container-a");
    expect(html).toContain("Project and container scope summaries");
    expect(html).toContain("project-a");
    expect(html).toContain("container-a");
    expect(html).toContain('href="/?scope=project&amp;verificationStatus=all&amp;reviewStatus=all&amp;projectId=project-a&amp;containerId=container-a"');
  });

  it("labels firehose as raw recent/list mode rather than reviewed truth", () => {
    const data = createMemoryLoadResult({ filters: { ...createMemoryLoadResult().filters, view: "firehose", verificationStatus: "all", reviewStatus: "all" } });
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data }} routeState={createRouteState("/?view=firehose&verificationStatus=all&reviewStatus=all")} />,
    );

    expect(html).toContain("Raw recent/list mode");
    expect(html).toContain("not a reviewed or approved truth view");
  });

  it("renders unsafe memory content as escaped text", () => {
    const unsafeMemory = createMemory({
      id: "mem-unsafe",
      content: "<script>alert(1)</script> & memory",
      summary: "Unsafe <summary>",
      source: { type: "document", title: "Guide <title>", uri: "file:///tmp/<guide>.md" },
      verificationEvidence: [{ type: "link", value: "https://example.test/?x=<script>", note: "safe & sound" }],
      reviewDecisions: [
        {
          action: "defer",
          decidedAt: "2026-05-11T04:03:00.000Z",
          note: "Needs <review>",
          evidence: [{ type: "human", value: "<ok>", note: "quoted <note>" }],
        },
      ],
      tags: ["<tag>"],
      reasons: ["keyword_<match>"],
    });
    const data = createMemoryLoadResult({ memories: [unsafeMemory], selectedMemory: unsafeMemory });
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data }} routeState={createRouteState("/?id=mem-unsafe")} />,
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; memory");
    expect(html).toContain("Unsafe &lt;summary&gt;");
    expect(html).toContain("Guide &lt;title&gt;");
    expect(html).toContain("file:///tmp/&lt;guide&gt;.md");
    expect(html).toContain("https://example.test/?x=&lt;script&gt;");
    expect(html).toContain("safe &amp; sound");
    expect(html).toContain("Needs &lt;review&gt;");
    expect(html).toContain("&lt;ok&gt;");
    expect(html).toContain("quoted &lt;note&gt;");
    expect(html).toContain("#&lt;tag&gt;");
    expect(html).toContain("keyword_&lt;match&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("file:///tmp/<guide>.md");
    expect(html).not.toContain("Needs <review>");
  });

  it("renders rejected quarantine with scope context and guarded purge controls", () => {
    const rejectedMemory = createMemory({ id: "mem-rejected", reviewStatus: "rejected", verificationStatus: "hypothesis", summary: "Rejected fixture" });
    const data = createMemoryLoadResult({
      filters: {
        ...createMemoryLoadResult().filters,
        view: "firehose",
        verificationStatus: "all",
        reviewStatus: "rejected",
        selectedId: "mem-rejected",
      },
      memories: [rejectedMemory],
      selectedMemory: rejectedMemory,
      fetchedCount: 1,
    });
    const html = renderToStaticMarkup(
      <MemoryConsoleShell loadState={{ status: "success", data }} routeState={createRouteState("/rejected?id=mem-rejected&scope=project&projectId=project-a&containerId=container-a")} />,
    );

    expect(html).toContain("Rejected quarantine");
    expect(html).toContain("rejected-only");
    expect(html).toContain("Guarded purge");
    expect(html).toContain("project-a");
    expect(html).toContain("container-a");
    expect(html).toContain("Queued count");
    expect(html).toContain("mem-rejected");
    expect(html).toContain('aria-describedby="purge-confirmation-help"');
    expect(html).toContain('aria-label="Preview purge for project rejected scope"');
    expect(html).toContain("DELETE REJECTED");
    expect(html).toContain("Preview purge");
    expect(html).toContain("Purge rejected");
  });

  it("renders purge result counts and per-id statuses", () => {
    const html = renderToStaticMarkup(
      <PurgeRejectedResultSummary result={{
        status: "accepted",
        dryRun: false,
        outcomes: [
          { id: "mem-deleted", status: "deleted" },
          { id: "mem-pending", status: "skipped_not_rejected" },
        ],
        deletedRecords: [],
        missingIds: [],
      }} />,
    );

    expect(html).toContain("Purge result");
    expect(html).toContain("Deleted 1, skipped 1");
    expect(html).toContain("mem-deleted: deleted");
    expect(html).toContain("mem-pending: skipped_not_rejected");
  });
});

function createReviewLoadResult(): ConsoleReviewLoadResult {
  const item = {
    id: "mem-pending",
    kind: "fact",
    scope: "project",
    content: "Needs review.",
    verificationStatus: "hypothesis",
    reviewStatus: "pending",
    reviewDecisions: [],
    source: { type: "manual" },
    tags: ["console"],
    importance: 0.5,
    createdAt: "2026-05-11T04:00:00.000Z",
    priorityScore: 9.25,
    priorityReasons: ["pending review", "duplicate candidate"],
    hints: [{ type: "likely_duplicate", relatedMemoryIds: ["mem-existing"], note: "Matches existing reviewed memory." }],
  } as const;

  return {
    filters: {
      view: "inbox",
      scope: "project",
      kind: "all",
      verificationStatus: "all",
      reviewStatus: "active",
      projectId: "project-a",
      containerId: "container-a",
      selectedId: "mem-pending",
      limit: 50,
      graphEdgeType: "all",
    },
    reviewItems: [item],
    selectedReviewItem: item,
    reviewAssist: {
      id: "mem-pending",
      status: "ready",
      hints: [{ type: "likely_duplicate", relatedMemoryIds: ["mem-existing"], note: "Assist confirms duplicate context." }],
      suggestions: [
        {
          kind: "merge_duplicate",
          rationale: "Merge with the existing verified memory before promotion.",
          relatedMemoryIds: ["mem-existing"],
          draftContent: "Merged duplicate memory content.",
          suggestedAction: "edit_then_promote",
        },
      ],
    },
    refreshedAt: "2026-05-11T04:05:00.000Z",
  };
}

function createGraphLoadResult(overrides: Partial<ConsoleGraphLoadResult> = {}): ConsoleGraphLoadResult {
  const base = createMemoryLoadResult();
  const memoryNode = {
    id: "memory:mem-safe",
    type: "memory",
    label: "Selected safe summary",
    memoryId: "mem-safe",
    metadata: { kind: "fact", scope: "project", verificationStatus: "verified" },
  } as const;
  const graph = {
    nodes: [
      memoryNode,
      { id: "source:chat:memory://chat/1:chat import", type: "source", label: "chat: chat import", metadata: { sourceType: "chat", title: "chat import", uri: "memory://chat/1" } },
      { id: "tag:console", type: "tag", label: "console", metadata: { tag: "console" } },
      { id: "evidence:trace:trace-1", type: "evidence", label: "trace: trace-1", metadata: { evidenceType: "trace", value: "trace-1" } },
    ],
    edges: [
      { id: "memory:mem-safe->source:chat:memory://chat/1:chat import:has_source", type: "has_source", source: "memory:mem-safe", target: "source:chat:memory://chat/1:chat import", label: "has source" },
      { id: "memory:mem-safe->tag:console:tagged_with", type: "tagged_with", source: "memory:mem-safe", target: "tag:console", label: "tagged with" },
      { id: "memory:mem-safe->evidence:trace:trace-1:has_evidence", type: "has_evidence", source: "memory:mem-safe", target: "evidence:trace:trace-1", label: "has evidence" },
      { id: "memory:mem-safe->memory:mem-safe:reviewed_as", type: "reviewed_as", source: "memory:mem-safe", target: "memory:mem-safe", label: "edit_then_promote" },
    ],
    warnings: [
      {
        type: "missing_related_memory",
        memoryId: "mem-safe",
        relatedMemoryId: "mem-missing",
        relationSource: "review_hint",
        relationType: "likely_duplicate",
        message: "Related memory mem-missing was not included in the current graph projection.",
      },
    ],
  } as const;

  return {
    ...base,
    filters: {
      ...base.filters,
      selectedId: memoryNode.id,
      graphEdgeType: "all",
    },
    graph,
    selectedGraphNode: memoryNode,
    ...overrides,
  };
}

function createMemoryLoadResult(overrides: Partial<ConsoleLoadResult> = {}): ConsoleLoadResult {
  const memory = createMemory();
  return {
    filters: {
      view: "verified",
      scope: "project",
      kind: "all",
      verificationStatus: "verified",
      reviewStatus: "active",
      projectId: "project-a",
      containerId: "container-a",
      selectedId: memory.id,
      limit: 10,
      graphEdgeType: "all",
    },
    memories: [memory],
    selectedMemory: memory,
    projectScopes: [
      {
        projectId: "project-a",
        containerId: "container-a",
        totalCount: 2,
        kindCounts: { fact: 1, conversation: 0, decision: 0, doc: 1, task: 0 },
        verificationStatusCounts: { hypothesis: 1, verified: 1 },
        reviewStatusCounts: { none: 1, pending: 1, deferred: 0, rejected: 0 },
        latestTimestamp: "2026-05-11T04:02:00.000Z",
      },
    ],
    fetchedCount: 1,
    fetchMode: "list",
    degraded: false,
    refreshedAt: "2026-05-11T04:05:00.000Z",
    ...overrides,
  };
}

function createMemory(overrides: Partial<ConsoleMemory> = {}): ConsoleMemory {
  return {
    id: "mem-safe",
    kind: "fact",
    scope: "project",
    verificationStatus: "verified",
    reviewStatus: undefined,
    reviewDecisions: [
      {
        action: "edit_then_promote",
        decidedAt: "2026-05-11T04:03:00.000Z",
        note: "Confirmed safe detail rendering.",
        evidence: [{ type: "human", value: "reviewer", note: "approved" }],
      },
    ],
    verifiedAt: "2026-05-11T04:04:00.000Z",
    verificationEvidence: [{ type: "trace", value: "trace-1", note: "loaded through console" }],
    projectId: "project-a",
    containerId: "container-a",
    source: { type: "chat", title: "chat import", uri: "memory://chat/1" },
    content: "Console memory content.",
    summary: "Selected safe summary",
    tags: ["console", "safe"],
    importance: 0.75,
    createdAt: "2026-05-11T04:00:00.000Z",
    updatedAt: "2026-05-11T04:02:00.000Z",
    score: 0.9,
    reasons: ["query match"],
    ...overrides,
  };
}


describe("memory console JSON review API client", () => {
  it("submits review mutations through the JSON API", async () => {
    const responseBody = {
      status: "ok",
      action: "review",
      result: {
        id: "mem-pending",
        status: "accepted",
        action: "defer",
        reviewStatus: "deferred",
        verificationStatus: "hypothesis",
        reviewDecisions: [],
        verificationEvidence: [],
      },
    } satisfies ConsoleApiSuccessResponse;

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(submitReview({ id: "mem-pending", action: "defer", note: "Needs more evidence." })).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith("/api/review", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ id: "mem-pending", action: "defer", note: "Needs more evidence." }),
    }));
  });

  it("submits guarded rejected purge mutations through the JSON API", async () => {
    const responseBody = {
      status: "ok",
      action: "purge-rejected",
      result: {
        status: "accepted",
        dryRun: false,
        outcomes: [{ id: "mem-rejected", status: "deleted" }],
        deletedRecords: [],
        missingIds: [],
      },
    } satisfies ConsoleApiSuccessResponse;

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(submitPurgeRejected({
      ids: ["mem-rejected"],
      scope: "project",
      projectId: "project-a",
      containerId: "container-a",
      confirmation: "DELETE REJECTED",
    })).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith("/api/purge-rejected", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        ids: ["mem-rejected"],
        scope: "project",
        projectId: "project-a",
        containerId: "container-a",
        confirmation: "DELETE REJECTED",
      }),
    }));
  });

  it("preserves invalid and unavailable API error details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "error",
        action: "review",
        error: { code: "invalid_payload", message: "Invalid review action: memoryId is required." },
      }), { status: 400, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "error",
        action: "promote",
        error: { code: "unavailable", message: "Promote actions are unavailable for this console backend." },
      }), { status: 501, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(submitReview({ id: "", action: "reject" })).rejects.toMatchObject({
      action: "review",
      code: "invalid_payload",
      message: "Invalid review action: memoryId is required.",
      statusCode: 400,
    } satisfies Partial<ConsoleApiRequestError>);

    await expect(submitPromote({ id: "mem-pending", evidence: [{ type: "human", value: "reviewer" }] })).rejects.toMatchObject({
      action: "promote",
      code: "unavailable",
      message: "Promote actions are unavailable for this console backend.",
      statusCode: 501,
    } satisfies Partial<ConsoleApiRequestError>);
  });
});
