import type { Server } from "node:http";
import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createMemoryConsoleBackend } from "../src/features/memory-console/reader.js";
import { createMemoryConsoleServer, loadConsoleMemories, memoryConsoleHost } from "../src/features/memory-console/server.js";
import type { MemoryConsoleBackend } from "../src/features/memory-console/types.js";
import type { MemoryRecord, PromoteMemoryResult, PurgeRejectedMemoriesResult, ReviewAssistResult, ReviewMemoryResult, ReviewQueueOverviewItem, SearchMemoriesInput, SearchMemoriesResult } from "../src/features/memory/types.js";

describe("memory console server", () => {
  it("is localhost-only", () => {
    expect(memoryConsoleHost).toBe("127.0.0.1");
  });

  it("loads non-indexed results from canonical records after console filters", async () => {
    const reader = createReader({
      records: [
        createRecord("mem-noise", "Hypothesis noise."),
        {
          ...createRecord("mem-keep", "Memory console lists records."),
          verificationStatus: "verified",
          createdAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    const result = await loadConsoleMemories(reader, {
      view: "verified",
      query: "console",
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

  it("applies the display limit after non-indexed console filters", async () => {
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

    const result = await loadConsoleMemories(reader, {
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

    const result = await loadConsoleMemories(reader, {
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

    const result = await loadConsoleMemories(reader, {
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

    const result = await loadConsoleMemories(reader, {
      view: "verified",
      scope: "all",
      kind: "all",
      verificationStatus: "verified",
      reviewStatus: "active",
      limit: 50,
    });

    expect(result.memories.map((memory) => memory.id)).toEqual(["mem-verified"]);
  });

  it("serves GET / as the React shell and exposes browse data through JSON API", async () => {
    const reviewMemory = vi.fn(async () => createReviewAcceptedResult("mem-verified", "reject"));
    const promoteMemory = vi.fn(async () => createPromoteAcceptedResult("mem-verified"));
    const reader = createReader({
      records: [
        {
          ...createRecord("mem-verified", "Browseable memory."),
          verificationStatus: "verified",
        },
      ],
      searchResult: { items: [], degraded: false },
      reviewMemory,
      promoteMemory,
    });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/", baseUrl));
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expectShellHtml(body);
      expect(body).not.toContain("Browseable memory.");
      expect(body).not.toContain('method="post" action="/actions/review"');
      expect(reader.readAll).not.toHaveBeenCalled();

      const apiResponse = await fetch(new URL("/api/memories", baseUrl));
      const apiBody = await apiResponse.json() as { readonly memories: readonly { readonly id: string; readonly content: string }[] };

      expect(apiResponse.status).toBe(200);
      expect(apiResponse.headers.get("content-type")).toContain("application/json");
      expect(apiBody.memories).toMatchObject([{ id: "mem-verified", content: "Browseable memory." }]);
      expect(reviewMemory).not.toHaveBeenCalled();
      expect(promoteMemory).not.toHaveBeenCalled();
    });
  });

  it("serves GET /review as the React shell and exposes review queue data through JSON API", async () => {
    const reviewItem = createReviewOverviewItem("mem-pending", "Needs review.");
    const assist = createReviewAssist(reviewItem.id);
    const reader = createReader({
      records: [
        {
          ...createRecord("mem-pending", "Needs review."),
          reviewStatus: "pending",
        },
      ],
      searchResult: { items: [], degraded: false },
      reviewItems: [reviewItem],
      reviewAssist: assist,
    });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/review", baseUrl));
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expectShellHtml(body);
      expect(body).not.toContain("Needs review.");
      expect(body).not.toContain('method="post" action="/actions/review"');
      expect(reader.listReviewQueueOverview).not.toHaveBeenCalled();
      expect(reader.getReviewAssist).not.toHaveBeenCalled();

      const apiResponse = await fetch(new URL("/api/review", baseUrl));
      const apiBody = await apiResponse.json() as {
        readonly reviewItems: readonly { readonly id: string; readonly content: string; readonly priorityScore: number; readonly hints: readonly { readonly type: string }[] }[];
        readonly selectedReviewItem?: { readonly id: string; readonly content: string };
        readonly reviewAssist?: { readonly suggestions: readonly { readonly rationale: string }[] };
      };

      expect(apiResponse.status).toBe(200);
      expect(apiResponse.headers.get("content-type")).toContain("application/json");
      expect(apiBody.reviewItems).toHaveLength(1);
      expect(apiBody.reviewItems[0]).toMatchObject({ id: "mem-pending", content: "Needs review.", priorityScore: 9.25 });
      expect(apiBody.reviewItems[0]?.hints.map((hint) => hint.type)).toContain("possible_contradiction");
      expect(apiBody.selectedReviewItem).toMatchObject({ id: reviewItem.id, content: "Needs review." });
      expect(apiBody.reviewAssist?.suggestions.map((suggestion) => suggestion.rationale)).toContain("Assist rationale");
      expect(reader.listReviewQueueOverview).toHaveBeenCalledWith({ projectId: undefined, containerId: undefined, limit: 50 });
      expect(reader.getReviewAssist).toHaveBeenCalledWith({ id: reviewItem.id });
    });
  });

  it("serves GET /rejected as the React shell and exposes rejected list data through JSON API filters", async () => {
    const reader = createReader({
      records: [
        {
          ...createRecord("mem-rejected", "Rejected memory."),
          reviewStatus: "rejected",
        },
        {
          ...createRecord("mem-verified", "Verified active memory."),
          verificationStatus: "verified",
        },
        {
          ...createRecord("mem-pending", "Pending memory."),
          reviewStatus: "pending",
        },
        {
          ...createRecord("mem-deferred", "Deferred memory."),
          reviewStatus: "deferred",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/rejected", baseUrl));
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expectShellHtml(body);
      expect(body).not.toContain("Rejected memory.");
      expect(body).not.toContain('method="post" action="/actions/purge-rejected"');
      expect(reader.readAll).not.toHaveBeenCalled();

      const apiUrl = new URL("/api/memories", baseUrl);
      apiUrl.searchParams.set("view", "firehose");
      apiUrl.searchParams.set("verificationStatus", "all");
      apiUrl.searchParams.set("reviewStatus", "rejected");
      const apiResponse = await fetch(apiUrl);
      const apiBody = await apiResponse.json() as { readonly memories: readonly { readonly id: string; readonly content: string; readonly reviewStatus?: string }[] };

      expect(apiResponse.status).toBe(200);
      expect(apiBody.memories).toMatchObject([{ id: "mem-rejected", content: "Rejected memory.", reviewStatus: "rejected" }]);
      expect(apiBody.memories.map((memory) => memory.content)).not.toContain("Verified active memory.");
      expect(apiBody.memories.map((memory) => memory.content)).not.toContain("Pending memory.");
      expect(apiBody.memories.map((memory) => memory.content)).not.toContain("Deferred memory.");
    });
  });

  it("purge confirmation dry-run renders preview and does not require typed confirmation", async () => {
    const purgeRejectedMemories = vi.fn(async () => createPurgeResult(true, [
      { id: "mem-rejected", status: "dry_run" },
      { id: "mem-pending", status: "skipped_not_rejected" },
    ]));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, purgeRejectedMemories });

    await withConsoleServer(reader, async (baseUrl) => {
      const body = new URLSearchParams({ scope: "project", projectId: "project-a", containerId: "container-a", dryRun: "true" });
      body.append("ids", "mem-rejected");
      body.append("ids", "mem-pending");
      const response = await fetch(new URL("/actions/purge-rejected", baseUrl), { method: "POST", body });
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain("Rejected purge preview");
      expect(html).toContain("Dry-run preview only. No records were deleted.");
      expect(html).toContain("mem-rejected");
      expect(html).toContain("dry_run");
      expect(html).toContain("skipped_not_rejected");
      expect(html).toContain('method="post" action="/actions/purge-rejected"');
      expect(html.match(/name="ids"/g)).toHaveLength(2);
      expect(html).toContain('<input type="hidden" name="ids" value="mem-rejected">');
      expect(html).toContain('<input type="hidden" name="ids" value="mem-pending">');
      expect(html).toContain('<input type="hidden" name="scope" value="project">');
      expect(html).toContain('<input type="hidden" name="projectId" value="project-a">');
      expect(html).toContain('<input type="hidden" name="containerId" value="container-a">');
      expect(html).toContain('input name="confirmation"');
      expect(html).not.toContain('name="dryRun"');
      expect(html).toContain('placeholder="DELETE REJECTED"');
      expect(purgeRejectedMemories).toHaveBeenCalledWith({
        ids: ["mem-rejected", "mem-pending"],
        scope: "project",
        projectId: "project-a",
        containerId: "container-a",
        confirmation: "DELETE REJECTED",
        dryRun: true,
      });
    });
  });

  it("purge confirmation rejects missing or wrong final confirmation without calling the purge service", async () => {
    const purgeRejectedMemories = vi.fn(async () => createPurgeResult(false, [{ id: "mem-rejected", status: "deleted" }]));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, purgeRejectedMemories });

    await withConsoleServer(reader, async (baseUrl) => {
      const missing = await fetch(new URL("/actions/purge-rejected", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ ids: "mem-rejected", scope: "global" }),
      });
      const wrong = await fetch(new URL("/actions/purge-rejected", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ ids: "mem-rejected", scope: "global", confirmation: "purge-rejected" }),
      });

      expect(missing.status).toBe(400);
      expect(await missing.text()).toBe("Invalid purge-rejected action: confirmation must be DELETE REJECTED.");
      expect(wrong.status).toBe(400);
      expect(await wrong.text()).toBe("Invalid purge-rejected action: confirmation must be DELETE REJECTED.");
      expect(purgeRejectedMemories).not.toHaveBeenCalled();
    });
  });

  it("purge confirmation final POST renders mixed per-id success and failure results", async () => {
    const purgeRejectedMemories = vi.fn(async () => createPurgeResult(false, [
      { id: "mem-deleted", status: "deleted" },
      { id: "mem-pending", status: "skipped_not_rejected" },
      { id: "mem-missing", status: "skipped_not_found" },
    ]));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, purgeRejectedMemories });

    await withConsoleServer(reader, async (baseUrl) => {
      const body = new URLSearchParams({ scope: "global", confirmation: "DELETE REJECTED" });
      body.append("ids", "mem-deleted");
      body.append("ids", "mem-pending");
      body.append("ids", "mem-missing");
      const response = await fetch(new URL("/actions/purge-rejected", baseUrl), { method: "POST", body });
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain("Rejected purge result");
      expect(html).toContain("mem-deleted");
      expect(html).toContain("deleted");
      expect(html).toContain("mem-pending");
      expect(html).toContain("skipped_not_rejected");
      expect(html).toContain("mem-missing");
      expect(html).toContain("skipped_not_found");
      expect(purgeRejectedMemories).toHaveBeenCalledWith({
        ids: ["mem-deleted", "mem-pending", "mem-missing"],
        scope: "global",
        confirmation: "DELETE REJECTED",
      });
    });
  });

  it("serves GET /graph as the React shell and exposes a read-only graph projection through JSON API", async () => {
    const reviewMemory = vi.fn(async () => createReviewAcceptedResult("mem-graph", "reject"));
    const promoteMemory = vi.fn(async () => createPromoteAcceptedResult("mem-graph"));
    const purgeRejectedMemories = vi.fn(async () => createPurgeResult(false, [{ id: "mem-graph", status: "deleted" }]));
    const reader = createReader({
      records: [
        {
          ...createRecord("mem-graph", "Graph source memory."),
          tags: ["graph"],
          verificationEvidence: [{ type: "human", value: "checked" }],
        },
        createRecord("mem-related", "Related memory."),
      ],
      searchResult: { items: [], degraded: false },
      reviewItems: [createReviewOverviewItem("mem-graph", "Graph review item.")],
      reviewAssist: createReviewAssist("mem-graph"),
      reviewMemory,
      promoteMemory,
      purgeRejectedMemories,
    });

    await withConsoleServer(reader, async (baseUrl) => {
      const pageUrl = "/graph?scope=project&projectId=project-a&containerId=container-a&edgeType=related_memory&id=tag%3Agraph";
      const response = await fetch(new URL(pageUrl, baseUrl));
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expectShellHtml(body);
      expect(body).not.toContain("Memory graph");
      expect(body).not.toContain('method="get" action="/graph"');
      expect(body).not.toContain('method="post"');
      expect(reader.readAll).not.toHaveBeenCalled();
      expect(reader.listReviewQueueOverview).not.toHaveBeenCalled();
      expect(reader.getReviewAssist).not.toHaveBeenCalled();

      const apiResponse = await fetch(new URL(pageUrl.replace("/graph", "/api/graph"), baseUrl));
      const apiBody = await apiResponse.json() as {
        readonly graph: { readonly nodes: readonly { readonly id: string; readonly type: string; readonly label: string }[]; readonly edges: readonly { readonly type: string }[] };
        readonly selectedGraphNode?: { readonly id: string; readonly label: string };
      };

      expect(apiResponse.status).toBe(200);
      expect(apiResponse.headers.get("content-type")).toContain("application/json");
      expect(apiBody.graph.nodes).toHaveLength(5);
      expect(apiBody.graph.edges.filter((edge) => edge.type === "related_memory")).toHaveLength(2);
      expect(apiBody.graph.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(["memory", "source", "tag", "evidence"]));
      expect(apiBody.selectedGraphNode).toMatchObject({ id: "tag:graph", label: "graph" });
      expect(reviewMemory).not.toHaveBeenCalled();
      expect(promoteMemory).not.toHaveBeenCalled();
      expect(purgeRejectedMemories).not.toHaveBeenCalled();
    });
  });

  it("returns 404 for unknown GET paths", async () => {
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false } });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/missing", baseUrl));
      const body = await response.text();

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(body).toBe("Not found");
    });
  });

  it("returns 405 with Allow for unsupported page methods", async () => {
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false } });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/", baseUrl), { method: "PUT" });
      const body = await response.text();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(body).toBe("Method PUT is not allowed for /. Allowed methods: GET, HEAD.");
    });
  });

  it("returns 400 with deterministic text for POST validation failures", async () => {
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false } });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/actions/review", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ action: "reject" }),
      });
      const body = await response.text();

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(body).toBe("Invalid review action: memoryId is required.");
    });
  });

  it("returns JSON errors and Allow headers for unsupported or invalid API requests", async () => {
    const purgeRejectedMemories = vi.fn(async () => createPurgeResult(false, [{ id: "mem-ok", status: "deleted" }]));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, purgeRejectedMemories });

    await withConsoleServer(reader, async (baseUrl) => {
      const unsupportedGetResponse = await fetch(new URL("/api/promote", baseUrl));
      expect(unsupportedGetResponse.status).toBe(405);
      expect(unsupportedGetResponse.headers.get("allow")).toBe("POST");
      expect(await unsupportedGetResponse.text()).toBe("Method GET is not allowed for /api/promote. Allowed methods: POST.");

      const unsupportedPostResponse = await fetch(new URL("/api/memories", baseUrl), { method: "POST" });
      expect(unsupportedPostResponse.status).toBe(405);
      expect(unsupportedPostResponse.headers.get("allow")).toBe("GET, HEAD");
      expect(await unsupportedPostResponse.text()).toBe("Method POST is not allowed for /api/memories. Allowed methods: GET, HEAD.");

      const invalidResponse = await fetch(new URL("/api/review", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const invalidBody = await invalidResponse.json() as { readonly status: string; readonly action: string; readonly error: { readonly code: string; readonly message: string } };

      expect(invalidResponse.status).toBe(400);
      expect(invalidResponse.headers.get("content-type")).toContain("application/json");
      expect(invalidBody).toEqual({
        status: "error",
        action: "review",
        error: { code: "invalid_payload", message: "Invalid review action: memoryId is required." },
      });

      const invalidPurgeResponse = await fetch(new URL("/api/purge-rejected", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ["mem-ok", 123], scope: "global", confirmation: "DELETE REJECTED" }),
      });
      const invalidPurgeBody = await invalidPurgeResponse.json() as { readonly status: string; readonly action: string; readonly error: { readonly code: string; readonly message: string } };

      expect(invalidPurgeResponse.status).toBe(400);
      expect(invalidPurgeBody).toEqual({
        status: "error",
        action: "purge-rejected",
        error: { code: "invalid_payload", message: "Invalid purge-rejected action: ids must be an array of non-empty strings." },
      });
      expect(purgeRejectedMemories).not.toHaveBeenCalled();
      expect(reader.readAll).not.toHaveBeenCalled();
      expect(reader.list).not.toHaveBeenCalled();
      expect(reader.search).not.toHaveBeenCalled();
    });
  });

  it("redirects browse reject actions back to browse", async () => {
    const reviewMemory = vi.fn(async () => createReviewAcceptedResult("mem-verified", "reject"));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, reviewMemory });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/actions/review", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ id: "mem-verified", action: "reject", redirectTo: "/", note: "No longer true." }),
        redirect: "manual",
      });

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/");
      expect(reviewMemory).toHaveBeenCalledWith({
        id: "mem-verified",
        action: "reject",
        note: "No longer true.",
      });
    });
  });

  it("calls exactly the intended service method for valid POST action contracts", async () => {
    const reviewMemory = vi.fn(async () => createReviewAcceptedResult("mem-1", "reject"));
    const promoteMemory = vi.fn(async () => createPromoteAcceptedResult("mem-1"));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, reviewMemory, promoteMemory });

    await withConsoleServer(reader, async (baseUrl) => {
      const reviewResponse = await fetch(new URL("/actions/review", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ memoryId: "mem-1", action: "reject" }),
        redirect: "manual",
      });
      const reviewBody = await reviewResponse.text();
      const promoteResponse = await fetch(new URL("/actions/promote", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ memoryId: "mem-1", evidenceType: "human", evidenceValue: "manual verification" }),
        redirect: "manual",
      });

      expect(reviewResponse.status).toBe(303);
      expect(reviewResponse.headers.get("location")).toBe("/review");
      expect(reviewBody).toBe("Action accepted: review");
      expect(reviewMemory).toHaveBeenCalledTimes(1);
      expect(reviewMemory).toHaveBeenCalledWith({ id: "mem-1", action: "reject" });
      expect(promoteResponse.status).toBe(303);
      expect(promoteResponse.headers.get("location")).toBe("/");
      expect(promoteMemory).toHaveBeenCalledTimes(1);
      expect(promoteMemory).toHaveBeenCalledWith({
        id: "mem-1",
        evidence: [{ type: "human", value: "manual verification" }],
      });
    });
  });

  it("parses edit_then_promote review POST fields into the memory service shape", async () => {
    const reviewMemory = vi.fn(async () => createReviewAcceptedResult("mem-2", "edit_then_promote"));
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false }, reviewMemory });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/actions/review", baseUrl), {
        method: "POST",
        body: new URLSearchParams({
          id: "mem-2",
          action: "edit_then_promote",
          note: "Reviewed by human.",
          content: "Updated content.",
          summary: "Updated summary.",
          tags: "alpha, beta\nbeta",
          evidenceType: "test",
          evidenceValue: "rtk bun run test -- memory-console-server",
          evidenceNote: "Focused server tests.",
        }),
        redirect: "manual",
      });

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/review");
      expect(reviewMemory).toHaveBeenCalledWith({
        id: "mem-2",
        action: "edit_then_promote",
        note: "Reviewed by human.",
        evidence: [{ type: "test", value: "rtk bun run test -- memory-console-server", note: "Focused server tests." }],
        content: "Updated content.",
        summary: "Updated summary.",
        tags: ["alpha", "beta"],
      });
    });
  });

  it("returns no body for HEAD /", async () => {
    const reader = createReader({
      records: [
        {
          ...createRecord("mem-verified", "Head-safe memory."),
          verificationStatus: "verified",
        },
      ],
      searchResult: { items: [], degraded: false },
    });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/", baseUrl), { method: "HEAD" });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toBe("");
      expect(reader.readAll).not.toHaveBeenCalled();
      expect(reader.list).not.toHaveBeenCalled();
      expect(reader.search).not.toHaveBeenCalled();
    });
  });

  it("blocks GET /actions/review without reading or mutating", async () => {
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false } });

    await withConsoleServer(reader, async (baseUrl) => {
      const response = await fetch(new URL("/actions/review", baseUrl));
      const body = await response.text();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(body).toBe("Method GET is not allowed for /actions/review. Allowed methods: POST.");
      expect(reader.readAll).not.toHaveBeenCalled();
      expect(reader.list).not.toHaveBeenCalled();
      expect(reader.search).not.toHaveBeenCalled();
    });
  });

  it("adapts the local console backend to expose review and promote methods", async () => {
    const reader = createReader({ records: [], searchResult: { items: [], degraded: false } });
    const service = {
      listReviewQueueOverview: vi.fn(async () => [createReviewOverviewItem("mem-1", "Queue item")]),
      getReviewAssist: vi.fn(async () => createReviewAssist("mem-1")),
      reviewMemory: vi.fn(async () => createReviewAcceptedResult("mem-1", "reject")),
      promoteMemory: vi.fn(async () => createPromoteAcceptedResult("mem-1")),
      purgeRejectedMemories: vi.fn(async () => createPurgeResult(false, [{ id: "mem-1", status: "deleted" }])),
    };

    const backend = createMemoryConsoleBackend(reader, service);

    expect(backend.readAll).toBe(reader.readAll);
    expect(backend.list).toBe(reader.list);
    expect(backend.search).toBe(reader.search);
    await expect(backend.listReviewQueueOverview?.({ limit: 10 })).resolves.toHaveLength(1);
    await expect(backend.getReviewAssist?.({ id: "mem-1" })).resolves.toMatchObject({ id: "mem-1", status: "ready" });
    await expect(backend.reviewMemory?.({ id: "mem-1", action: "reject" })).resolves.toMatchObject({ id: "mem-1", action: "reject" });
    await expect(backend.promoteMemory?.({ id: "mem-1", evidence: [{ type: "human", value: "checked" }] })).resolves.toMatchObject({ id: "mem-1", status: "accepted" });
    await expect(backend.purgeRejectedMemories?.({ ids: ["mem-1"], scope: "global", confirmation: "DELETE REJECTED" })).resolves.toMatchObject({ status: "accepted" });
    expect(service.listReviewQueueOverview).toHaveBeenCalledWith({ limit: 10 });
    expect(service.getReviewAssist).toHaveBeenCalledWith({ id: "mem-1" });
    expect(service.reviewMemory).toHaveBeenCalledWith({ id: "mem-1", action: "reject" });
    expect(service.promoteMemory).toHaveBeenCalledWith({ id: "mem-1", evidence: [{ type: "human", value: "checked" }] });
    expect(service.purgeRejectedMemories).toHaveBeenCalledWith({ ids: ["mem-1"], scope: "global", confirmation: "DELETE REJECTED" });
  });

  it("keeps browse rendering separate from write-capable management controls", async () => {
    const consoleFiles = [
      "src/features/memory-console/filters.ts",
      "src/features/memory-console/render.ts",
      "src/features/memory-console/types.ts",
      "src/memory-console.ts",
    ];
    const source = (await Promise.all(consoleFiles.map((file) => readFile(file, "utf8")))).join("\n");

    expect(source).not.toContain("MemoryService");
    expect(source).not.toMatch(/\.(remember|promoteMemory|reviewMemory|resetStorage|upsertDocument|enqueueMemoryProposal|resetMemoryStorage)\(/);
  });
});

