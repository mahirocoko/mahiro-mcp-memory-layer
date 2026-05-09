import { createServer, type IncomingMessage, type Server } from "node:http";

import { buildMemoryGraph } from "./graph.js";
import {
  aggregateConsoleProjectScopes,
  canUseIndexedSearch,
  filterConsoleMemories,
  normalizeMemoryRecord,
  normalizeSearchMemoryItem,
  normalizeConsoleFilters,
} from "./filters.js";
import { escapeHtml, renderGraphConsolePage, renderMemoryConsolePage, renderPurgeRejectedResultPage, renderRejectedConsolePage, renderReviewConsolePage } from "./render.js";
import type {
  ConsoleActionError,
  ConsoleActionResult,
  ConsoleFilterState,
  ConsoleGraphLoadResult,
  ConsoleLoadResult,
  ConsoleMemory,
  ConsolePromoteActionInput,
  ConsolePurgeRejectedActionInput,
  ConsolePurgeRejectedActionResult,
  ConsoleReviewLoadResult,
  MemoryConsoleBackend,
  ConsoleReviewActionInput,
  ConsoleRoute,
  MemoryGraphRelatedInput,
  MemoryConsoleReviewReader,
  ReadOnlyMemoryReader,
} from "./types.js";
import type { MemoryRecord, MemoryScope, MemoryVerificationEvidence, ReviewQueueOverviewItem } from "../memory/types.js";

export const memoryConsoleHost = "127.0.0.1";
export const defaultMemoryConsolePort = 4317;

const pageRoutes = new Set<string>(["/", "/review", "/rejected", "/graph"] satisfies ConsoleRoute[]);
const actionRoutes = new Set<string>(["/actions/review", "/actions/promote", "/actions/purge-rejected"]);

export async function loadConsoleMemories(
  reader: ReadOnlyMemoryReader,
  filters: ConsoleFilterState,
): Promise<ConsoleLoadResult> {
  const canonicalRecordsPromise = reader.readAll();

  if (canUseIndexedSearch(filters)) {
    const projectScopesPromise = loadConsoleProjectScopes(canonicalRecordsPromise);
    const result = await reader.search({
      query: filters.query,
      mode: "full",
      scope: filters.scope,
      projectId: filters.projectId,
      containerId: filters.containerId,
      limit: filters.limit,
    });
    const fetched = result.items.map((item) => normalizeSearchMemoryItem(item, filters.scope, filters.projectId, filters.containerId));
    const memories = filterConsoleMemories(fetched, filters, { includeQuery: false });
    return toLoadResult(filters, memories, fetched.length, "search", result.degraded, await projectScopesPromise);
  }

  const canonicalRecords = await canonicalRecordsPromise;
  const fetched = canonicalRecords.map(normalizeMemoryRecord);
  const memories = filterConsoleMemories(fetched, filters).slice(0, filters.limit);
  return toLoadResult(filters, memories, fetched.length, "list", false, aggregateConsoleProjectScopes(fetched));
}

export function createMemoryConsoleServer(reader: MemoryConsoleBackend): Server {
  return createServer((request, response) => {
    void handleRequest(reader, request)
      .then((result) => {
        response.statusCode = result.statusCode;
        response.setHeader("content-type", result.contentType);
        response.setHeader("cache-control", "no-store");
        for (const [name, value] of Object.entries(result.headers ?? {})) {
          response.setHeader(name, value);
        }
        if (request.method !== "HEAD") {
          response.end(result.body);
          return;
        }
        response.end();
      })
      .catch((error: unknown) => {
        response.statusCode = 500;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        const message = error instanceof Error ? error.message : "Unknown console error";
        response.end(`<!doctype html><title>Memory console error</title><pre>${escapeHtml(message)}</pre>`);
      });
  });
}

export async function startMemoryConsoleServer(
  reader: MemoryConsoleBackend,
  port = defaultMemoryConsolePort,
): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createMemoryConsoleServer(reader);

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      const listenedPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({ server, url: `http://${memoryConsoleHost}:${listenedPort}/` });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, memoryConsoleHost);
  });
}

