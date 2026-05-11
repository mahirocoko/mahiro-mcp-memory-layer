import { readFile } from "node:fs/promises";
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
import { escapeHtml, renderPurgeRejectedResultPage } from "./render.js";
import type {
  ConsoleActionError,
  ConsoleActionResult,
  ConsoleApiErrorResponse,
  ConsoleApiMutationResult,
  ConsoleApiSuccessResponse,
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
const apiGetRoutes = new Set<string>(["/api/memories", "/api/review", "/api/graph"]);
const apiPostRoutes = new Set<string>(["/api/review", "/api/promote", "/api/purge-rejected"]);
const staticAssetPrefix = "/assets/";
const staticIndexUrl = new URL("./static/index.html", import.meta.url);

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

type ConsoleHttpResponse = { readonly statusCode: number; readonly contentType: string; readonly body: string; readonly headers?: Readonly<Record<string, string>> };

async function handleRequest(
  reader: MemoryConsoleBackend,
  request: IncomingMessage,
): Promise<ConsoleHttpResponse> {
  const rawUrl = request.url ?? "/";
  const method = request.method ?? "GET";
  const url = new URL(rawUrl, `http://${memoryConsoleHost}:${defaultMemoryConsolePort}`);

  if (actionRoutes.has(url.pathname)) {
    return handleActionRequest(reader, request, url.pathname);
  }

  if (apiGetRoutes.has(url.pathname) || apiPostRoutes.has(url.pathname)) {
    return handleApiRequest(reader, request, url);
  }

  if (url.pathname.startsWith(staticAssetPrefix)) {
    return handleStaticAssetRequest(request, url.pathname);
  }

  if (!pageRoutes.has(url.pathname)) {
    return notFound();
  }

  if (method !== "GET" && method !== "HEAD") {
    return methodNotAllowed(method, url.pathname, "GET, HEAD");
  }

  return serveAppShell();
}

async function serveAppShell(): Promise<ConsoleHttpResponse> {
  return {
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: await readFile(staticIndexUrl, "utf8"),
  };
}

async function handleStaticAssetRequest(request: IncomingMessage, path: string): Promise<ConsoleHttpResponse> {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return methodNotAllowed(method, path, "GET, HEAD");
  }

  const assetName = decodeAssetName(path);
  const contentType = assetName ? contentTypeForAsset(assetName) : undefined;
  if (!assetName || !contentType) {
    return notFound();
  }

  try {
    return {
      statusCode: 200,
      contentType,
      body: await readFile(new URL(`./static/assets/${assetName}`, import.meta.url), "utf8"),
    };
  } catch {
    return notFound();
  }
}

function decodeAssetName(path: string): string | undefined {
  try {
    const value = decodeURIComponent(path.slice(staticAssetPrefix.length));
    return /^[A-Za-z0-9._-]+$/u.test(value) && !value.includes("..") ? value : undefined;
  } catch {
    return undefined;
  }
}

