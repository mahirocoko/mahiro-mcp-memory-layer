import type { FormEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";

import { ConsoleApiRequestError, loadRouteData, submitPromote, submitPurgeRejected, submitReview } from "@/lib/api";
import {
  consoleRoutes,
  memoryDetailHref,
  memoryViewHref,
  pathWithSearch,
  projectBrowseHref,
  readRouteStateFromLocation,
  routeHref,
  routeLabel,
} from "@/lib/routes";
import type { ConsoleRouteState } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { ConsoleLoadState, ConsoleRouteData } from "@/types";
import type {
  ConsoleApiAction,
  ConsoleApiErrorCode,
  ConsoleGraphLoadResult,
  ConsoleLoadResult,
  ConsoleMemory,
  ConsoleNavigationView,
  ConsoleProjectScopeSummary,
  ConsolePurgeRejectedActionInput,
  ConsolePurgeRejectedActionResult,
  ConsoleReviewLoadResult,
  MemoryGraphEdge,
  MemoryGraphEdgeType,
  MemoryGraphNode,
  MemoryGraphNodeType,
  MemoryGraphWarning,
} from "../../types.js";
import type { MemoryReviewHint, MemoryVerificationEvidence, ReviewAssistSuggestion, ReviewQueueOverviewItem } from "../../../memory/types.js";

interface PurgeResultNotice {
  readonly contextKey: string;
  readonly result: ConsolePurgeRejectedActionResult;
}

export function App() {
  const [routeState, setRouteState] = useState(() => readRouteStateFromLocation(window.location));
  const [loadState, setLoadState] = useState<ConsoleLoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [purgeResultNotice, setPurgeResultNotice] = useState<PurgeResultNotice | undefined>();

  useEffect(() => {
    const onPopState = () => setRouteState(readRouteStateFromLocation(window.location));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (routeState.path !== "/rejected") {
      setPurgeResultNotice(undefined);
    }
  }, [routeState.path]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });

    loadRouteData(routeState, controller.signal)
      .then((data) => setLoadState(isRouteDataEmpty(data, routeState) ? { status: "empty", data } : { status: "success", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoadState({ status: "error", message: error instanceof Error ? error.message : "Memory console request failed." });
      });

    return () => controller.abort();
  }, [routeState, reloadKey]);

  const navigate = (url: string) => {
    window.history.pushState(null, "", url);
    setRouteState(readRouteStateFromLocation(window.location));
  };

  return (
    <MemoryConsoleShell
      loadState={loadState}
      onNavigate={navigate}
      onPurgeResult={setPurgeResultNotice}
      onRetry={() => setReloadKey((value) => value + 1)}
      purgeResultNotice={purgeResultNotice}
      routeState={routeState}
    />
  );
}

interface MemoryConsoleShellProps {
  readonly routeState: ConsoleRouteState;
  readonly loadState: ConsoleLoadState;
  readonly onNavigate?: (url: string) => void;
  readonly onPurgeResult?: (notice: PurgeResultNotice) => void;
  readonly onRetry?: () => void;
  readonly purgeResultNotice?: PurgeResultNotice;
}

