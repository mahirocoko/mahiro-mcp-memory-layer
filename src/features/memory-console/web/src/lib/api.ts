import { apiSearchParamsForRoute } from "@/lib/routes";
import type { ConsoleRouteState } from "@/lib/routes";
import type { ConsoleApiResponse, ConsoleRouteData } from "@/types";
import type {
  ConsoleApiAction,
  ConsoleApiErrorCode,
  ConsoleApiSuccessResponse,
  ConsoleGraphLoadResult,
  ConsoleLoadResult,
  ConsolePromoteActionInput,
  ConsolePurgeRejectedActionInput,
  ConsoleReviewActionInput,
  ConsoleReviewLoadResult,
} from "../../../types.js";

type ConsoleApiGetEndpoint = "/api/memories" | "/api/review" | "/api/graph";
type ConsoleApiPostEndpoint = "/api/review" | "/api/promote" | "/api/purge-rejected";

export class ConsoleApiRequestError extends Error {
  readonly statusCode: number;
  readonly action?: ConsoleApiAction;
  readonly code?: ConsoleApiErrorCode;

  constructor(message: string, statusCode: number, details: { readonly action?: ConsoleApiAction; readonly code?: ConsoleApiErrorCode } = {}) {
    super(message);
    this.name = "ConsoleApiRequestError";
    this.statusCode = statusCode;
    this.action = details.action;
    this.code = details.code;
  }
}

export async function loadRouteData(routeState: ConsoleRouteState, signal?: AbortSignal): Promise<ConsoleRouteData> {
  if (routeState.path === "/review") {
    return loadReview(routeState.searchParams, signal);
  }

  if (routeState.path === "/graph") {
    return loadGraph(routeState.searchParams, signal);
  }

  return loadMemories(apiSearchParamsForRoute(routeState), signal);
}

export async function loadMemories(params: URLSearchParams, signal?: AbortSignal): Promise<ConsoleLoadResult> {
  return readJson<ConsoleLoadResult>("/api/memories", params, signal);
}

export async function loadReview(params: URLSearchParams, signal?: AbortSignal): Promise<ConsoleReviewLoadResult> {
  return readJson<ConsoleReviewLoadResult>("/api/review", params, signal);
}

export async function loadGraph(params: URLSearchParams, signal?: AbortSignal): Promise<ConsoleGraphLoadResult> {
  return readJson<ConsoleGraphLoadResult>("/api/graph", params, signal);
}

export async function submitReview(input: ConsoleReviewActionInput, signal?: AbortSignal): Promise<ConsoleApiSuccessResponse> {
  return writeJson("/api/review", input, signal);
}

export async function submitPromote(input: ConsolePromoteActionInput, signal?: AbortSignal): Promise<ConsoleApiSuccessResponse> {
  return writeJson("/api/promote", input, signal);
}

export async function submitPurgeRejected(input: ConsolePurgeRejectedActionInput, signal?: AbortSignal): Promise<ConsoleApiSuccessResponse> {
  return writeJson("/api/purge-rejected", input, signal);
}

async function readJson<T>(endpoint: ConsoleApiGetEndpoint, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(endpointWithParams(endpoint, params), { signal });
  return parseResponse<T>(response);
}

async function writeJson(endpoint: ConsoleApiPostEndpoint, input: unknown, signal?: AbortSignal): Promise<ConsoleApiSuccessResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  return parseResponse<ConsoleApiSuccessResponse>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as ConsoleApiResponse | T;

  if (!response.ok) {
    throw new ConsoleApiRequestError(errorMessage(body), response.status, errorDetails(body));
  }

  if (isConsoleApiError(body)) {
    throw new ConsoleApiRequestError(body.error.message, response.status, { action: body.action, code: body.error.code });
  }

  return body as T;
}

function endpointWithParams(endpoint: ConsoleApiGetEndpoint, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

function isConsoleApiError(value: unknown): value is Extract<ConsoleApiResponse, { readonly status: "error" }> {
  return typeof value === "object" && value !== null && "status" in value && value.status === "error";
}

function errorMessage(value: unknown): string {
  if (isConsoleApiError(value)) {
    return value.error.message;
  }

  return "Memory console request failed.";
}

function errorDetails(value: unknown): { readonly action?: ConsoleApiAction; readonly code?: ConsoleApiErrorCode } {
  if (isConsoleApiError(value)) {
    return { action: value.action, code: value.error.code };
  }

  return {};
}