async function handleRequest(
  reader: MemoryConsoleBackend,
  request: IncomingMessage,
): Promise<{ readonly statusCode: number; readonly contentType: string; readonly body: string; readonly headers?: Readonly<Record<string, string>> }> {
  const rawUrl = request.url ?? "/";
  const method = request.method ?? "GET";
  const url = new URL(rawUrl, `http://${memoryConsoleHost}:${defaultMemoryConsolePort}`);

  if (actionRoutes.has(url.pathname)) {
    return handleActionRequest(reader, request, url.pathname);
  }

  if (!pageRoutes.has(url.pathname)) {
    return {
      statusCode: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found",
    };
  }

  if (method !== "GET" && method !== "HEAD") {
    return methodNotAllowed(method, url.pathname, "GET, HEAD");
  }

  const filters = normalizeConsoleFilters(routeSearchParams(url));
  if (url.pathname === "/review") {
    const result = await loadConsoleReview(reader, filters);
    return {
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      body: renderReviewConsolePage(result),
    };
  }

  if (url.pathname === "/graph") {
    const result = await loadConsoleGraph(reader, filters);
    return {
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      body: renderGraphConsolePage(result),
    };
  }

  const result = await loadConsoleMemories(reader, filters);
  return {
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: renderRoutePage(url.pathname as ConsoleRoute, result),
  };
}

async function handleActionRequest(
  reader: MemoryConsoleBackend,
  request: IncomingMessage,
  path: string,
): Promise<{ readonly statusCode: number; readonly contentType: string; readonly body: string; readonly headers?: Readonly<Record<string, string>> }> {
  const method = request.method ?? "GET";
  if (method !== "POST") {
    return methodNotAllowed(method, path, "POST");
  }

  const form = await readFormBody(request);
  if (path === "/actions/purge-rejected") {
    return handlePurgeRejectedAction(reader, form);
  }

  const result = validateAction(path, form);
  if (result.status === "invalid") {
    return {
      statusCode: 400,
      contentType: "text/plain; charset=utf-8",
      body: result.message,
    };
  }

  const actionRun = await runConsoleAction(reader, result);
  if (actionRun.status === "unavailable") {
    return {
      statusCode: 501,
      contentType: "text/plain; charset=utf-8",
      body: actionRun.message,
    };
  }

  return {
    statusCode: 303,
    contentType: "text/plain; charset=utf-8",
    headers: { location: result.redirectTo },
    body: `Action accepted: ${result.action}`,
  };
}

async function handlePurgeRejectedAction(
  reader: MemoryConsoleBackend,
  form: URLSearchParams,
): Promise<{ readonly statusCode: number; readonly contentType: string; readonly body: string; readonly headers?: Readonly<Record<string, string>> }> {
  const result = validatePurgeRejectedAction(form);
  if (result.status === "invalid") {
    return {
      statusCode: 400,
      contentType: "text/plain; charset=utf-8",
      body: result.message,
    };
  }

  if (!reader.purgeRejectedMemories) {
    return {
      statusCode: 501,
      contentType: "text/plain; charset=utf-8",
      body: "Purge rejected actions are unavailable for this console backend.",
    };
  }

  const input = result.input as ConsolePurgeRejectedActionInput;
  const purgeResult: ConsolePurgeRejectedActionResult = await reader.purgeRejectedMemories(input);
  return {
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: renderPurgeRejectedResultPage(filtersFromPurgeInput(input), input, purgeResult),
  };
}

export async function loadConsoleReview(
  reader: MemoryConsoleBackend,
  filters: ConsoleFilterState,
): Promise<ConsoleReviewLoadResult> {
  const reviewItems = hasReviewReader(reader)
    ? await reader.listReviewQueueOverview({ projectId: filters.projectId, containerId: filters.containerId, limit: filters.limit })
    : await loadFallbackReviewQueue(reader, filters);
  const selectedReviewItem = reviewItems.find((item) => item.id === filters.selectedId) ?? reviewItems[0];
  const reviewAssist = selectedReviewItem && hasReviewReader(reader)
    ? await reader.getReviewAssist({ id: selectedReviewItem.id })
    : undefined;

  return {
    filters,
    reviewItems,
    selectedReviewItem,
    reviewAssist,
    refreshedAt: new Date().toISOString(),
  };
}