export function MemoryConsoleShell({ routeState, loadState, onNavigate, onPurgeResult, onRetry, purgeResultNotice }: MemoryConsoleShellProps) {
  const activeLabel = routeLabel(routeState.path);

  const handleNavigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    onNavigate(href);
  };

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    for (const name of filterFieldNames) {
      const value = formData.get(name);
      if (typeof value === "string" && value.trim().length > 0) {
        params.set(name, value.trim());
      }
    }

    onNavigate?.(pathWithSearch(routeState.path, params));
  };

  return (
    <main className="app-shell">
      <header className="console-header" aria-labelledby="console-title">
        <div className="console-title-block">
          <h1 id="console-title">Local memory console</h1>
          <p>Browse, review, rejected quarantine, and graph inspection stay local to this memory package.</p>
        </div>
        <button aria-label={`Refresh ${activeLabel}`} className="console-action" onClick={onRetry} type="button">
          Refresh
        </button>
      </header>

      <div className="console-layout">
        <aside className="console-sidebar" aria-label="Memory console navigation">
          <nav className="console-nav">
            {consoleRoutes.map((route) => {
              const href = routeHref(route.path, routeState);
              const active = route.path === routeState.path;
              return (
                <a
                  aria-current={active ? "page" : undefined}
                  className={cn("console-nav-link", active && "console-nav-link-active")}
                  href={href}
                  key={route.path}
                  onClick={(event) => handleNavigate(event, href)}
                >
                  <span>{route.label}</span>
                  <span className="console-nav-description">{route.description}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="console-content" aria-labelledby="route-title">
          {routeState.path === "/" ? <MemoryViewNavigation routeState={routeState} onNavigate={handleNavigate} /> : null}
          <RouteFilterPanel routeState={routeState} onSubmit={handleFilterSubmit} />
          <RouteContent activeLabel={activeLabel} loadState={loadState} onPurgeResult={onPurgeResult} onRetry={onRetry} purgeResultNotice={purgeResultNotice} routeState={routeState} />
        </section>
      </div>
    </main>
  );
}

const filterFieldNames = ["q", "view", "scope", "kind", "verificationStatus", "reviewStatus", "projectId", "containerId", "id", "edgeType", "limit"] as const;

function MemoryViewNavigation({
  routeState,
  onNavigate,
}: {
  readonly routeState: ConsoleRouteState;
  readonly onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const activeView = routeState.searchParams.get("view") ?? "verified";
  const links: readonly { readonly view: Extract<ConsoleNavigationView, "verified" | "projects" | "firehose">; readonly label: string; readonly description: string }[] = [
    { view: "verified", label: "Browse", description: "Verified active records" },
    { view: "projects", label: "Projects", description: "Project/container scopes" },
    { view: "firehose", label: "Firehose", description: "Raw recent/list mode" },
  ];

  return (
    <nav className="memory-view-nav" aria-label="Memory exploration views">
      {links.map((link) => {
        const href = memoryViewHref(link.view, routeState.searchParams);
        const active = activeView === link.view;
        return (
          <a
            aria-current={active ? "page" : undefined}
            className={cn("memory-view-link", active && "memory-view-link-active")}
            href={href}
            key={link.view}
            onClick={(event) => onNavigate(event, href)}
          >
            <span>{link.label}</span>
            <span className="memory-view-description">{link.description}</span>
          </a>
        );
      })}
    </nav>
  );
}

function RouteFilterPanel({ routeState, onSubmit }: { readonly routeState: ConsoleRouteState; readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const value = (key: string) => routeState.searchParams.get(key) ?? "";

  return (
    <form aria-label="Filter memory console records" className="filter-panel" key={pathWithSearch(routeState.path, routeState.searchParams)} onSubmit={onSubmit}>
      {value("view") ? <input name="view" type="hidden" value={value("view")} /> : null}
      <div className="filter-row">
        <label className="filter-field filter-field-wide">
          <span>Search</span>
          <input defaultValue={value("q")} name="q" placeholder="Search memory content" type="search" />
        </label>
        <label className="filter-field">
          <span>Scope</span>
          <select defaultValue={value("scope") || "all"} name="scope">
            <option value="all">all</option>
            <option value="global">global</option>
            <option value="project">project</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Kind</span>
          <select defaultValue={value("kind") || "all"} name="kind">
            <option value="all">all</option>
            <option value="fact">fact</option>
            <option value="conversation">conversation</option>
            <option value="decision">decision</option>
            <option value="doc">doc</option>
            <option value="task">task</option>
          </select>
        </label>
      </div>

      <div className="filter-row filter-row-secondary">
        <label className="filter-field">
          <span>Verification</span>
          <select defaultValue={value("verificationStatus") || "all"} name="verificationStatus">
            <option value="all">all</option>
            <option value="hypothesis">hypothesis</option>
            <option value="verified">verified</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Review</span>
          <select defaultValue={value("reviewStatus") || "all"} name="reviewStatus">
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="none">none</option>
            <option value="pending">pending</option>
            <option value="deferred">deferred</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Project</span>
          <input defaultValue={value("projectId")} name="projectId" placeholder="projectId" />
        </label>
        <label className="filter-field">
          <span>Container</span>
          <input defaultValue={value("containerId")} name="containerId" placeholder="containerId" />
        </label>
        <label className="filter-field">
          <span>Selected ID</span>
          <input defaultValue={value("id")} name="id" placeholder="memory or graph node" />
        </label>
        <label className="filter-field">
          <span>Edge</span>
          <select defaultValue={value("edgeType") || "all"} name="edgeType">
            <option value="all">all</option>
            <option value="has_source">has_source</option>
            <option value="tagged_with">tagged_with</option>
            <option value="has_evidence">has_evidence</option>
            <option value="reviewed_as">reviewed_as</option>
            <option value="related_memory">related_memory</option>
          </select>
        </label>
        <label className="filter-field filter-field-limit">
          <span>Limit</span>
          <input defaultValue={value("limit")} inputMode="numeric" name="limit" placeholder="50" />
        </label>
        <button className="console-action filter-submit" type="submit">
          Apply
        </button>
      </div>
    </form>
  );
}

function RouteContent({
  activeLabel,
  loadState,
  onPurgeResult,
  onRetry,
  purgeResultNotice,
  routeState,
}: {
  readonly activeLabel: string;
  readonly loadState: ConsoleLoadState;
  readonly onPurgeResult?: (notice: PurgeResultNotice) => void;
  readonly onRetry?: () => void;
  readonly purgeResultNotice?: PurgeResultNotice;
  readonly routeState: ConsoleRouteState;
}) {
  if (loadState.status === "loading") {
    return (
      <article className="console-panel" aria-busy="true" role="status">
        <h2 id="route-title">Loading {activeLabel}</h2>
        <p>Reading the local memory API.</p>
      </article>
    );
  }

  if (loadState.status === "error") {
    return (
      <article className="console-panel console-panel-error" role="alert">
        <h2 id="route-title">Could not load {activeLabel}</h2>
        <p>{loadState.message}</p>
        <button className="console-action" onClick={onRetry} type="button">
          Retry
        </button>
      </article>
    );
  }

  if (loadState.status === "empty") {
    const emptyLabel = routeDisplayLabel(activeLabel, loadState.data);
    return (
      <article className="console-panel" role="status">
        <h2 id="route-title">{emptyLabel} is empty</h2>
        <p>No records matched the current path and query.</p>
        <LoadedRouteSummary data={loadState.data} onPurgeResult={onPurgeResult} onRefresh={onRetry} purgeResultNotice={purgeResultNotice} routeState={routeState} />
      </article>
    );
  }

  return (
    <article className="console-panel">
      <LoadedRouteSummary data={loadState.data} onPurgeResult={onPurgeResult} onRefresh={onRetry} purgeResultNotice={purgeResultNotice} routeState={routeState} />
    </article>
  );
}

function routeDisplayLabel(activeLabel: string, data: ConsoleRouteData): string {
  if (isGraphLoadResult(data) || isReviewLoadResult(data)) {
    return activeLabel;
  }

  if (data.filters.view === "projects") {
    return "Projects";
  }

  if (data.filters.view === "firehose") {
    return "Firehose";
  }

  return activeLabel;
}

function LoadedRouteSummary({
  data,
  onPurgeResult,
  onRefresh,
  purgeResultNotice,
  routeState,
}: {
  readonly data: ConsoleRouteData;
  readonly onPurgeResult?: (notice: PurgeResultNotice) => void;
  readonly onRefresh?: () => void;
  readonly purgeResultNotice?: PurgeResultNotice;
  readonly routeState: ConsoleRouteState;
}) {
  if (isGraphLoadResult(data)) {
    return <GraphSummary data={data} routeState={routeState} />;
  }

  if (isReviewLoadResult(data)) {
    return <ReviewSummary data={data} onRefresh={onRefresh} routeState={routeState} />;
  }

  return <MemoryExplorer data={data} onPurgeResult={onPurgeResult} onRefresh={onRefresh} purgeResultNotice={purgeResultNotice} routeState={routeState} />;
}

function MemoryExplorer({
  data,
  onPurgeResult,
  onRefresh,
  purgeResultNotice,
  routeState,
}: {
  readonly data: ConsoleLoadResult;
  readonly onPurgeResult?: (notice: PurgeResultNotice) => void;
  readonly onRefresh?: () => void;
  readonly purgeResultNotice?: PurgeResultNotice;
  readonly routeState: ConsoleRouteState;
}) {
  if (data.filters.view === "projects") {
    return <ProjectsView data={data} routeState={routeState} />;
  }

  if (routeState.path === "/rejected") {
    return <RejectedQuarantine data={data} onPurgeResult={onPurgeResult} onRefresh={onRefresh} purgeResultNotice={purgeResultNotice} routeState={routeState} />;
  }

  const firehose = data.filters.view === "firehose";
  return (
    <div className="route-stack">
      <div className="section-heading">
        <h2 id="route-title">{firehose ? "Firehose" : "Browse"}</h2>
        <p>
          {firehose
            ? "Raw recent/list mode across memory records. This is not a reviewed or approved truth view."
            : "Search and filter canonical memories, then inspect a selected record without leaving the browse surface."}
        </p>
      </div>
      <MemoryStatus data={data} />
      <section className="memory-grid" aria-label="Memory records and selected detail">
        <MemoryList data={data} routeState={routeState} />
        <MemoryDetail memory={data.selectedMemory} />
      </section>
    </div>
  );
}

function RejectedQuarantine({
  data,
  onPurgeResult,
  onRefresh,
  purgeResultNotice,
  routeState,
}: {
  readonly data: ConsoleLoadResult;
  readonly onPurgeResult?: (notice: PurgeResultNotice) => void;
  readonly onRefresh?: () => void;
  readonly purgeResultNotice?: PurgeResultNotice;
  readonly routeState: ConsoleRouteState;
}) {
  const rejectedMemories = data.memories.filter((memory) => memory.reviewStatus === "rejected");
  const purgeContext = resolvePurgeScopeContext(data, rejectedMemories);
  const purgeContextKey = purgeScopeContextKey(purgeContext);
  const scopedResultNotice = purgeResultNotice?.contextKey === purgeContextKey ? purgeResultNotice.result : undefined;

  return (
    <div className="route-stack">
      <div className="section-heading">
        <h2 id="route-title">Rejected quarantine</h2>
        <p>Rejected records stay isolated from normal retrieval. Purge remains guarded, scope-bound, and rejected-only.</p>
      </div>
      <section className="status-strip" aria-live="polite">
        <strong>{rejectedMemories.length}</strong> rejected records shown from <strong>{data.fetchedCount}</strong> fetched. Refreshed {formatTimestamp(data.refreshedAt)}.
      </section>
      <PurgeRejectedPanel context={purgeContext} contextKey={purgeContextKey} key={purgeContextKey} onPurgeResult={onPurgeResult} onRefresh={onRefresh} persistedResult={scopedResultNotice} />
      <section className="memory-grid" aria-label="Rejected memories and selected detail">
        <MemoryList data={{ ...data, memories: rejectedMemories }} routeState={routeState} />
        <MemoryDetail memory={data.selectedMemory?.reviewStatus === "rejected" ? data.selectedMemory : rejectedMemories[0]} />
      </section>
    </div>
  );
}

type PurgeScopeContext =
  | {
      readonly scope: "global";
      readonly records: readonly ConsoleMemory[];
    }
  | {
      readonly scope: "project";
      readonly projectId: string;
      readonly containerId: string;
      readonly records: readonly ConsoleMemory[];
    };

function resolvePurgeScopeContext(data: ConsoleLoadResult, rejectedMemories: readonly ConsoleMemory[]): PurgeScopeContext | undefined {
  if (data.filters.scope === "global") {
    return { scope: "global", records: rejectedMemories.filter((memory) => memory.scope === "global") };
  }

  if (data.filters.scope === "project") {
    const projectId = data.filters.projectId;
    const containerId = data.filters.containerId;
    if (!projectId || !containerId) {
      return undefined;
    }
    return {
      scope: "project",
      projectId,
      containerId,
      records: rejectedMemories.filter((memory) => memory.scope === "project" && memory.projectId === projectId && memory.containerId === containerId),
    };
  }

  const [firstMemory] = rejectedMemories;
  if (!firstMemory) {
    return undefined;
  }

  if (firstMemory.scope === "global" && rejectedMemories.every((memory) => memory.scope === "global")) {
    return { scope: "global", records: rejectedMemories };
  }

  if (firstMemory.scope === "project" && firstMemory.projectId && firstMemory.containerId) {
    const sameProjectScope = rejectedMemories.every(
      (memory) => memory.scope === "project" && memory.projectId === firstMemory.projectId && memory.containerId === firstMemory.containerId,
    );
    if (sameProjectScope) {
      return { scope: "project", projectId: firstMemory.projectId, containerId: firstMemory.containerId, records: rejectedMemories };
    }
  }

  return undefined;
}

function purgeScopeContextKey(context: PurgeScopeContext | undefined): string {
  if (!context) {
    return "blocked";
  }

  const queuedIds = context.records.map((memory) => memory.id).join("|");
  if (context.scope === "project") {
    return `project:${context.projectId}:${context.containerId}:${queuedIds}`;
  }

  return `global:${queuedIds}`;
}

export function PurgeRejectedPanel({
  context,
  contextKey,
  onPurgeResult,
  onRefresh,
  persistedResult,
}: {
  readonly context?: PurgeScopeContext;
  readonly contextKey: string;
  readonly onPurgeResult?: (notice: PurgeResultNotice) => void;
  readonly onRefresh?: () => void;
  readonly persistedResult?: ConsolePurgeRejectedActionResult;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [mutationState, setMutationState] = useState<ReviewMutationState>({ status: "idle" });
  const [previewResult, setPreviewResult] = useState<ConsolePurgeRejectedActionResult | undefined>();
  const [lastResult, setLastResult] = useState<ConsolePurgeRejectedActionResult | undefined>();
  const active = mutationState.status === "submitting";

  if (!context) {
    return (
      <section className="details-panel" aria-label="Rejected purge guard">
        <div className="detail-header">
          <h3>Guarded purge</h3>
          <span>blocked</span>
        </div>
        <p>Filter rejected records to one complete global or project/container scope before purge can be previewed.</p>
      </section>
    );
  }

  const ids = context.records.map((memory) => memory.id);
  const hasRecords = ids.length > 0;
  const canSubmitFinal = hasRecords && Boolean(previewResult) && !active;
  const displayedResult = lastResult ?? persistedResult;

  const runPreview = async () => {
    if (!hasRecords) {
      setMutationState({ status: "error", error: localMutationError("purge-rejected", "invalid_payload", "No rejected records are available in this purge scope.") });
      return;
    }

    setMutationState({ status: "submitting", actionLabel: "Purge preview" });
    try {
      const response = await submitPurgeRejected(buildPurgeInput(context, true));
      if (!isPurgeRejectedResult(response.result)) {
        setMutationState({ status: "error", error: localMutationError("purge-rejected", "invalid_payload", "Purge preview returned an unexpected result.") });
        return;
      }
      setPreviewResult(response.result);
      setLastResult(response.result);
      setMutationState({ status: "success", message: "Preview complete. Confirm the exact scope and type DELETE REJECTED before final purge." });
    } catch (error: unknown) {
      setMutationState({ status: "error", error: mutationErrorFromUnknown(error, "purge-rejected") });
    }
  };

  const runFinalPurge = async () => {
    if (!previewResult) {
      setMutationState({ status: "error", error: localMutationError("purge-rejected", "invalid_payload", "Run the purge preview before submitting the final purge.") });
      return;
    }
    if (confirmation.trim() !== "DELETE REJECTED") {
      setMutationState({ status: "error", error: localMutationError("purge-rejected", "invalid_payload", "Confirmation must be DELETE REJECTED.") });
      return;
    }

    setMutationState({ status: "submitting", actionLabel: "Final purge" });
    try {
      const response = await submitPurgeRejected(buildPurgeInput(context, false));
      if (!isPurgeRejectedResult(response.result)) {
        setMutationState({ status: "error", error: localMutationError("purge-rejected", "invalid_payload", "Purge returned an unexpected result.") });
        return;
      }
      const counts = purgeOutcomeCounts(response.result);
      setLastResult(response.result);
      setPreviewResult(undefined);
      setConfirmation("");
      onPurgeResult?.({ contextKey, result: response.result });
      setMutationState({ status: "success", message: `Purge complete. Deleted ${counts.deleted}, skipped ${counts.skipped}. Refreshing rejected list.` });
      onRefresh?.();
    } catch (error: unknown) {
      setMutationState({ status: "error", error: mutationErrorFromUnknown(error, "purge-rejected") });
    }
  };

  return (
    <section className="details-panel purge-panel" aria-label="Rejected purge guard">
      <div className="detail-header">
        <h3>Guarded purge</h3>
        <span>{context.scope}</span>
      </div>
      <dl className="detail-list">
        <DetailItem label="Scope" value={context.scope} />
        <DetailItem label="Project" value={context.scope === "project" ? context.projectId : "none"} />
        <DetailItem label="Container" value={context.scope === "project" ? context.containerId : "none"} />
        <DetailItem label="Queued count" value={String(ids.length)} />
      </dl>
      <TokenList title="Queued rejected IDs" values={ids} emptyLabel="No rejected IDs in this scope" />
      <ReviewMutationAlert state={mutationState} />
      {displayedResult ? <PurgeRejectedResultSummary result={displayedResult} /> : null}
      <div className="action-grid">
        <label className="action-field">
          <span>Final confirmation</span>
          <input
            aria-describedby="purge-confirmation-help"
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="DELETE REJECTED"
            value={confirmation}
          />
          <p id="purge-confirmation-help">Type DELETE REJECTED after previewing this rejected-only scope.</p>
        </label>
        <div className="action-buttons">
          <button aria-label={`Preview purge for ${context.scope} rejected scope`} className="console-action" disabled={active || !hasRecords} onClick={() => void runPreview()} type="button">
            Preview purge
          </button>
          <button aria-label={`Purge rejected records for ${context.scope} scope`} className="console-action console-action-danger" disabled={!canSubmitFinal} onClick={() => void runFinalPurge()} type="button">
            Purge rejected
          </button>
        </div>
      </div>
    </section>
  );
}

function buildPurgeInput(context: PurgeScopeContext, dryRun: boolean): ConsolePurgeRejectedActionInput {
  const ids = context.records.map((memory) => memory.id);
  if (context.scope === "project") {
    return {
      ids,
      scope: "project",
      projectId: context.projectId,
      containerId: context.containerId,
      confirmation: "DELETE REJECTED",
      ...(dryRun ? { dryRun: true } : {}),
    };
  }

  return {
    ids,
    scope: "global",
    confirmation: "DELETE REJECTED",
    ...(dryRun ? { dryRun: true } : {}),
  };
}

function isPurgeRejectedResult(value: unknown): value is ConsolePurgeRejectedActionResult {
  return typeof value === "object" && value !== null && "status" in value && value.status === "accepted" && "outcomes" in value;
}

export function PurgeRejectedResultSummary({ result }: { readonly result: ConsolePurgeRejectedActionResult }) {
  const counts = purgeOutcomeCounts(result);
  return (
    <section className="detail-section">
      <h4>{result.dryRun ? "Preview result" : "Purge result"}</h4>
      {result.dryRun ? (
        <p>Dry-run checked {result.outcomes.length} records. Would delete {counts.dryRun}, skipped {counts.skipped}.</p>
      ) : (
        <p>Final purge checked {result.outcomes.length} records. Deleted {counts.deleted}, skipped {counts.skipped}.</p>
      )}
      <div className="token-list">
        {result.outcomes.map((outcome) => <span key={`${outcome.id}:${outcome.status}`}>{outcome.id}: {outcome.status}</span>)}
      </div>
    </section>
  );
}

function purgeOutcomeCounts(result: ConsolePurgeRejectedActionResult): { readonly deleted: number; readonly dryRun: number; readonly skipped: number } {
  const deleted = result.outcomes.filter((outcome) => outcome.status === "deleted").length;
  const dryRun = result.outcomes.filter((outcome) => outcome.status === "dry_run").length;
  return { deleted, dryRun, skipped: result.outcomes.length - deleted - dryRun };
}

function MemoryStatus({ data }: { readonly data: ConsoleLoadResult }) {
  return (
    <section className="status-strip" aria-live="polite">
      <strong>{data.memories.length}</strong> shown from <strong>{data.fetchedCount}</strong> fetched by {data.fetchMode}
      {data.degraded ? " with degraded retrieval" : ""}. Refreshed {formatTimestamp(data.refreshedAt)}.
    </section>
  );
}

function MemoryList({ data, routeState }: { readonly data: ConsoleLoadResult; readonly routeState: ConsoleRouteState }) {
  if (data.memories.length === 0) {
    return (
      <section className="list-panel" aria-label="Loaded memories">
        <p>No memories matched these filters.</p>
      </section>
    );
  }

  return (
    <section className="list-panel" aria-label="Loaded memories">
      {data.memories.map((memory) => {
        const active = data.selectedMemory?.id === memory.id;
        const href = memoryDetailHref(routeState.path, routeState.searchParams, memory.id);
        return (
          <a className={cn("memory-row", active && "memory-row-active")} href={href} key={memory.id}>
            <span className="row-title">{memory.summary ?? memory.content}</span>
            <span className="row-meta">
              {memory.id} · {memory.kind} · {formatScopeIdentity(memory)}
            </span>
            <span className="signal-badges">
              <Badge label={memory.verificationStatus} tone={`verification-${memory.verificationStatus}`} />
              <Badge label={memory.reviewStatus ?? "unreviewed"} tone={`review-${memory.reviewStatus ?? "unreviewed"}`} />
              {memory.tags.slice(0, 3).map((tag) => <Badge label={`#${tag}`} tone="tag" key={tag} />)}
            </span>
          </a>
        );
      })}
    </section>
  );
}

function MemoryDetail({ memory }: { readonly memory?: ConsoleMemory }) {
  if (!memory) {
    return (
      <aside className="details-panel" aria-label="Selected memory detail">
        <h3>Select a memory</h3>
        <p>Choose a row to inspect content, source, evidence, scope identity, and review metadata.</p>
      </aside>
    );
  }

  return (
    <aside className="details-panel" aria-label="Selected memory detail">
      <div className="detail-header">
        <h3>{memory.summary ?? memory.id}</h3>
        <span>{memory.kind}</span>
      </div>
      <dl className="detail-list">
        <DetailItem label="ID" value={memory.id} />
        <DetailItem label="Scope" value={memory.scope ?? "unknown"} />
        <DetailItem label="Project" value={memory.projectId ?? "none"} />
        <DetailItem label="Container" value={memory.containerId ?? "none"} />
        <DetailItem label="Verification" value={memory.verificationStatus} />
        <DetailItem label="Review" value={memory.reviewStatus ?? "unreviewed"} />
        <DetailItem label="Importance" value={String(memory.importance)} />
        <DetailItem label="Created" value={formatTimestamp(memory.createdAt)} />
        <DetailItem label="Updated" value={memory.updatedAt ? formatTimestamp(memory.updatedAt) : "none"} />
        <DetailItem label="Verified at" value={memory.verifiedAt ? formatTimestamp(memory.verifiedAt) : "none"} />
      </dl>
      <section className="detail-section">
        <h4>Content</h4>
        <p className="memory-content">{memory.content}</p>
      </section>
      {memory.summary ? (
        <section className="detail-section">
          <h4>Summary</h4>
          <p>{memory.summary}</p>
        </section>
      ) : null}
      <section className="detail-section">
        <h4>Source</h4>
        <dl className="detail-list detail-list-compact">
          <DetailItem label="Type" value={memory.source.type} />
          <DetailItem label="Title" value={memory.source.title ?? "none"} />
          <DetailItem label="URI" value={memory.source.uri ?? "none"} />
        </dl>
      </section>
      <EvidenceList title="Verification evidence" items={memory.verificationEvidence} />
      <ReviewDecisionList decisions={memory.reviewDecisions} />
      <TokenList title="Tags" values={memory.tags} emptyLabel="No tags" />
      <TokenList title="Search reasons" values={memory.reasons} emptyLabel="No search reasons" />
    </aside>
  );
}

function DetailItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function EvidenceList({ title, items }: { readonly title: string; readonly items: readonly ConsoleMemory["verificationEvidence"][number][] }) {
  return (
    <section className="detail-section">
      <h4>{title}</h4>
      {items.length === 0 ? <p>No evidence recorded.</p> : null}
      {items.map((item) => (
        <p className="evidence-line" key={`${item.type}:${item.value}:${item.note ?? ""}`}>
          <strong>{item.type}</strong>: {item.value}{item.note ? ` · ${item.note}` : ""}
        </p>
      ))}
    </section>
  );
}

function ReviewDecisionList({ decisions }: { readonly decisions: ConsoleMemory["reviewDecisions"] }) {
  return (
    <section className="detail-section">
      <h4>Review decisions</h4>
      {decisions.length === 0 ? <p>No review decisions recorded.</p> : null}
      {decisions.map((decision) => (
        <div className="decision-block" key={`${decision.action}:${decision.decidedAt}:${decision.note ?? ""}`}>
          <p>
            <strong>{decision.action}</strong> at {formatTimestamp(decision.decidedAt)}
          </p>
          {decision.note ? <p>{decision.note}</p> : null}
          <EvidenceList title="Decision evidence" items={decision.evidence ?? []} />
        </div>
      ))}
    </section>
  );
}

function TokenList({ title, values, emptyLabel }: { readonly title: string; readonly values: readonly string[]; readonly emptyLabel: string }) {
  return (
    <section className="detail-section">
      <h4>{title}</h4>
      {values.length === 0 ? <p>{emptyLabel}.</p> : <div className="token-list">{values.map((value) => <span key={value}>{value}</span>)}</div>}
    </section>
  );
}

function ProjectsView({ data, routeState }: { readonly data: ConsoleLoadResult; readonly routeState: ConsoleRouteState }) {
  return (
    <div className="route-stack">
      <div className="section-heading">
        <h2 id="route-title">Projects</h2>
        <p>Project and container scope summaries from canonical memory records. Links open Browse with project scope filters applied.</p>
      </div>
      <section className="status-strip" aria-live="polite">
        <strong>{data.projectScopes.length}</strong> project/container scopes discovered. Refreshed {formatTimestamp(data.refreshedAt)}.
      </section>
      <section className="projects-panel" aria-label="Project and container scopes">
        {data.projectScopes.length === 0 ? <p>No complete project/container scopes were found.</p> : null}
        {data.projectScopes.map((projectScope) => <ProjectScopeCard key={`${projectScope.projectId}:${projectScope.containerId}`} projectScope={projectScope} routeState={routeState} />)}
      </section>
    </div>
  );
}

function ProjectScopeCard({ projectScope, routeState }: { readonly projectScope: ConsoleProjectScopeSummary; readonly routeState: ConsoleRouteState }) {
  const href = projectBrowseHref(projectScope, routeState.searchParams);
  return (
    <article className="project-card">
      <div className="project-card-header">
        <div>
          <h3>{projectScope.projectId}</h3>
          <p>{projectScope.containerId}</p>
        </div>
        <a className="console-action" href={href}>Browse scope</a>
      </div>
      <dl className="detail-list project-counts">
        <DetailItem label="Total" value={String(projectScope.totalCount)} />
        <DetailItem label="Latest" value={projectScope.latestTimestamp ? formatTimestamp(projectScope.latestTimestamp) : "none"} />
      </dl>
      <CountGroup title="Kinds" counts={projectScope.kindCounts} />
      <CountGroup title="Verification" counts={projectScope.verificationStatusCounts} />
      <CountGroup title="Review" counts={projectScope.reviewStatusCounts} />
    </article>
  );
}

function CountGroup({ title, counts }: { readonly title: string; readonly counts: Readonly<Record<string, number>> }) {
  return (
    <section className="count-group">
      <h4>{title}</h4>
      <div className="token-list">
        {Object.entries(counts).map(([label, count]) => <span key={label}>{label}: {count}</span>)}
      </div>
    </section>
  );
}

function ReviewSummary({ data, onRefresh, routeState }: { readonly data: ConsoleReviewLoadResult; readonly onRefresh?: () => void; readonly routeState: ConsoleRouteState }) {
  return (
    <div className="route-stack">
      <div className="section-heading">
        <h2 id="route-title">Review</h2>
        <p>Pending hypothesis memories with reviewer hints, assist suggestions, and explicit action controls.</p>
      </div>
      <section className="status-strip" aria-live="polite">
        <strong>{data.reviewItems.length}</strong> pending review items loaded. Refreshed {formatTimestamp(data.refreshedAt)}.
      </section>
      <section className="memory-grid review-grid" aria-label="Review inbox and selected detail">
        <ReviewItemList data={data} routeState={routeState} />
        <ReviewDetail data={data} onRefresh={onRefresh} />
      </section>
    </div>
  );
}

function ReviewItemList({ data, routeState }: { readonly data: ConsoleReviewLoadResult; readonly routeState: ConsoleRouteState }) {
  if (data.reviewItems.length === 0) {
    return (
      <section className="list-panel" aria-label="Loaded review items">
        <p>No review items matched these filters.</p>
      </section>
    );
  }

  return (
    <section className="list-panel" aria-label="Loaded review items">
      {data.reviewItems.map((item) => {
        const active = data.selectedReviewItem?.id === item.id;
        const href = memoryDetailHref(routeState.path, routeState.searchParams, item.id);
        return (
          <a className={cn("memory-row", active && "memory-row-active")} href={href} key={item.id}>
            <span className="row-title">{item.summary ?? item.content}</span>
            <span className="row-meta">
              {item.id} · {item.kind} · priority {item.priorityScore}
            </span>
            <span className="signal-badges">
              <Badge label={item.verificationStatus} tone={`verification-${item.verificationStatus}`} />
              <Badge label={item.reviewStatus ?? "unreviewed"} tone={`review-${item.reviewStatus ?? "unreviewed"}`} />
              {item.hints.slice(0, 2).map((hint) => <Badge label={hint.type} tone="tag" key={`${item.id}:${hint.type}:${hint.relatedMemoryIds.join(",")}`} />)}
            </span>
          </a>
        );
      })}
    </section>
  );
}

function ReviewDetail({ data, onRefresh }: { readonly data: ConsoleReviewLoadResult; readonly onRefresh?: () => void }) {
  if (!data.selectedReviewItem) {
    return (
      <aside className="details-panel" aria-label="Selected review item detail">
        <h3>Select a review item</h3>
        <p>Choose a pending hypothesis to inspect reviewer context and take an explicit review action.</p>
      </aside>
    );
  }

  const item = data.selectedReviewItem;
  return (
    <aside className="details-panel" aria-label="Selected review item detail">
      <div className="detail-header">
        <h3>{item.summary ?? item.id}</h3>
        <span>{item.kind}</span>
      </div>
      <dl className="detail-list">
        <DetailItem label="ID" value={item.id} />
        <DetailItem label="Scope" value={item.scope} />
        <DetailItem label="Verification" value={item.verificationStatus} />
        <DetailItem label="Review" value={item.reviewStatus ?? "unreviewed"} />
        <DetailItem label="Priority" value={String(item.priorityScore)} />
        <DetailItem label="Importance" value={String(item.importance)} />
        <DetailItem label="Created" value={formatTimestamp(item.createdAt)} />
        <DetailItem label="Updated" value={item.updatedAt ? formatTimestamp(item.updatedAt) : "none"} />
      </dl>
      <section className="detail-section">
        <h4>Content</h4>
        <p className="memory-content">{item.content}</p>
      </section>
      {item.summary ? (
        <section className="detail-section">
          <h4>Summary</h4>
          <p>{item.summary}</p>
        </section>
      ) : null}
      <section className="detail-section">
        <h4>Source</h4>
        <dl className="detail-list detail-list-compact">
          <DetailItem label="Type" value={item.source.type} />
          <DetailItem label="Title" value={item.source.title ?? "none"} />
          <DetailItem label="URI" value={item.source.uri ?? "none"} />
        </dl>
      </section>
      <TokenList title="Priority reasons" values={item.priorityReasons} emptyLabel="No priority reasons" />
      <ReviewHintList title="Review hints" hints={item.hints} />
      <ReviewAssistPanel assist={data.reviewAssist} selectedId={item.id} />
      <ReviewDecisionList decisions={item.reviewDecisions} />
      <TokenList title="Tags" values={item.tags} emptyLabel="No tags" />
      <ReviewActionPanel item={item} key={item.id} onRefresh={onRefresh} />
    </aside>
  );
}

function ReviewHintList({ title, hints }: { readonly title: string; readonly hints: readonly MemoryReviewHint[] }) {
  return (
    <section className="detail-section">
      <h4>{title}</h4>
      {hints.length === 0 ? <p>No review hints available.</p> : null}
      {hints.map((hint) => (
        <div className="decision-block" key={`${hint.type}:${hint.relatedMemoryIds.join(",")}:${hint.note}`}>
          <p>
            <strong>{hint.type}</strong>{hint.relatedMemoryIds.length > 0 ? ` · related ${hint.relatedMemoryIds.join(", ")}` : ""}
          </p>
          <p>{hint.note}</p>
        </div>
      ))}
    </section>
  );
}

function ReviewAssistPanel({ assist, selectedId }: { readonly assist?: ConsoleReviewLoadResult["reviewAssist"]; readonly selectedId: string }) {
  if (!assist || assist.id !== selectedId) {
    return (
      <section className="detail-section">
        <h4>Assist suggestions</h4>
        <p>No assist suggestions loaded for this item.</p>
      </section>
    );
  }

  return (
    <section className="detail-section">
      <h4>Assist suggestions</h4>
      <p>{assist.suggestions.length} suggestions and {assist.hints.length} assist hints available.</p>
      {assist.hints.length > 0 ? <ReviewHintList title="Assist hint context" hints={assist.hints} /> : null}
      {assist.suggestions.length === 0 ? <p>No suggested review moves.</p> : null}
      {assist.suggestions.map((suggestion) => <ReviewAssistSuggestionBlock key={assistSuggestionKey(suggestion)} suggestion={suggestion} />)}
    </section>
  );
}

function ReviewAssistSuggestionBlock({ suggestion }: { readonly suggestion: ReviewAssistSuggestion }) {
  return (
    <div className="decision-block">
      <p>
        <strong>{suggestion.kind}</strong> · suggested {suggestion.suggestedAction}
        {suggestion.relatedMemoryIds.length > 0 ? ` · related ${suggestion.relatedMemoryIds.join(", ")}` : ""}
      </p>
      <p>{suggestion.rationale}</p>
      {suggestion.draftContent ? <p className="memory-content">Draft: {suggestion.draftContent}</p> : null}
    </div>
  );
}

function ReviewActionPanel({ item, onRefresh }: { readonly item: ReviewQueueOverviewItem; readonly onRefresh?: () => void }) {
  const [note, setNote] = useState("");
  const [content, setContent] = useState(item.content);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));
  const [evidenceType, setEvidenceType] = useState<MemoryVerificationEvidence["type"]>("human");
  const [evidenceValue, setEvidenceValue] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [mutationState, setMutationState] = useState<ReviewMutationState>({ status: "idle" });

  const active = mutationState.status === "submitting";
  const evidence = evidenceFromFields(evidenceType, evidenceValue, evidenceNote);

  const runReviewAction = async (action: "reject" | "defer" | "edit_then_promote") => {
    const noteValue = note.trim();
    if ((action === "reject" || action === "defer") && noteValue.length === 0) {
      setMutationState({ status: "error", error: localMutationError("review", "invalid_payload", "Reject and defer require a reviewer note.") });
      return;
    }
    if (action === "edit_then_promote" && evidence.length === 0) {
      setMutationState({ status: "error", error: localMutationError("review", "invalid_payload", "Edit then promote requires explicit evidence.") });
      return;
    }

    setMutationState({ status: "submitting", actionLabel: reviewActionLabel(action) });
    try {
      await submitReview({
        id: item.id,
        action,
        ...(noteValue ? { note: noteValue } : {}),
        ...(evidence.length > 0 ? { evidence } : {}),
        ...(action === "edit_then_promote" ? { content: content.trim(), summary: summary.trim(), tags: tagsFromInput(tags) } : {}),
      });
      setMutationState({ status: "success", message: `${reviewActionLabel(action)} accepted. Refreshing review data.` });
      onRefresh?.();
    } catch (error: unknown) {
      setMutationState({ status: "error", error: mutationErrorFromUnknown(error, "review") });
    }
  };

  const runPromote = async () => {
    if (evidence.length === 0) {
      setMutationState({ status: "error", error: localMutationError("promote", "invalid_payload", "Promote requires explicit evidence.") });
      return;
    }

    setMutationState({ status: "submitting", actionLabel: "Promote" });
    try {
      await submitPromote({ id: item.id, evidence });
      setMutationState({ status: "success", message: "Promote accepted. Refreshing review data." });
      onRefresh?.();
    } catch (error: unknown) {
      setMutationState({ status: "error", error: mutationErrorFromUnknown(error, "promote") });
    }
  };

  return (
    <section className="detail-section review-actions" aria-label="Review actions">
      <h4>Actions</h4>
      <ReviewMutationAlert state={mutationState} />
      <label className="action-field">
        <span>Reviewer note</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required for reject or defer" rows={3} />
      </label>
      <div className="action-grid">
        <label className="action-field">
          <span>Evidence type</span>
          <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as MemoryVerificationEvidence["type"])}>
            <option value="human">human</option>
            <option value="test">test</option>
            <option value="trace">trace</option>
            <option value="issue">issue</option>
            <option value="link">link</option>
          </select>
        </label>
        <label className="action-field">
          <span>Evidence value</span>
          <input value={evidenceValue} onChange={(event) => setEvidenceValue(event.target.value)} placeholder="reviewer, trace id, URL" />
        </label>
      </div>
      <label className="action-field">
        <span>Evidence note</span>
        <input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Optional evidence note" />
      </label>
      <label className="action-field">
        <span>Edited content</span>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={4} />
      </label>
      <label className="action-field">
        <span>Edited summary</span>
        <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary for edit then promote" />
      </label>
      <label className="action-field">
        <span>Edited tags</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tag-a, tag-b" />
      </label>
      <div className="action-buttons">
        <button aria-label={`Reject review item ${item.id}`} className="console-action console-action-danger" disabled={active} onClick={() => void runReviewAction("reject")} type="button">
          Reject
        </button>
        <button aria-label={`Defer review item ${item.id}`} className="console-action" disabled={active} onClick={() => void runReviewAction("defer")} type="button">
          Defer
        </button>
        <button aria-label={`Edit then promote review item ${item.id}`} className="console-action" disabled={active} onClick={() => void runReviewAction("edit_then_promote")} type="button">
          Edit then promote
        </button>
        <button aria-label={`Promote review item ${item.id}`} className="console-action" disabled={active} onClick={() => void runPromote()} type="button">
          Promote
        </button>
      </div>
    </section>
  );
}

interface ReviewMutationError {
  readonly action: ConsoleApiAction;
  readonly code?: ConsoleApiErrorCode;
  readonly message: string;
  readonly statusCode?: number;
}

type ReviewMutationState =
  | { readonly status: "idle" }
  | { readonly status: "submitting"; readonly actionLabel: string }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly error: ReviewMutationError };

export function ReviewMutationAlert({ state }: { readonly state: ReviewMutationState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "submitting") {
    return <p className="mutation-status" aria-live="polite">Submitting {state.actionLabel} action...</p>;
  }

  if (state.status === "success") {
    return <p className="mutation-status mutation-status-success" aria-live="polite">{state.message}</p>;
  }

  const unavailable = state.error.statusCode === 501 || state.error.code === "unavailable";
  return (
    <div className="mutation-status mutation-status-error" role="alert">
      <strong>{unavailable ? "Action unavailable" : "Action failed"}</strong>
      <p>
        {state.error.action} returned {state.error.statusCode ?? "an API error"}{state.error.code ? ` (${state.error.code})` : ""}: {state.error.message}
      </p>
    </div>
  );
}

function reviewActionLabel(action: "reject" | "defer" | "edit_then_promote"): string {
  if (action === "edit_then_promote") {
    return "Edit then promote";
  }
  return action === "reject" ? "Reject" : "Defer";
}

function evidenceFromFields(type: MemoryVerificationEvidence["type"], value: string, note: string): readonly MemoryVerificationEvidence[] {
  const evidenceValue = value.trim();
  if (!evidenceValue) {
    return [];
  }
  const evidenceNote = note.trim();
  return [{ type, value: evidenceValue, ...(evidenceNote ? { note: evidenceNote } : {}) }];
}

function tagsFromInput(value: string): readonly string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
}

