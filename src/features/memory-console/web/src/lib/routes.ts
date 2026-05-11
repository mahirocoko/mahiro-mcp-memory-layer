import type { ConsolePath } from "@/types";
import type { ConsoleNavigationView, ConsoleProjectScopeSummary } from "../../../types.js";

export interface ConsoleRouteDefinition {
  readonly path: ConsolePath;
  readonly label: string;
  readonly description: string;
}

export interface ConsoleRouteState {
  readonly path: ConsolePath;
  readonly searchParams: URLSearchParams;
}

export const consoleRoutes = [
  {
    path: "/",
    label: "Browse",
    description: "Verified active memories and scoped search.",
  },
  {
    path: "/review",
    label: "Review",
    description: "Pending hypotheses and assist context.",
  },
  {
    path: "/rejected",
    label: "Rejected",
    description: "Rejected quarantine inspection.",
  },
  {
    path: "/graph",
    label: "Graph",
    description: "Read-only metadata graph projection.",
  },
] as const satisfies readonly ConsoleRouteDefinition[];

const routePaths = new Set<ConsolePath>(consoleRoutes.map((route) => route.path));

export function createRouteState(pathname = "/", search = ""): ConsoleRouteState {
  const candidate = new URL(pathname, "http://memory-console.local");
  if (search) {
    candidate.search = search;
  }

  const path = routePaths.has(candidate.pathname as ConsolePath) ? (candidate.pathname as ConsolePath) : "/";
  return {
    path,
    searchParams: new URLSearchParams(candidate.search),
  };
}

export function readRouteStateFromLocation(location: Pick<Location, "pathname" | "search">): ConsoleRouteState {
  return createRouteState(location.pathname, location.search);
}

export function routeHref(path: ConsolePath, routeState: ConsoleRouteState): string {
  return pathWithSearch(path, routeState.searchParams);
}

export function pathWithSearch(path: ConsolePath, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function memoryViewHref(view: Extract<ConsoleNavigationView, "verified" | "projects" | "firehose">, currentParams: URLSearchParams): string {
  const params = new URLSearchParams(currentParams);
  params.delete("id");
  params.delete("edgeType");

  if (view === "verified") {
    params.delete("view");
    params.delete("verificationStatus");
    params.delete("reviewStatus");
    return pathWithSearch("/", params);
  }

  params.set("view", view);

  if (view === "firehose") {
    params.set("verificationStatus", "all");
    params.set("reviewStatus", "all");
  }

  return pathWithSearch("/", params);
}

export function projectBrowseHref(projectScope: ConsoleProjectScopeSummary, currentParams: URLSearchParams): string {
  const params = new URLSearchParams(currentParams);
  params.delete("view");
  params.delete("id");
  params.delete("edgeType");
  params.set("scope", "project");
  params.set("verificationStatus", "all");
  params.set("reviewStatus", "all");
  params.set("projectId", projectScope.projectId);
  params.set("containerId", projectScope.containerId);
  return pathWithSearch("/", params);
}

export function memoryDetailHref(path: ConsolePath, currentParams: URLSearchParams, memoryId: string): string {
  const params = new URLSearchParams(currentParams);
  params.set("id", memoryId);
  return pathWithSearch(path, params);
}

export function apiSearchParamsForRoute(routeState: ConsoleRouteState): URLSearchParams {
  const params = new URLSearchParams(routeState.searchParams);

  if (routeState.path === "/rejected") {
    params.set("view", "firehose");
    params.set("verificationStatus", "all");
    params.set("reviewStatus", "rejected");
  }

  return params;
}

export function routeLabel(path: ConsolePath): string {
  return consoleRoutes.find((route) => route.path === path)?.label ?? "Browse";
}