function expectShellHtml(body: string): void {
  expect(body).toContain("Local memory console");
  expect(body).toContain('<div id="root"></div>');
  expect(body).toContain('/assets/');
}

function createReader(input: {
  readonly records: readonly MemoryRecord[];
  readonly allRecords?: readonly MemoryRecord[];
  readonly searchResult: SearchMemoriesResult;
  readonly reviewItems?: readonly ReviewQueueOverviewItem[];
  readonly reviewAssist?: ReviewAssistResult;
  readonly reviewMemory?: MemoryConsoleBackend["reviewMemory"];
  readonly promoteMemory?: MemoryConsoleBackend["promoteMemory"];
  readonly purgeRejectedMemories?: MemoryConsoleBackend["purgeRejectedMemories"];
}): MemoryConsoleBackend {
  return {
    readAll: vi.fn(async () => input.allRecords ?? input.records),
    list: vi.fn(async () => input.records),
    search: vi.fn(async () => input.searchResult),
    ...(input.reviewItems ? { listReviewQueueOverview: vi.fn(async () => input.reviewItems ?? []) } : {}),
    ...(input.reviewAssist ? { getReviewAssist: vi.fn(async () => input.reviewAssist as ReviewAssistResult) } : {}),
    ...(input.reviewMemory ? { reviewMemory: input.reviewMemory } : {}),
    ...(input.promoteMemory ? { promoteMemory: input.promoteMemory } : {}),
    ...(input.purgeRejectedMemories ? { purgeRejectedMemories: input.purgeRejectedMemories } : {}),
  };
}

