import { createServer, type Server } from "node:http";

import {
  aggregateViewerProjectScopes,
  canUseIndexedSearch,
  filterViewerMemories,
  normalizeMemoryRecord,
  normalizeSearchMemoryItem,
  normalizeViewerFilters,
} from "./filters.js";
import { escapeHtml, renderMemoryViewerPage } from "./render.js";
import type { ReadOnlyMemoryReader, ViewerFilterState, ViewerLoadResult, ViewerMemory } from "./types.js";

export const memoryViewerHost = "127.0.0.1";
export const defaultMemoryViewerPort = 4317;

export async function loadViewerMemories(
  reader: ReadOnlyMemoryReader,
  filters: ViewerFilterState,
): Promise<ViewerLoadResult> {
  const canonicalRecordsPromise = reader.readAll();

  if (canUseIndexedSearch(filters)) {
    const projectScopesPromise = loadProjectScopes(canonicalRecordsPromise);
    const result = await reader.search({
      query: filters.query,
      mode: "full",
      scope: filters.scope,
      projectId: filters.projectId,
      containerId: filters.containerId,
      limit: filters.limit,
    });
    const fetched = result.items.map((item) => normalizeSearchMemoryItem(item, filters.scope, filters.projectId, filters.containerId));
    const memories = filterViewerMemories(fetched, filters, { includeQuery: false });
    return toLoadResult(filters, memories, fetched.length, "search", result.degraded, await projectScopesPromise);
  }

  const canonicalRecords = await canonicalRecordsPromise;
  const fetched = canonicalRecords.map(normalizeMemoryRecord);
  const memories = filterViewerMemories(fetched, filters).slice(0, filters.limit);
  return toLoadResult(filters, memories, fetched.length, "list", false, aggregateViewerProjectScopes(fetched));
}

export function createMemoryViewerServer(reader: ReadOnlyMemoryReader): Server {
  return createServer((request, response) => {
    void handleRequest(reader, request.url ?? "/", request.method ?? "GET")
      .then((result) => {
        response.statusCode = result.statusCode;
        response.setHeader("content-type", result.contentType);
        response.setHeader("cache-control", "no-store");
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
        const message = error instanceof Error ? error.message : "Unknown viewer error";
        response.end(`<!doctype html><title>Memory viewer error</title><pre>${escapeHtml(message)}</pre>`);
      });
  });
}

export async function startMemoryViewerServer(
  reader: ReadOnlyMemoryReader,
  port = defaultMemoryViewerPort,
): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createMemoryViewerServer(reader);

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      const listenedPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({ server, url: `http://${memoryViewerHost}:${listenedPort}/` });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, memoryViewerHost);
  });
}

async function handleRequest(
  reader: ReadOnlyMemoryReader,
  rawUrl: string,
  method: string,
): Promise<{ readonly statusCode: number; readonly contentType: string; readonly body: string }> {
  if (method !== "GET" && method !== "HEAD") {
    return {
      statusCode: 405,
      contentType: "text/plain; charset=utf-8",
      body: "Method not allowed. The memory viewer is read-only.",
    };
  }

  const url = new URL(rawUrl, `http://${memoryViewerHost}:${defaultMemoryViewerPort}`);
  if (url.pathname !== "/") {
    return {
      statusCode: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found",
    };
  }

  const filters = normalizeViewerFilters(url.searchParams);
  const result = await loadViewerMemories(reader, filters);
  return {
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: renderMemoryViewerPage(result),
  };
}

function toLoadResult(
  filters: ViewerFilterState,
  memories: readonly ViewerMemory[],
  fetchedCount: number,
  fetchMode: ViewerLoadResult["fetchMode"],
  degraded: boolean,
  projectScopes: ViewerLoadResult["projectScopes"],
): ViewerLoadResult {
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

async function loadProjectScopes(canonicalRecordsPromise: Promise<readonly import("../memory/types.js").MemoryRecord[]>): Promise<ViewerLoadResult["projectScopes"]> {
  const canonicalRecords = await canonicalRecordsPromise;
  return aggregateViewerProjectScopes(canonicalRecords.map(normalizeMemoryRecord));
}