export async function loadConsoleGraph(
  reader: MemoryConsoleBackend,
  filters: ConsoleFilterState,
): Promise<ConsoleGraphLoadResult> {
  const result = await loadConsoleMemories(reader, filters);
  const related = await loadConsoleGraphRelatedInput(reader, filters, result.memories);
  const graph = buildMemoryGraph(result.memories, { related });
  const selectedGraphNode = graph.nodes.find((node) => node.id === filters.selectedId);

  return {
    ...result,
    graph,
    ...(selectedGraphNode ? { selectedGraphNode } : {}),
  };
}

async function loadConsoleGraphRelatedInput(
  reader: MemoryConsoleBackend,
  filters: ConsoleFilterState,
  memories: readonly ConsoleMemory[],
): Promise<readonly MemoryGraphRelatedInput[]> {
  if (!hasReviewReader(reader) || memories.length === 0) {
    return [];
  }

  const memoryIds = new Set(memories.map((memory) => memory.id));
  const reviewItems = await reader.listReviewQueueOverview({ projectId: filters.projectId, containerId: filters.containerId, limit: filters.limit });
  const matchingItems = reviewItems.filter((item) => memoryIds.has(item.id));
  const assistResults = await Promise.all(matchingItems.map((item) => reader.getReviewAssist({ id: item.id })));

  return matchingItems.map((item, index) => ({
    memoryId: item.id,
    hints: item.hints,
    assistSuggestions: assistResults[index]?.suggestions ?? [],
  }));
}

async function loadFallbackReviewQueue(
  reader: ReadOnlyMemoryReader,
  filters: ConsoleFilterState,
): Promise<readonly ReviewQueueOverviewItem[]> {
  const records = await reader.readAll();
  return records
    .filter((record) => record.verificationStatus !== "verified")
    .filter((record) => record.reviewStatus !== "rejected")
    .filter((record) => !filters.projectId || record.projectId === filters.projectId)
    .filter((record) => !filters.containerId || record.containerId === filters.containerId)
    .sort((left, right) => Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt))
    .slice(0, filters.limit)
    .map(toFallbackReviewOverviewItem);
}

function toFallbackReviewOverviewItem(record: MemoryRecord): ReviewQueueOverviewItem {
  return {
    id: record.id,
    kind: record.kind,
    scope: record.scope,
    content: record.content,
    ...(record.summary ? { summary: record.summary } : {}),
    verificationStatus: record.verificationStatus ?? "hypothesis",
    ...(record.reviewStatus ? { reviewStatus: record.reviewStatus } : {}),
    reviewDecisions: record.reviewDecisions ?? [],
    source: record.source,
    tags: record.tags,
    importance: record.importance,
    createdAt: record.createdAt,
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    priorityScore: record.reviewStatus === "pending" ? 1 : 0.5,
    priorityReasons: [record.reviewStatus === "pending" ? "Pending review" : "Unverified memory"],
    hints: [],
  };
}

function routeSearchParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.searchParams);
  if (url.pathname === "/review") {
    params.set("view", "inbox");
    params.set("verificationStatus", "hypothesis");
    params.set("reviewStatus", "pending");
  }
  if (url.pathname === "/rejected") {
    params.set("view", "firehose");
    params.set("verificationStatus", "all");
    params.set("reviewStatus", "rejected");
  }
  if (url.pathname === "/graph") {
    params.set("view", "projects");
  }
  return params;
}

function renderRoutePage(route: ConsoleRoute, result: ConsoleLoadResult): string {
  if (route === "/rejected") {
    return renderRejectedConsolePage(result);
  }
  return renderMemoryConsolePage(result);
}

function validateAction(path: string, form: URLSearchParams): ConsoleActionResult | ConsoleActionError {
  if (path === "/actions/review") {
    return validateReviewAction(form);
  }
  if (path === "/actions/promote") {
    return validatePromoteAction(form);
  }
  return validatePurgeRejectedAction(form);
}