async function withConsoleServer(
  reader: MemoryConsoleBackend,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createMemoryConsoleServer(reader);
  const baseUrl = await listen(server);
  try {
    await run(baseUrl);
  } finally {
    await close(server);
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Memory console test server did not expose a TCP address."));
        return;
      }
      resolve(`http://${memoryConsoleHost}:${address.port}/`);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, memoryConsoleHost);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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

function createReviewOverviewItem(id: string, content: string): ReviewQueueOverviewItem {
  return {
    id,
    kind: "fact",
    scope: "project",
    content,
    verificationStatus: "hypothesis",
    reviewStatus: "pending",
    reviewDecisions: [],
    source: { type: "manual" },
    tags: [],
    importance: 0.8,
    createdAt: "2026-05-04T10:00:00.000Z",
    priorityScore: 9.25,
    priorityReasons: ["high importance"],
    hints: [{ type: "possible_contradiction", relatedMemoryIds: ["mem-related"], note: "Conflicting reviewed memory." }],
  };
}

function createReviewAssist(id: string): ReviewAssistResult {
  return {
    id,
    status: "ready",
    hints: [{ type: "possible_contradiction", relatedMemoryIds: ["mem-related"], note: "Conflicting reviewed memory." }],
    suggestions: [{ kind: "gather_evidence", rationale: "Assist rationale", relatedMemoryIds: ["mem-related"], suggestedAction: "collect_evidence" }],
  };
}