function contentTypeForAsset(assetName: string): string | undefined {
  if (assetName.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (assetName.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return undefined;
}

async function handleApiRequest(
  reader: MemoryConsoleBackend,
  request: IncomingMessage,
  url: URL,
): Promise<ConsoleHttpResponse> {
  const method = request.method ?? "GET";
  if ((method === "GET" || method === "HEAD") && apiGetRoutes.has(url.pathname)) {
    return handleApiGetRequest(reader, url);
  }
  if (method === "POST" && apiPostRoutes.has(url.pathname)) {
    return handleApiPostRequest(reader, request, url.pathname);
  }

  return methodNotAllowed(method, url.pathname, allowedApiMethods(url.pathname));
}

function allowedApiMethods(path: string): string {
  const methods = [
    ...(apiGetRoutes.has(path) ? ["GET", "HEAD"] : []),
    ...(apiPostRoutes.has(path) ? ["POST"] : []),
  ];
  return methods.join(", ");
}

async function handleApiGetRequest(reader: MemoryConsoleBackend, url: URL): Promise<ConsoleHttpResponse> {
  const filters = normalizeConsoleFilters(routeSearchParams(url));
  if (url.pathname === "/api/review") {
    return jsonResponse(await loadConsoleReview(reader, filters));
  }
  if (url.pathname === "/api/graph") {
    return jsonResponse(await loadConsoleGraph(reader, filters));
  }
  return jsonResponse(await loadConsoleMemories(reader, filters));
}

async function handleApiPostRequest(
  reader: MemoryConsoleBackend,
  request: IncomingMessage,
  path: string,
): Promise<ConsoleHttpResponse> {
  const payload = await readJsonBody(request);
  if (!payload.ok) {
    return jsonActionErrorResponse(apiActionFromPath(path), payload.message, 400, "invalid_payload");
  }

  const result = validateJsonAction(path, payload.value);
  if (result.status === "invalid") {
    return jsonActionErrorResponse(result.action, result.message, 400, "invalid_payload");
  }

  const actionRun = await runConsoleMutation(reader, result);
  if (actionRun.status === "unavailable") {
    return jsonActionErrorResponse(result.action, actionRun.message, 501, "unavailable");
  }

  return jsonResponse({ status: "ok", action: result.action, result: actionRun.result } satisfies ConsoleApiSuccessResponse);
}

async function handleActionRequest(
  reader: MemoryConsoleBackend,
  request: IncomingMessage,
  path: string,
): Promise<ConsoleHttpResponse> {
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
): Promise<ConsoleHttpResponse> {
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
  if (url.pathname === "/review" || url.pathname === "/api/review") {
    params.set("view", "inbox");
    params.set("verificationStatus", "hypothesis");
    params.set("reviewStatus", "pending");
  }
  if (url.pathname === "/rejected") {
    params.set("view", "firehose");
    params.set("verificationStatus", "all");
    params.set("reviewStatus", "rejected");
  }
  if (url.pathname === "/graph" || url.pathname === "/api/graph") {
    params.set("view", "projects");
  }
  return params;
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

function validateJsonAction(path: string, payload: unknown): ConsoleActionResult | ConsoleActionError {
  if (path === "/api/review") {
    return validateJsonReviewAction(payload);
  }
  if (path === "/api/promote") {
    return validateJsonPromoteAction(payload);
  }
  return validateJsonPurgeRejectedAction(payload);
}

function validateJsonReviewAction(payload: unknown): ConsoleActionResult | ConsoleActionError {
  if (!isJsonObject(payload)) {
    return actionError("review", "Invalid review action: JSON object payload is required.");
  }

  const id = getRequiredJsonString(payload, "id") ?? getRequiredJsonString(payload, "memoryId");
  const action = getRequiredJsonString(payload, "action");
  const evidence = getOptionalJsonEvidence(payload);
  if (!id) {
    return actionError("review", "Invalid review action: memoryId is required.");
  }
  if (action !== "reject" && action !== "defer" && action !== "edit_then_promote") {
    return actionError("review", "Invalid review action: action must be reject, defer, or edit_then_promote.");
  }
  if (action === "edit_then_promote" && (!evidence || evidence.length === 0)) {
    return actionError("review", "Invalid review action: edit_then_promote requires evidence.");
  }

  const input: ConsoleReviewActionInput = {
    id,
    action,
    ...(getOptionalJsonString(payload, "note") ? { note: getOptionalJsonString(payload, "note") } : {}),
    ...(evidence ? { evidence } : {}),
    ...(getOptionalJsonString(payload, "content") ? { content: getOptionalJsonString(payload, "content") } : {}),
    ...(getOptionalJsonString(payload, "summary") ? { summary: getOptionalJsonString(payload, "summary") } : {}),
    ...(getOptionalJsonTags(payload) ? { tags: getOptionalJsonTags(payload) } : {}),
  };
  return actionAccepted("review", input, "/review");
}

function validateJsonPromoteAction(payload: unknown): ConsoleActionResult | ConsoleActionError {
  if (!isJsonObject(payload)) {
    return actionError("promote", "Invalid promote action: JSON object payload is required.");
  }

  const id = getRequiredJsonString(payload, "id") ?? getRequiredJsonString(payload, "memoryId");
  const evidence = getOptionalJsonEvidence(payload);
  if (!id) {
    return actionError("promote", "Invalid promote action: memoryId is required.");
  }
  if (!evidence || evidence.length === 0) {
    return actionError("promote", "Invalid promote action: evidence is required.");
  }

  return actionAccepted("promote", { id, evidence }, "/");
}

function validateJsonPurgeRejectedAction(payload: unknown): ConsoleActionResult | ConsoleActionError {
  if (!isJsonObject(payload)) {
    return actionError("purge-rejected", "Invalid purge-rejected action: JSON object payload is required.");
  }

  const ids = getJsonIds(payload);
  const scope = getRequiredJsonString(payload, "scope");
  const projectId = getOptionalJsonString(payload, "projectId");
  const containerId = getOptionalJsonString(payload, "containerId");
  const dryRun = payload.dryRun === true;
  const confirmation = getRequiredJsonString(payload, "confirmation");

  if (!ids) {
    return actionError("purge-rejected", "Invalid purge-rejected action: ids must be an array of non-empty strings.");
  }
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

  const input: ConsolePurgeRejectedActionInput = {
    ids,
    scope,
    ...(scope === "project" ? { projectId, containerId } : {}),
    confirmation: "DELETE REJECTED",
    ...(dryRun ? { dryRun: true } : {}),
  };
  return actionAccepted("purge-rejected", input, "/rejected");
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
    redirectTo: getOptionalReviewRedirect(form),
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
  return actionAccepted("review", validatedInput, input.redirectTo ?? "/review");
}

function getOptionalReviewRedirect(form: URLSearchParams): "/" | "/review" | undefined {
  const value = getOptionalFormValue(form, "redirectTo");
  if (value === "/" || value === "/review") {
    return value;
  }

  return undefined;
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

function apiActionFromPath(path: string): ConsoleActionResult["action"] {
  if (path === "/api/review") {
    return "review";
  }
  if (path === "/api/promote") {
    return "promote";
  }
  return "purge-rejected";
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredJsonString(payload: Record<string, unknown>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getOptionalJsonString(payload: Record<string, unknown>, name: string): string | undefined {
  return getRequiredJsonString(payload, name);
}

function getOptionalJsonTags(payload: Record<string, unknown>): readonly string[] | undefined {
  const value = payload.tags;
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0);
  return tags.length > 0 && tags.length === value.length ? [...new Set(tags)] : undefined;
}

function getJsonIds(payload: Record<string, unknown>): readonly string[] | undefined {
  const value = payload.ids;
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value.map((item) => typeof item === "string" ? item.trim() : undefined);
  return ids.every((id): id is string => Boolean(id)) ? ids : undefined;
}

function getOptionalJsonEvidence(payload: Record<string, unknown>): readonly MemoryVerificationEvidence[] | undefined {
  const value = payload.evidence;
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const evidence: MemoryVerificationEvidence[] = [];
  for (const item of value) {
    if (!isJsonObject(item)) {
      return undefined;
    }
    const type = getRequiredJsonString(item, "type");
    const evidenceValue = getRequiredJsonString(item, "value");
    if (!type || !isEvidenceType(type) || !evidenceValue) {
      return undefined;
    }
    const note = getOptionalJsonString(item, "note");
    evidence.push({ type, value: evidenceValue, ...(note ? { note } : {}) });
  }
  return evidence;
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
  const actionRun = await runConsoleMutation(reader, result);
  if (actionRun.status === "unavailable") {
    return actionRun;
  }
  return { status: "done" };
}

async function runConsoleMutation(
  reader: MemoryConsoleBackend,
  result: ConsoleActionResult,
): Promise<{ readonly status: "done"; readonly result: ConsoleApiMutationResult } | { readonly status: "unavailable"; readonly message: string }> {
  if (result.action === "review") {
    if (!reader.reviewMemory) {
      return { status: "unavailable", message: "Review actions are unavailable for this console backend." };
    }
    return { status: "done", result: await reader.reviewMemory(result.input as ConsoleReviewActionInput) };
  }

  if (result.action === "promote") {
    if (!reader.promoteMemory) {
      return { status: "unavailable", message: "Promote actions are unavailable for this console backend." };
    }
    return { status: "done", result: await reader.promoteMemory(result.input as ConsolePromoteActionInput) };
  }

  if (!reader.purgeRejectedMemories) {
    return { status: "unavailable", message: "Purge rejected actions are unavailable for this console backend." };
  }
  return { status: "done", result: await reader.purgeRejectedMemories(result.input as ConsolePurgeRejectedActionInput) };
}

function hasReviewReader(reader: MemoryConsoleBackend): reader is MemoryConsoleBackend & MemoryConsoleReviewReader {
  return typeof reader.listReviewQueueOverview === "function" && typeof reader.getReviewAssist === "function";
}

async function readFormBody(request: IncomingMessage): Promise<URLSearchParams> {
  return new URLSearchParams(await readRequestBody(request));
}

async function readJsonBody(request: IncomingMessage): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }> {
  const body = await readRequestBody(request);
  if (body.trim().length === 0) {
    return { ok: false, message: "Invalid JSON payload: request body is required." };
  }

  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, message: "Invalid JSON payload: request body must be valid JSON." };
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function jsonResponse(value: unknown, statusCode = 200): ConsoleHttpResponse {
  return {
    statusCode,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(value)}
`,
  };
}

function jsonActionErrorResponse(
  action: ConsoleActionError["action"],
  message: string,
  statusCode: 400 | 501,
  code: ConsoleApiErrorResponse["error"]["code"],
): ConsoleHttpResponse {
  return jsonResponse({ status: "error", action, error: { code, message } } satisfies ConsoleApiErrorResponse, statusCode);
}

function notFound(): ConsoleHttpResponse {
  return {
    statusCode: 404,
    contentType: "text/plain; charset=utf-8",
    body: "Not found",
  };
}

function methodNotAllowed(
  method: string,
  path: string,
  allow: string,
): ConsoleHttpResponse {
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