function validateReviewAction(form: URLSearchParams): ConsoleActionResult | ConsoleActionError {
  const input = {
    id: getRequiredFormValue(form, "id") ?? getRequiredFormValue(form, "memoryId"),
    action: getRequiredFormValue(form, "action"),
    note: getOptionalFormValue(form, "note"),
    evidence: getOptionalEvidence(form),
    content: getOptionalFormValue(form, "content"),
    summary: getOptionalFormValue(form, "summary"),
    tags: getOptionalTags(form),
  };

  if (!input.id) {
    return actionError("review", "Invalid review action: memoryId is required.");
  }
  if (input.action !== "reject" && input.action !== "defer" && input.action !== "edit_then_promote") {
    return actionError("review", "Invalid review action: action must be reject, defer, or edit_then_promote.");
  }
  if (input.action === "edit_then_promote" && (!input.evidence || input.evidence.length === 0)) {
    return actionError("review", "Invalid review action: edit_then_promote requires evidence.");
  }

  const validatedInput: ConsoleReviewActionInput = {
    id: input.id,
    action: input.action,
    ...(input.note ? { note: input.note } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
    ...(input.content ? { content: input.content } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };
  return actionAccepted("review", validatedInput, "/review");
}

function validatePromoteAction(form: URLSearchParams): ConsoleActionResult | ConsoleActionError {
  const input = {
    id: getRequiredFormValue(form, "id") ?? getRequiredFormValue(form, "memoryId"),
    evidence: getOptionalEvidence(form),
  };
  if (!input.id) {
    return actionError("promote", "Invalid promote action: memoryId is required.");
  }
  if (!input.evidence || input.evidence.length === 0) {
    return actionError("promote", "Invalid promote action: evidence is required.");
  }

  const validatedInput: ConsolePromoteActionInput = { id: input.id, evidence: input.evidence };
  return actionAccepted("promote", validatedInput, "/");
}

function validatePurgeRejectedAction(form: URLSearchParams): ConsoleActionResult | ConsoleActionError {
  const ids = getFormIds(form);
  const scope = getRequiredFormValue(form, "scope");
  const projectId = getOptionalFormValue(form, "projectId");
  const containerId = getOptionalFormValue(form, "containerId");
  const dryRun = getOptionalFormValue(form, "dryRun") === "true";
  const confirmation = getRequiredFormValue(form, "confirmation");

  if (ids.length === 0) {
    return actionError("purge-rejected", "Invalid purge-rejected action: at least one id is required.");
  }
  if (new Set(ids).size !== ids.length) {
    return actionError("purge-rejected", "Invalid purge-rejected action: ids must be unique.");
  }
  if (!isMemoryScope(scope)) {
    return actionError("purge-rejected", "Invalid purge-rejected action: scope must be global or project.");
  }
  if (scope === "project" && (!projectId || !containerId)) {
    return actionError("purge-rejected", "Invalid purge-rejected action: project scope requires projectId and containerId.");
  }
  if (scope === "global" && (projectId || containerId)) {
    return actionError("purge-rejected", "Invalid purge-rejected action: global scope must not include projectId or containerId.");
  }
  if (!dryRun && confirmation !== "DELETE REJECTED") {
    return actionError("purge-rejected", "Invalid purge-rejected action: confirmation must be DELETE REJECTED.");
  }

  const validatedInput: ConsolePurgeRejectedActionInput = {
    ids,
    scope,
    ...(scope === "project" ? { projectId, containerId } : {}),
    confirmation: "DELETE REJECTED",
    ...(dryRun ? { dryRun: true } : {}),
  };
  return actionAccepted("purge-rejected", validatedInput, "/rejected");
}

function actionAccepted(
  action: ConsoleActionResult["action"],
  input: ConsoleActionResult["input"],
  redirectTo: ConsoleRoute,
): ConsoleActionResult {
  return { status: "accepted", action, input, redirectTo };
}

function actionError(action: ConsoleActionError["action"], message: string): ConsoleActionError {
  return { status: "invalid", action, message };
}

function getRequiredFormValue(form: URLSearchParams, name: string): string | undefined {
  const value = form.get(name)?.trim();
  return value && value.length > 0 ? value : undefined;
}

function getOptionalFormValue(form: URLSearchParams, name: string): string | undefined {
  const value = form.get(name)?.trim();
  return value && value.length > 0 ? value : undefined;
}

function getOptionalEvidence(form: URLSearchParams): readonly MemoryVerificationEvidence[] | undefined {
  const value = getOptionalFormValue(form, "evidenceValue");
  if (!value) {
    return undefined;
  }

  const type = getOptionalFormValue(form, "evidenceType") ?? "human";
  if (!isEvidenceType(type)) {
    return undefined;
  }

  const note = getOptionalFormValue(form, "evidenceNote");
  return [{ type, value, ...(note ? { note } : {}) }];
}

function getFormIds(form: URLSearchParams): readonly string[] {
  return form.getAll("ids")
    .flatMap((value) => value.split(/[\n,]/u))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isMemoryScope(value: string | undefined): value is MemoryScope {
  return value === "global" || value === "project";
}

function isEvidenceType(value: string): value is MemoryVerificationEvidence["type"] {
  return value === "human" || value === "test" || value === "trace" || value === "issue" || value === "link";
}

function getOptionalTags(form: URLSearchParams): readonly string[] | undefined {
  const value = getOptionalFormValue(form, "tags");
  if (!value) {
    return undefined;
  }

  const tags = value
    .split(/[\n,]/u)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? [...new Set(tags)] : undefined;
}

async function runConsoleAction(
  reader: MemoryConsoleBackend,
  result: ConsoleActionResult,
): Promise<{ readonly status: "done" } | { readonly status: "unavailable"; readonly message: string }> {
  if (result.action === "review") {
    if (!reader.reviewMemory) {
      return { status: "unavailable", message: "Review actions are unavailable for this console backend." };
    }
    await reader.reviewMemory(result.input as ConsoleReviewActionInput);
    return { status: "done" };
  }

  if (result.action === "promote") {
    if (!reader.promoteMemory) {
      return { status: "unavailable", message: "Promote actions are unavailable for this console backend." };
    }
    await reader.promoteMemory(result.input as ConsolePromoteActionInput);
    return { status: "done" };
  }

  return { status: "done" };
}

function hasReviewReader(reader: MemoryConsoleBackend): reader is MemoryConsoleBackend & MemoryConsoleReviewReader {
  return typeof reader.listReviewQueueOverview === "function" && typeof reader.getReviewAssist === "function";
}

async function readFormBody(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function methodNotAllowed(
  method: string,
  path: string,
  allow: string,
): { readonly statusCode: number; readonly contentType: string; readonly body: string; readonly headers: Readonly<Record<string, string>> } {
  return {
    statusCode: 405,
    contentType: "text/plain; charset=utf-8",
    headers: { allow },
    body: `Method ${method} is not allowed for ${path}. Allowed methods: ${allow}.`,
  };
}

function toLoadResult(
  filters: ConsoleFilterState,
  memories: readonly ConsoleMemory[],
  fetchedCount: number,
  fetchMode: ConsoleLoadResult["fetchMode"],
  degraded: boolean,
  projectScopes: ConsoleLoadResult["projectScopes"],
): ConsoleLoadResult {
  const selectedMemory = memories.find((memory) => memory.id === filters.selectedId) ?? memories[0];
  return {
    filters,
    memories,
    projectScopes,
    selectedMemory,
    fetchedCount,
    fetchMode,
    degraded,
    refreshedAt: new Date().toISOString(),
  };
}

function filtersFromPurgeInput(input: ConsolePurgeRejectedActionInput): ConsoleFilterState {
  return {
    view: "firehose",
    scope: input.scope,
    kind: "all",
    verificationStatus: "all",
    reviewStatus: "rejected",
    ...(input.scope === "project" ? { projectId: input.projectId, containerId: input.containerId } : {}),
    limit: 50,
  };
}

async function loadConsoleProjectScopes(canonicalRecordsPromise: Promise<readonly import("../memory/types.js").MemoryRecord[]>): Promise<ConsoleLoadResult["projectScopes"]> {
  const canonicalRecords = await canonicalRecordsPromise;
  return aggregateConsoleProjectScopes(canonicalRecords.map(normalizeMemoryRecord));
}