function createReviewAcceptedResult(id: string, action: "reject" | "defer" | "edit_then_promote"): ReviewMemoryResult {
  return {
    id,
    status: "accepted",
    action,
    ...(action === "reject" ? { reviewStatus: "rejected" as const } : {}),
    ...(action === "defer" ? { reviewStatus: "deferred" as const } : {}),
    verificationStatus: action === "edit_then_promote" ? "verified" : "hypothesis",
    reviewDecisions: [],
    verificationEvidence: [],
  };
}

function createPromoteAcceptedResult(id: string): PromoteMemoryResult {
  return {
    id,
    status: "accepted",
    verificationStatus: "verified",
    verifiedAt: "2026-05-04T13:00:00.000Z",
    verificationEvidence: [{ type: "human", value: "manual verification" }],
  };
}

function createPurgeResult(
  dryRun: boolean,
  outcomes: PurgeRejectedMemoriesResult["outcomes"],
): PurgeRejectedMemoriesResult {
  return {
    status: "accepted",
    dryRun,
    outcomes,
    deletedRecords: dryRun ? [] : outcomes
      .filter((outcome) => outcome.status === "deleted")
      .map((outcome) => createRecord(outcome.id, `Deleted ${outcome.id}.`)),
    missingIds: outcomes
      .filter((outcome) => outcome.status === "skipped_not_found")
      .map((outcome) => outcome.id),
  };
}