function localMutationError(action: ConsoleApiAction, code: ConsoleApiErrorCode, message: string): ReviewMutationError {
  return { action, code, message, statusCode: 400 };
}

function mutationErrorFromUnknown(error: unknown, fallbackAction: ConsoleApiAction): ReviewMutationError {
  if (error instanceof ConsoleApiRequestError) {
    return {
      action: error.action ?? fallbackAction,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  return {
    action: fallbackAction,
    message: error instanceof Error ? error.message : "Memory console request failed.",
  };
}

function assistSuggestionKey(suggestion: ReviewAssistSuggestion): string {
  return `${suggestion.kind}:${suggestion.suggestedAction}:${suggestion.relatedMemoryIds.join(",")}:${suggestion.rationale}`;
}

const graphNodeTypes = ["memory", "source", "tag", "evidence"] as const satisfies readonly MemoryGraphNodeType[];
const graphEdgeTypes = ["has_source", "tagged_with", "has_evidence", "reviewed_as", "related_memory"] as const satisfies readonly MemoryGraphEdgeType[];
const graphEdgeFilterTypes = ["all", ...graphEdgeTypes] as const;
const graphNodeX: Record<MemoryGraphNodeType, number> = {
  memory: 72,
  source: 284,
  tag: 496,
  evidence: 708,
};
const graphNodeRadius: Record<MemoryGraphNodeType, number> = {
  memory: 14,
  source: 11,
  tag: 10,
  evidence: 10,
};
const graphLayoutTop = 44;
const graphLayoutStep = 58;
const graphCanvasWidth = 792;

interface GraphLayoutNode {
  readonly node: MemoryGraphNode;
  readonly x: number;
  readonly y: number;
}

function GraphSummary({ data, routeState }: { readonly data: ConsoleGraphLoadResult; readonly routeState: ConsoleRouteState }) {
  const edgeType = data.filters.graphEdgeType ?? "all";
  const visibleEdges = edgeType === "all" ? data.graph.edges : data.graph.edges.filter((edge) => edge.type === edgeType);
  const layoutNodes = graphLayoutNodes(data.graph.nodes);
  const layoutNodeMap = new Map(layoutNodes.map((layoutNode) => [layoutNode.node.id, layoutNode]));
  const visibleLayoutEdges = visibleEdges.filter((edge) => layoutNodeMap.has(edge.source) && layoutNodeMap.has(edge.target));
  const dense = data.graph.nodes.length > 24 || visibleEdges.length > 36;
  const svgHeight = Math.max(220, graphLayoutTop * 2 + Math.max(0, ...layoutNodes.map((layoutNode) => layoutNode.y)));

  return (
    <div className="route-stack">
      <div className="section-heading">
        <h2 id="route-title">Graph</h2>
        <p>Read-only projection of canonical memory metadata. Node links only change selection or open Browse detail.</p>
      </div>
      <section className="status-strip graph-summary" aria-live="polite">
        <strong>{data.graph.nodes.length}</strong> nodes, <strong>{visibleEdges.length}</strong> visible edges{visibleEdges.length === data.graph.edges.length ? "" : ` from ${data.graph.edges.length} total`}, and <strong>{data.graph.warnings.length}</strong> warnings. Refreshed {formatTimestamp(data.refreshedAt)}.
      </section>
      <GraphEdgeFilterLinks activeEdgeType={edgeType} routeState={routeState} />
      {dense ? <p className="graph-fallback-note">Dense graph: use the node and edge lists below as the primary readable fallback.</p> : null}
      {data.graph.nodes.length === 0 ? (
        <section className="graph-empty" aria-label="Empty graph state" aria-live="polite">
          <h3>No graph nodes</h3>
          <p>No memory graph data matched the current route filters.</p>
        </section>
      ) : (
        <section className="graph-inspector" aria-label="Read-only memory graph projection">
          <div className="graph-canvas-frame" aria-hidden={dense ? "true" : undefined}>
            <svg className="graph-canvas" role="img" aria-labelledby="graph-canvas-title graph-canvas-description" viewBox={`0 0 ${graphCanvasWidth} ${svgHeight}`}>
              <title id="graph-canvas-title">Memory graph layout</title>
              <desc id="graph-canvas-description">Deterministic column layout by memory, source, tag, and evidence node type.</desc>
              {visibleLayoutEdges.map((edge) => {
                const source = layoutNodeMap.get(edge.source);
                const target = layoutNodeMap.get(edge.target);
                if (!source || !target) {
                  return null;
                }
                const loop = edge.source === edge.target;
                return loop ? (
                  <path className="graph-edge graph-edge-loop" d={`M ${source.x + 15} ${source.y - 12} C ${source.x + 64} ${source.y - 54}, ${source.x + 92} ${source.y + 38}, ${source.x + 18} ${source.y + 14}`} key={edge.id} />
                ) : (
                  <line className="graph-edge" key={edge.id} x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
                );
              })}
              {layoutNodes.map((layoutNode) => {
                const selected = data.selectedGraphNode?.id === layoutNode.node.id;
                return (
                  <a aria-label={`Select graph node ${layoutNode.node.label}`} href={graphNodeHref(routeState.searchParams, layoutNode.node.id)} key={layoutNode.node.id}>
                    <g className={cn("graph-node", `graph-node-${layoutNode.node.type}`, selected && "graph-node-selected")}>
                      <circle cx={layoutNode.x} cy={layoutNode.y} r={graphNodeRadius[layoutNode.node.type]} />
                      <text x={layoutNode.x + 20} y={layoutNode.y + 4}>{truncateGraphLabel(layoutNode.node.label)}</text>
                    </g>
                  </a>
                );
              })}
            </svg>
          </div>
          <GraphNodeDetail node={data.selectedGraphNode} routeState={routeState} />
        </section>
      )}
      <GraphWarnings warnings={data.graph.warnings} />
      <section className="graph-text-grid" aria-label="Accessible graph text fallback">
        <GraphNodeDirectory nodes={data.graph.nodes} selectedNode={data.selectedGraphNode} routeState={routeState} />
        <GraphEdgeDirectory edges={visibleEdges} totalEdgeCount={data.graph.edges.length} />
      </section>
    </div>
  );
}

function GraphEdgeFilterLinks({ activeEdgeType, routeState }: { readonly activeEdgeType: "all" | MemoryGraphEdgeType; readonly routeState: ConsoleRouteState }) {
  return (
    <nav className="graph-filter-links" aria-label="Graph edge type shortcuts">
      {graphEdgeFilterTypes.map((edgeType) => {
        const href = graphEdgeHref(routeState.searchParams, edgeType);
        return (
          <a aria-current={activeEdgeType === edgeType ? "true" : undefined} className={cn("graph-filter-link", activeEdgeType === edgeType && "graph-filter-link-active")} href={href} key={edgeType}>
            {edgeType}
          </a>
        );
      })}
    </nav>
  );
}

function GraphNodeDetail({ node, routeState }: { readonly node?: MemoryGraphNode; readonly routeState: ConsoleRouteState }) {
  if (!node) {
    return (
      <aside className="details-panel graph-detail" aria-label="Graph node details">
        <h3>Select a graph node</h3>
        <p>Choose a memory, source, tag, or evidence node to inspect metadata. This view is read-only.</p>
      </aside>
    );
  }

  return (
    <aside className="details-panel graph-detail" aria-label="Graph node details">
      <div className="detail-header">
        <div>
          <h3>{node.label}</h3>
          <p>{node.id}</p>
        </div>
        <span>{node.type}</span>
      </div>
      <dl className="detail-list detail-list-compact">
        <DetailItem label="Type" value={node.type} />
        <DetailItem label="Label" value={node.label} />
        {node.memoryId ? <DetailItem label="Memory" value={node.memoryId} /> : null}
      </dl>
      {node.memoryId ? <a className="console-action graph-detail-link" href={graphMemoryBrowseHref(routeState.searchParams, node.memoryId)}>Open browse detail</a> : null}
      <GraphMetadata metadata={node.metadata} />
    </aside>
  );
}

function GraphMetadata({ metadata }: { readonly metadata: MemoryGraphNode["metadata"] }) {
  const entries = Object.entries(metadata ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return (
    <section className="detail-section">
      <h4>Metadata</h4>
      {entries.length === 0 ? <p>No metadata recorded for this node.</p> : null}
      {entries.length > 0 ? (
        <dl className="detail-list detail-list-compact">
          {entries.map(([key, value]) => <DetailItem key={key} label={key} value={String(value)} />)}
        </dl>
      ) : null}
    </section>
  );
}

function GraphWarnings({ warnings }: { readonly warnings: readonly MemoryGraphWarning[] }) {
  return (
    <section className="graph-warning-panel" aria-label="Graph warnings">
      <h3>Warnings</h3>
      {warnings.length === 0 ? <p>No graph projection warnings.</p> : null}
      {warnings.length > 0 ? (
        <ul>
          {warnings.map((warning) => (
            <li key={`${warning.memoryId}:${warning.relatedMemoryId}:${warning.relationSource}:${warning.relationType}`}>
              <strong>{warning.type}</strong>: {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function GraphNodeDirectory({ nodes, selectedNode, routeState }: { readonly nodes: readonly MemoryGraphNode[]; readonly selectedNode?: MemoryGraphNode; readonly routeState: ConsoleRouteState }) {
  return (
    <section className="graph-directory" aria-label="Graph nodes by type">
      <h3>Nodes</h3>
      {graphNodeTypes.map((type) => {
        const nodesByType = nodes.filter((node) => node.type === type);
        return (
          <section className="graph-directory-group" key={type}>
            <h4>{type} ({nodesByType.length})</h4>
            {nodesByType.length === 0 ? <p>No {type} nodes in the current graph.</p> : null}
            {nodesByType.map((node) => (
              <a className={cn("memory-row", selectedNode?.id === node.id && "memory-row-active")} href={graphNodeHref(routeState.searchParams, node.id)} key={node.id}>
                <span className="row-title">{node.label}</span>
                <span className="row-meta">{node.id}</span>
              </a>
            ))}
          </section>
        );
      })}
    </section>
  );
}

function GraphEdgeDirectory({ edges, totalEdgeCount }: { readonly edges: readonly MemoryGraphEdge[]; readonly totalEdgeCount: number }) {
  return (
    <section className="graph-directory" aria-label="Graph edges by type">
      <h3>Edges</h3>
      {edges.length !== totalEdgeCount ? <p>Showing {edges.length} of {totalEdgeCount} total edges because an edge type filter is active.</p> : null}
      {graphEdgeTypes.map((type) => {
        const edgesByType = edges.filter((edge) => edge.type === type);
        return (
          <section className="graph-directory-group" key={type}>
            <h4>{type} ({edgesByType.length})</h4>
            {edgesByType.length === 0 ? <p>No {type} edges with the current filters.</p> : null}
            {edgesByType.map((edge) => (
              <div className="graph-edge-row" key={edge.id}>
                <strong>{edge.source}</strong>
                <span>{edge.label ?? edge.type}</span>
                <strong>{edge.target}</strong>
              </div>
            ))}
          </section>
        );
      })}
    </section>
  );
}

function graphLayoutNodes(nodes: readonly MemoryGraphNode[]): readonly GraphLayoutNode[] {
  return graphNodeTypes.flatMap((type) => nodes
    .filter((node) => node.type === type)
    .map((node, index) => ({ node, x: graphNodeX[type], y: graphLayoutTop + index * graphLayoutStep })));
}

function graphNodeHref(currentParams: URLSearchParams, nodeId: string): string {
  const params = new URLSearchParams(currentParams);
  params.set("id", nodeId);
  return pathWithSearch("/graph", params);
}

function graphEdgeHref(currentParams: URLSearchParams, edgeType: "all" | MemoryGraphEdgeType): string {
  const params = new URLSearchParams(currentParams);
  if (edgeType === "all") {
    params.delete("edgeType");
  } else {
    params.set("edgeType", edgeType);
  }
  return pathWithSearch("/graph", params);
}

function graphMemoryBrowseHref(currentParams: URLSearchParams, memoryId: string): string {
  const params = new URLSearchParams(currentParams);
  params.delete("edgeType");
  params.set("id", memoryId);
  return pathWithSearch("/", params);
}

function truncateGraphLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

function Badge({ label, tone }: { readonly label: string; readonly tone: string }) {
  return <span className={cn("badge", `badge-${tone}`)}>{label}</span>;
}

function formatScopeIdentity(memory: Pick<ConsoleMemory, "scope" | "projectId" | "containerId">): string {
  if (memory.scope === "project") {
    return memory.projectId && memory.containerId ? `project · ${memory.projectId} / ${memory.containerId}` : "project · incomplete scope";
  }

  return memory.scope ?? "unknown scope";
}

function isRouteDataEmpty(data: ConsoleRouteData, routeState: ConsoleRouteState): boolean {
  if (routeState.path === "/rejected") {
    return false;
  }

  if (isGraphLoadResult(data)) {
    return data.graph.nodes.length === 0;
  }
  if (isReviewLoadResult(data)) {
    return data.reviewItems.length === 0;
  }
  return data.filters.view === "projects" ? data.projectScopes.length === 0 : data.memories.length === 0;
}

function isReviewLoadResult(data: ConsoleRouteData): data is ConsoleReviewLoadResult {
  return "reviewItems" in data;
}

function isGraphLoadResult(data: ConsoleRouteData): data is ConsoleGraphLoadResult {
  return "graph" in data;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
