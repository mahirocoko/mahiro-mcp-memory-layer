import {
  consoleGraphEdgeTypeFilters,
  filtersToSearchParams,
  consoleKindFilters,
  consoleReviewStatusFilters,
  consoleScopeFilters,
  consoleVerificationStatusFilters,
} from "./filters.js";
import type {
  ConsoleFilterState,
  ConsoleGraphLoadResult,
  ConsoleKindFilter,
  ConsoleLoadResult,
  ConsoleMemory,
  ConsoleNavigationView,
  ConsoleProjectScopeSummary,
  ConsolePurgeRejectedActionInput,
  ConsolePurgeRejectedActionResult,
  ConsoleReviewLoadResult,
  ConsoleReviewStatusFilter,
  ConsoleScopeFilter,
  ConsoleVerificationStatusFilter,
  MemoryGraphEdge,
  MemoryGraphEdgeType,
  MemoryGraphNode,
  MemoryGraphNodeType,
  MemoryGraphWarning,
} from "./types.js";
import type { MemoryReviewHint, ReviewAssistResult, ReviewAssistSuggestion, ReviewQueueOverviewItem } from "../memory/types.js";

const graphNodeTypes = ["memory", "source", "tag", "evidence"] as const satisfies readonly MemoryGraphNodeType[];
const graphEdgeTypes = ["has_source", "tagged_with", "has_evidence", "reviewed_as", "related_memory"] as const satisfies readonly MemoryGraphEdgeType[];

export function renderMemoryConsolePage(result: ConsoleLoadResult): string {
  const title = "Local memory console";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>Read-only localhost introspection for stored memory records.</p>
      </div>
      <a class="refresh" href="/?${escapeAttribute(filtersToSearchParams(result.filters).toString())}">Refresh</a>
    </header>
    ${renderNavigation(result.filters)}
    ${result.filters.view === "projects" ? renderProjectsView(result) : renderMemoryExplorer(result)}
  </main>
</body>
</html>`;
}

export function renderEmptyConsolePage(filters: ConsoleFilterState, message: string): string {
  return renderMemoryConsolePage({
    filters,
    memories: [],
    projectScopes: [],
    fetchedCount: 0,
    fetchMode: "list",
    degraded: false,
    refreshedAt: message,
  });
}

export function renderReviewConsolePage(result: ConsoleReviewLoadResult): string {
  const title = "Local memory console";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>Review pending memory records with explicit POST-only decisions.</p>
      </div>
      <a class="refresh" href="/review?${escapeAttribute(filtersToSearchParams(result.filters).toString())}">Refresh</a>
    </header>
    ${renderNavigation(result.filters)}
    <section class="status" aria-live="polite">
      <strong>${escapeHtml(String(result.reviewItems.length))}</strong> review queue item${result.reviewItems.length === 1 ? "" : "s"} · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="console-grid review-grid">
      ${renderReviewQueueList(result.reviewItems, result.filters, result.selectedReviewItem)}
      ${renderReviewDetailsPane(result.selectedReviewItem, result.reviewAssist)}
    </section>
  </main>
</body>
</html>`;
}

export function renderRejectedConsolePage(result: ConsoleLoadResult): string {
  const title = "Local memory console";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>Rejected memory quarantine. Preview purge candidates first; deletion requires exact typed confirmation.</p>
      </div>
      <a class="refresh" href="/rejected?${escapeAttribute(filtersToSearchParams(result.filters).toString())}">Refresh</a>
    </header>
    ${renderNavigation(result.filters)}
    <section class="status quarantine-status" aria-live="polite">
      <strong>${escapeHtml(String(result.memories.length))}</strong> rejected record${result.memories.length === 1 ? "" : "s"} shown from ${escapeHtml(String(result.fetchedCount))} fetched by ${escapeHtml(result.fetchMode)}${result.degraded ? " · degraded search" : ""} · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="quarantine-copy" aria-label="Rejected quarantine safety notice">
      <h2>Quarantine review</h2>
      <p>Only records with <strong>reviewStatus rejected</strong> belong here. Browse and review decision controls are intentionally absent; purge starts with a dry-run preview and the final POST requires typing <strong>DELETE REJECTED</strong>.</p>
    </section>
    <section class="console-grid rejected-grid">
      ${renderRejectedQuarantineList(result.memories, result.filters, result.selectedMemory)}
      ${renderRejectedDetailsPane(result.selectedMemory)}
    </section>
  </main>
</body>
</html>`;
}

export function renderGraphConsolePage(result: ConsoleGraphLoadResult): string {
  const title = "Memory graph";
  const edgeType = result.filters.graphEdgeType ?? "all";
  const visibleEdges = edgeType === "all"
    ? result.graph.edges
    : result.graph.edges.filter((edge) => edge.type === edgeType);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>Read-only projection of canonical memory metadata. Filters and node selection use GET links only.</p>
      </div>
      <a class="refresh" href="/graph?${escapeAttribute(filtersToSearchParams(result.filters).toString())}">Refresh</a>
    </header>
    ${renderNavigation(result.filters)}
    ${renderGraphFilters(result.filters)}
    ${renderGraphSummary(result, visibleEdges)}
    ${renderGraphWarnings(result.graph.warnings)}
    <section class="graph-layout">
      <div class="graph-main">
        ${renderGraphNodeGroups(result.graph.nodes, result.filters, result.selectedGraphNode)}
        ${renderGraphEdgeGroups(visibleEdges, result.graph.edges.length)}
      </div>
      ${renderGraphDetailsPane(result.selectedGraphNode)}
    </section>
  </main>
</body>
</html>`;
}

export function renderPurgeRejectedResultPage(
  filters: ConsoleFilterState,
  input: ConsolePurgeRejectedActionInput,
  result: ConsolePurgeRejectedActionResult,
): string {
  const title = result.dryRun ? "Rejected purge preview" : "Rejected purge result";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${result.dryRun ? "Dry-run preview only. No records were deleted." : "Final purge completed with per-record outcomes."}</p>
      </div>
      <a class="refresh" href="/rejected?${escapeAttribute(filtersToSearchParams(filters).toString())}">Back to rejected quarantine</a>
    </header>
    ${renderNavigation({ ...filters, view: "firehose", reviewStatus: "rejected", verificationStatus: "all" })}
    <section class="quarantine-copy" aria-label="Purge result summary">
      <h2>${result.dryRun ? "Preview outcomes" : "Purge outcomes"}</h2>
      <p>Scope: <strong>${escapeHtml(input.scope)}</strong>${input.scope === "project" ? ` · Project: <strong>${escapeHtml(input.projectId ?? "")}</strong> · Container: <strong>${escapeHtml(input.containerId ?? "")}</strong>` : ""}</p>
      <p>${escapeHtml(String(result.outcomes.length))} id${result.outcomes.length === 1 ? "" : "s"} checked · ${escapeHtml(String(result.deletedRecords.length))} deleted · ${escapeHtml(String(result.missingIds.length))} missing.</p>
    </section>
    <section class="details purge-results" aria-label="Per-id purge results">
      <h2>Per-id status</h2>
      ${renderPurgeOutcomeList(result)}
      ${result.dryRun ? renderFinalPurgeConfirmationForm(input) : ""}
    </section>
  </main>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNavigation(filters: ConsoleFilterState): string {
  const links = [
    renderNavigationLink("Browse", "/", isActiveNavigation(filters, "verified")),
    renderNavigationLink("Review Queue", "/review", isActiveNavigation(filters, "inbox")),
    renderNavigationLink("Rejected", "/rejected", isActiveNavigation(filters, "firehose")),
    renderNavigationLink("Graph", "/graph", isActiveNavigation(filters, "projects")),
  ];

  return `<nav class="nav" aria-label="Memory console navigation">${links.join("")}</nav>`;
}

function renderNavigationLink(label: string, href: string, active: boolean): string {
  const activeClass = active ? " active" : "";
  const currentAttribute = active ? " aria-current=\"page\"" : "";
  return `<a class="nav-link${activeClass}" href="${href}"${currentAttribute}>${escapeHtml(label)}</a>`;
}

function isActiveNavigation(filters: ConsoleFilterState, view: ConsoleNavigationView): boolean {
  return filters.view === view;
}

function renderMemoryExplorer(result: ConsoleLoadResult): string {
  return `${renderFilters(result.filters)}
    <section class="status" aria-live="polite">
      <strong>${escapeHtml(String(result.memories.length))}</strong> shown from ${escapeHtml(String(result.fetchedCount))} fetched by ${escapeHtml(result.fetchMode)}${result.degraded ? " · degraded search" : ""} · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="console-grid">
      ${renderMemoryList(result.memories, result.filters, result.selectedMemory)}
      ${renderDetailsPane(result.selectedMemory)}
    </section>`;
}

function renderReviewQueueList(
  reviewItems: readonly ReviewQueueOverviewItem[],
  filters: ConsoleFilterState,
  selectedReviewItem: ReviewQueueOverviewItem | undefined,
): string {
  if (reviewItems.length === 0) {
    return `<section class="list-panel"><p class="empty">No review queue items matched the current scope.</p></section>`;
  }

  const items = reviewItems.map((item) => {
    const params = filtersToSearchParams(filters, item.id);
    const activeClass = selectedReviewItem?.id === item.id ? " active" : "";
    return `<a class="memory-row review-row${activeClass}" href="/review?${escapeAttribute(params.toString())}">
      <span class="row-title">${escapeHtml(item.summary ?? item.content)}</span>
      <span class="row-meta">${escapeHtml(item.kind)} · ${escapeHtml(item.scope)} · priority ${escapeHtml(item.priorityScore.toFixed(2))}</span>
      <span class="signal-badges">${renderBadge(item.verificationStatus, `verification-${item.verificationStatus}`)}${renderBadge(item.reviewStatus ?? "unreviewed", `review-${item.reviewStatus ?? "unreviewed"}`)}</span>
      ${item.priorityReasons.length > 0 ? `<span class="review-reasons">${item.priorityReasons.map(escapeHtml).join(" · ")}</span>` : ""}
      ${item.hints.length > 0 ? `<span class="review-reasons">Hints: ${item.hints.map((hint) => escapeHtml(hint.type)).join(" · ")}</span>` : ""}
    </a>`;
  });

  return `<section class="list-panel" aria-label="Review queue">${items.join("")}</section>`;
}

function renderReviewDetailsPane(
  item: ReviewQueueOverviewItem | undefined,
  assist: ReviewAssistResult | undefined,
): string {
  if (!item) {
    return `<aside class="details"><p class="empty">Select a review queue item to inspect hints and submit an explicit decision.</p></aside>`;
  }

  return `<aside class="details" aria-label="Review details">
    <h2>Review details</h2>
    <div class="signal-badges detail-badges">${renderBadge(item.verificationStatus, `verification-${item.verificationStatus}`)}${renderBadge(item.reviewStatus ?? "unreviewed", `review-${item.reviewStatus ?? "unreviewed"}`)}</div>
    ${item.summary ? `<section class="detail-section summary-section"><h3>Summary</h3><p>${escapeHtml(item.summary)}</p></section>` : ""}
    <section class="detail-section content-section">
      <h3>Content</h3>
      <p>${escapeHtml(item.content)}</p>
    </section>
    <details class="technical-details" open>
      <summary>Priority and metadata</summary>
      <dl class="meta-grid compact">
        ${renderDetail("ID", item.id)}
        ${renderDetail("Kind", item.kind)}
        ${renderDetail("Scope", item.scope)}
        ${renderDetail("Priority", item.priorityScore.toFixed(2))}
        ${renderDetail("Verification", item.verificationStatus)}
        ${renderDetail("Review", item.reviewStatus ?? "none")}
        ${renderDetail("Importance", item.importance.toFixed(2))}
        ${renderDetail("Created", item.createdAt)}
        ${item.updatedAt ? renderDetail("Updated", item.updatedAt) : ""}
      </dl>
    </details>
    ${item.priorityReasons.length > 0 ? renderStringList("Priority reasons", item.priorityReasons) : ""}
    ${renderReviewHints(item.hints)}
    ${item.tags.length > 0 ? renderStringList("Tags", item.tags) : ""}
    <section class="detail-section">
      <h3>Source</h3>
      <dl class="meta-grid compact">
        ${renderDetail("Type", item.source.type)}
        ${item.source.uri ? renderDetail("URI", item.source.uri) : ""}
        ${item.source.title ? renderDetail("Title", item.source.title) : ""}
      </dl>
    </section>
    ${renderReviewDecisions(item.reviewDecisions)}
    ${renderReviewAssist(assist)}
    ${renderReviewActionForms(item)}
  </aside>`;
}

function renderReviewHints(hints: readonly MemoryReviewHint[]): string {
  if (hints.length === 0) {
    return `<section class="detail-section"><h3>Review hints</h3><p class="empty">No duplicate, contradiction, or supersession hints were found.</p></section>`;
  }

  const items = hints.map((hint) => `<li><strong>${escapeHtml(hint.type)}</strong>: ${escapeHtml(hint.note)}${hint.relatedMemoryIds.length > 0 ? ` <span class="compact-evidence">Related: ${hint.relatedMemoryIds.map(escapeHtml).join(", ")}</span>` : ""}</li>`);
  return `<section class="detail-section"><h3>Review hints</h3><ul>${items.join("")}</ul></section>`;
}

function renderReviewAssist(assist: ReviewAssistResult | undefined): string {
  if (!assist || assist.suggestions.length === 0) {
    return `<section class="detail-section"><h3>Review assist</h3><p class="empty">No assist suggestions are available. Assist text is advisory only and never changes records automatically.</p></section>`;
  }

  const suggestions = assist.suggestions.map(renderReviewAssistSuggestion);
  return `<section class="detail-section assist-section"><h3>Review assist</h3><p class="empty">Advisory only. Suggestions are not selected, applied, or submitted automatically.</p><ul>${suggestions.join("")}</ul></section>`;
}

function renderReviewAssistSuggestion(suggestion: ReviewAssistSuggestion): string {
  return `<li>
    <strong>${escapeHtml(suggestion.kind)}</strong>: ${escapeHtml(suggestion.rationale)}
    <span class="compact-evidence">Suggested next step: ${escapeHtml(suggestion.suggestedAction)}</span>
    ${suggestion.relatedMemoryIds.length > 0 ? `<span class="compact-evidence">Related: ${suggestion.relatedMemoryIds.map(escapeHtml).join(", ")}</span>` : ""}
    ${suggestion.draftContent ? `<p>${escapeHtml(suggestion.draftContent)}</p>` : ""}
  </li>`;
}

function renderReviewActionForms(item: ReviewQueueOverviewItem): string {
  return `<section class="detail-section review-actions" aria-label="Review actions">
    <h3>Review decision</h3>
    ${renderSimpleReviewForm(item.id, "reject", "Reject")}
    ${renderSimpleReviewForm(item.id, "defer", "Defer")}
    ${renderEditThenPromoteForm(item)}
    ${item.verificationStatus !== "verified" ? renderPromoteForm(item.id) : ""}
  </section>`;
}

function renderSimpleReviewForm(id: string, action: "reject" | "defer", label: string): string {
  return `<form class="action-form" method="post" action="/actions/review">
      <input type="hidden" name="id" value="${escapeAttribute(id)}">
      <input type="hidden" name="action" value="${escapeAttribute(action)}">
      <label><span>${escapeHtml(label)} note</span><input name="note" placeholder="Optional reviewer note"></label>
      <button type="submit">${escapeHtml(label)}</button>
    </form>`;
}

function renderEditThenPromoteForm(item: ReviewQueueOverviewItem): string {
  return `<form class="action-form stacked" method="post" action="/actions/review">
      <input type="hidden" name="id" value="${escapeAttribute(item.id)}">
      <input type="hidden" name="action" value="edit_then_promote">
      <label><span>Content</span><textarea name="content" rows="5">${escapeHtml(item.content)}</textarea></label>
      <label><span>Summary</span><input name="summary" value="${escapeAttribute(item.summary ?? "")}" placeholder="Optional summary"></label>
      <label><span>Tags</span><input name="tags" value="${escapeAttribute(item.tags.join(", "))}" placeholder="comma separated"></label>
      <label><span>Decision note</span><input name="note" placeholder="Optional reviewer note"></label>
      ${renderEvidenceFields(true)}
      <button type="submit">Edit then promote</button>
    </form>`;
}

function renderPromoteForm(id: string): string {
  return `<form class="action-form stacked" method="post" action="/actions/promote">
      <input type="hidden" name="id" value="${escapeAttribute(id)}">
      ${renderEvidenceFields(true)}
      <button type="submit">Promote</button>
    </form>`;
}

function renderEvidenceFields(required: boolean): string {
  const requiredAttribute = required ? " required" : "";
  return `<div class="evidence-grid">
      <label><span>Evidence type</span>${renderSelect("evidenceType", ["human", "test", "trace", "issue", "link"], "human", formatPlainLabel)}</label>
      <label><span>Evidence value</span><input name="evidenceValue"${requiredAttribute} placeholder="Required for promotion"></label>
      <label><span>Evidence note</span><input name="evidenceNote" placeholder="Optional note"></label>
    </div>`;
}

function renderProjectsView(result: ConsoleLoadResult): string {
  if (result.projectScopes.length === 0) {
    return `<section class="status" aria-live="polite">
      <strong>0</strong> project/container scopes discovered from canonical records · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="projects-panel"><p class="empty">No complete project/container scopes were found.</p></section>`;
  }

  const rows = result.projectScopes.map((projectScope) => renderProjectScopeRow(projectScope, result.filters));
  return `<section class="status" aria-live="polite">
      <strong>${escapeHtml(String(result.projectScopes.length))}</strong> project/container scope${result.projectScopes.length === 1 ? "" : "s"} discovered from canonical records · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="projects-panel" aria-label="Project and container scopes">
      ${rows.join("")}
    </section>`;
}

function renderRejectedQuarantineList(
  memories: readonly ConsoleMemory[],
  filters: ConsoleFilterState,
  selectedMemory: ConsoleMemory | undefined,
): string {
  if (memories.length === 0) {
    return `<section class="list-panel"><p class="empty">No rejected memories matched the current quarantine filters.</p></section>`;
  }

  const rows = memories.map((memory) => renderRejectedQuarantineRow(memory, filters, selectedMemory));
  return `<form class="list-panel quarantine-form" method="post" action="/actions/purge-rejected" aria-label="Preview rejected memory purge">
    <input type="hidden" name="dryRun" value="true">
    ${renderPurgeScopeInputs(filters)}
    <div class="quarantine-form-header">
      <h2>Rejected records</h2>
      <p>Select one or more rejected ids, then preview the purge result before any deletion can run.</p>
    </div>
    <div class="quarantine-rows">${rows.join("")}</div>
    <div class="quarantine-actions">
      <button type="submit">Preview purge</button>
      <span class="empty">Final deletion is blocked until the preview page receives DELETE REJECTED.</span>
    </div>
  </form>`;
}

function renderRejectedQuarantineRow(
  memory: ConsoleMemory,
  filters: ConsoleFilterState,
  selectedMemory: ConsoleMemory | undefined,
): string {
  const params = filtersToSearchParams(filters, memory.id);
  const activeClass = selectedMemory?.id === memory.id ? " active" : "";
  const summary = memory.summary ?? memory.content;
  return `<div class="memory-row rejected-row${activeClass}">
    <label class="checkbox-row">
      <input type="checkbox" name="ids" value="${escapeAttribute(memory.id)}">
      <span>
        <span class="row-title">${escapeHtml(summary)}</span>
        <span class="row-meta">${escapeHtml(memory.kind)} · ${escapeHtml(memory.scope ?? "unknown scope")} · ${escapeHtml(memory.id)}</span>
      </span>
    </label>
    <span class="signal-badges">${renderStatusBadges(memory)}</span>
    <a class="inspect-link" href="/rejected?${escapeAttribute(params.toString())}">Inspect</a>
  </div>`;
}

function renderRejectedDetailsPane(memory: ConsoleMemory | undefined): string {
  if (!memory) {
    return `<aside class="details"><p class="empty">Select a rejected memory to inspect quarantine metadata before previewing a purge.</p></aside>`;
  }

  return `<aside class="details" aria-label="Rejected memory details">
    <h2>Quarantine details</h2>
    <div class="signal-badges detail-badges">${renderStatusBadges(memory)}</div>
    ${memory.summary ? `<section class="detail-section summary-section"><h3>Summary</h3><p>${escapeHtml(memory.summary)}</p></section>` : ""}
    <section class="detail-section content-section"><h3>Content</h3><p>${escapeHtml(memory.content)}</p></section>
    <details class="technical-details" open>
      <summary>Quarantine metadata</summary>
      <dl class="meta-grid compact">
        ${renderDetail("ID", memory.id)}
        ${renderDetail("Kind", memory.kind)}
        ${renderDetail("Scope", memory.scope ?? "search result")}
        ${renderDetail("Verification", memory.verificationStatus)}
        ${renderDetail("Review", memory.reviewStatus ?? "none")}
        ${renderDetail("Importance", memory.importance.toFixed(2))}
        ${renderDetail("Created", memory.createdAt)}
        ${memory.updatedAt ? renderDetail("Updated", memory.updatedAt) : ""}
        ${memory.projectId ? renderDetail("Project", memory.projectId) : ""}
        ${memory.containerId ? renderDetail("Container", memory.containerId) : ""}
      </dl>
    </details>
    ${memory.tags.length > 0 ? renderStringList("Tags", memory.tags) : ""}
    <section class="detail-section"><h3>Source</h3><dl class="meta-grid compact">
      ${renderDetail("Type", memory.source.type)}
      ${memory.source.uri ? renderDetail("URI", memory.source.uri) : ""}
      ${memory.source.title ? renderDetail("Title", memory.source.title) : ""}
    </dl></section>
    ${renderReviewDecisions(memory.reviewDecisions)}
  </aside>`;
}

function renderPurgeScopeInputs(filters: ConsoleFilterState): string {
  if (filters.scope === "global") {
    return `<input type="hidden" name="scope" value="global">`;
  }

  if (filters.scope === "project" && filters.projectId && filters.containerId) {
    return `<input type="hidden" name="scope" value="project">
      <input type="hidden" name="projectId" value="${escapeAttribute(filters.projectId)}">
      <input type="hidden" name="containerId" value="${escapeAttribute(filters.containerId)}">`;
  }

  return `<div class="purge-scope-grid">
    <label><span>Purge scope</span>${renderSelect("scope", ["global", "project"], "global", formatPlainLabel)}</label>
    <label><span>Project ID for project scope</span><input name="projectId" value="${escapeAttribute(filters.projectId ?? "")}" placeholder="required for project scope"></label>
    <label><span>Container ID for project scope</span><input name="containerId" value="${escapeAttribute(filters.containerId ?? "")}" placeholder="required for project scope"></label>
  </div>`;
}

function renderPurgeOutcomeList(result: ConsolePurgeRejectedActionResult): string {
  if (result.outcomes.length === 0) {
    return `<p class="empty">No purge outcomes were returned.</p>`;
  }

  const outcomes = result.outcomes.map((outcome) => `<li><strong>${escapeHtml(outcome.id)}</strong> — ${renderBadge(outcome.status, `purge-${outcome.status}`)}</li>`);
  return `<ul class="purge-outcomes">${outcomes.join("")}</ul>`;
}

function renderFinalPurgeConfirmationForm(input: ConsolePurgeRejectedActionInput): string {
  const hiddenIds = input.ids.map((id) => `<input type="hidden" name="ids" value="${escapeAttribute(id)}">`).join("");
  return `<form class="action-form stacked final-purge-form" method="post" action="/actions/purge-rejected" aria-label="Final rejected purge confirmation">
    <h3>Final destructive confirmation</h3>
    <p class="empty">Type DELETE REJECTED exactly to delete records whose preview status is dry_run. Non-eligible ids remain skipped and are reported per id.</p>
    ${hiddenIds}
    <input type="hidden" name="scope" value="${escapeAttribute(input.scope)}">
    ${input.scope === "project" ? `<input type="hidden" name="projectId" value="${escapeAttribute(input.projectId ?? "")}"><input type="hidden" name="containerId" value="${escapeAttribute(input.containerId ?? "")}">` : ""}
    <label><span>Confirmation</span><input name="confirmation" autocomplete="off" placeholder="DELETE REJECTED" required></label>
    <button type="submit">Delete rejected records</button>
  </form>`;
}

function renderProjectScopeRow(projectScope: ConsoleProjectScopeSummary, filters: ConsoleFilterState): string {
  const params = filtersToSearchParams({
    ...filters,
    view: "verified",
    query: undefined,
    scope: "project",
    kind: "all",
    verificationStatus: "verified",
    reviewStatus: "active",
    projectId: projectScope.projectId,
    containerId: projectScope.containerId,
    selectedId: undefined,
  });

  return `<a class="project-row" href="/?${escapeAttribute(params.toString())}">
    <span class="project-title">${escapeHtml(projectScope.projectId)}</span>
    <span class="project-container">Container: ${escapeHtml(projectScope.containerId)}</span>
    <span class="project-meta">${escapeHtml(String(projectScope.totalCount))} memor${projectScope.totalCount === 1 ? "y" : "ies"}${projectScope.latestTimestamp ? ` · latest ${escapeHtml(projectScope.latestTimestamp)}` : ""}</span>
    ${renderProjectCounts(projectScope)}
  </a>`;
}

function renderProjectCounts(projectScope: ConsoleProjectScopeSummary): string {
  const countParts = [
    formatCountPart("fact", projectScope.kindCounts.fact),
    formatCountPart("conversation", projectScope.kindCounts.conversation),
    formatCountPart("decision", projectScope.kindCounts.decision),
    formatCountPart("doc", projectScope.kindCounts.doc),
    formatCountPart("task", projectScope.kindCounts.task),
    formatCountPart("hypothesis", projectScope.verificationStatusCounts.hypothesis),
    formatCountPart("verified", projectScope.verificationStatusCounts.verified),
    formatCountPart("unreviewed", projectScope.reviewStatusCounts.none),
    formatCountPart("pending", projectScope.reviewStatusCounts.pending),
    formatCountPart("deferred", projectScope.reviewStatusCounts.deferred),
    formatCountPart("rejected", projectScope.reviewStatusCounts.rejected),
  ].filter((part): part is string => part !== undefined);

  return countParts.length > 0 ? `<span class="count-breakdown">${countParts.map(escapeHtml).join(" · ")}</span>` : "";
}

function formatCountPart(label: string, count: number): string | undefined {
  return count > 0 ? `${label} ${count}` : undefined;
}

function renderGraphFilters(filters: ConsoleFilterState): string {
  return `<form class="filters graph-filters" method="get" action="/graph" aria-label="Graph filters">
    <div class="advanced-grid graph-filter-grid">
      ${renderEditableScopeFilters(filters)}
      <label>
        <span>Edge type</span>
        ${renderSelect("edgeType", consoleGraphEdgeTypeFilters, filters.graphEdgeType ?? "all", formatFilterLabel)}
      </label>
      <label>
        <span>Limit</span>
        ${renderSelect("limit", ["25", "50"], String(filters.limit) === "25" ? "25" : "50", (value) => value)}
      </label>
      <button type="submit">Apply filters</button>
    </div>
  </form>`;
}

function renderGraphSummary(result: ConsoleGraphLoadResult, visibleEdges: readonly MemoryGraphEdge[]): string {
  const nodeCounts = graphNodeTypes.map((type) => formatCountPart(type, countGraphNodes(result.graph.nodes, type))).filter((part): part is string => part !== undefined);
  const edgeCounts = graphEdgeTypes.map((type) => formatCountPart(type, countGraphEdges(visibleEdges, type))).filter((part): part is string => part !== undefined);
  const edgeSuffix = visibleEdges.length === result.graph.edges.length ? "" : ` shown from ${escapeHtml(String(result.graph.edges.length))} total`;

  return `<section class="status graph-summary" aria-live="polite">
    <strong>${escapeHtml(String(result.graph.nodes.length))}</strong> node${result.graph.nodes.length === 1 ? "" : "s"} · <strong>${escapeHtml(String(visibleEdges.length))}</strong> edge${visibleEdges.length === 1 ? "" : "s"}${edgeSuffix} · <strong>${escapeHtml(String(result.graph.warnings.length))}</strong> warning${result.graph.warnings.length === 1 ? "" : "s"} · refreshed ${escapeHtml(result.refreshedAt)}
    <span class="graph-counts">Nodes: ${nodeCounts.length > 0 ? nodeCounts.map(escapeHtml).join(" · ") : "none"}</span>
    <span class="graph-counts">Edges: ${edgeCounts.length > 0 ? edgeCounts.map(escapeHtml).join(" · ") : "none"}</span>
  </section>`;
}

function renderGraphWarnings(warnings: readonly MemoryGraphWarning[]): string {
  if (warnings.length === 0) {
    return `<section class="graph-warnings" aria-label="Graph warnings"><h2>Graph warnings</h2><p class="empty">No graph projection warnings.</p></section>`;
  }

  const items = warnings.map((warning) => `<li>
    <strong>${escapeHtml(warning.type)}</strong>: ${escapeHtml(warning.message)}
    <span class="compact-evidence">Source: ${escapeHtml(warning.relationSource)} · relation: ${escapeHtml(warning.relationType)} · missing id: ${escapeHtml(warning.relatedMemoryId)}</span>
  </li>`);
  return `<section class="graph-warnings" aria-label="Graph warnings"><h2>Graph warnings</h2><ul>${items.join("")}</ul></section>`;
}

function renderGraphNodeGroups(
  nodes: readonly MemoryGraphNode[],
  filters: ConsoleFilterState,
  selectedNode: MemoryGraphNode | undefined,
): string {
  const groups = graphNodeTypes.map((type) => renderGraphNodeGroup(type, nodes.filter((node) => node.type === type), filters, selectedNode));
  return `<section class="graph-panel" aria-label="Graph nodes"><h2>Nodes by type</h2>${groups.join("")}</section>`;
}

function renderGraphNodeGroup(
  type: MemoryGraphNodeType,
  nodes: readonly MemoryGraphNode[],
  filters: ConsoleFilterState,
  selectedNode: MemoryGraphNode | undefined,
): string {
  if (nodes.length === 0) {
    return `<section class="graph-group"><h3>${escapeHtml(formatPlainLabel(type))}</h3><p class="empty">No ${escapeHtml(formatPlainLabel(type))} nodes.</p></section>`;
  }

  const rows = nodes.map((node) => {
    const params = filtersToSearchParams(filters, node.id);
    const activeClass = selectedNode?.id === node.id ? " active" : "";
    return `<a class="graph-row${activeClass}" href="/graph?${escapeAttribute(params.toString())}">
      <span class="row-title">${escapeHtml(node.label)}</span>
      <span class="row-meta">${escapeHtml(node.id)}</span>
    </a>`;
  });
  return `<section class="graph-group"><h3>${escapeHtml(formatPlainLabel(type))} (${escapeHtml(String(nodes.length))})</h3><div class="graph-rows">${rows.join("")}</div></section>`;
}

function renderGraphEdgeGroups(edges: readonly MemoryGraphEdge[], totalEdgeCount: number): string {
  const groups = graphEdgeTypes.map((type) => renderGraphEdgeGroup(type, edges.filter((edge) => edge.type === type)));
  const filteredCopy = edges.length === totalEdgeCount ? "" : `<p class="empty">Showing ${escapeHtml(String(edges.length))} of ${escapeHtml(String(totalEdgeCount))} total edges because an edge type filter is active.</p>`;
  return `<section class="graph-panel" aria-label="Graph edges"><h2>Edges by type</h2>${filteredCopy}${groups.join("")}</section>`;
}

function renderGraphEdgeGroup(type: MemoryGraphEdgeType, edges: readonly MemoryGraphEdge[]): string {
  if (edges.length === 0) {
    return `<section class="graph-group"><h3>${escapeHtml(formatPlainLabel(type))}</h3><p class="empty">No ${escapeHtml(formatPlainLabel(type))} edges.</p></section>`;
  }

  const rows = edges.map((edge) => `<div class="graph-edge-row">
    <strong>${escapeHtml(edge.source)}</strong>
    <span>${escapeHtml(edge.label ?? edge.type)}</span>
    <strong>${escapeHtml(edge.target)}</strong>
    ${edge.metadata ? `<span class="compact-evidence">${renderGraphMetadataInline(edge.metadata)}</span>` : ""}
  </div>`);
  return `<section class="graph-group"><h3>${escapeHtml(formatPlainLabel(type))} (${escapeHtml(String(edges.length))})</h3><div class="graph-rows">${rows.join("")}</div></section>`;
}

function renderGraphDetailsPane(node: MemoryGraphNode | undefined): string {
  if (!node) {
    return `<aside class="details"><p class="empty">Select a memory, source, tag, or evidence node to inspect graph metadata.</p></aside>`;
  }

  return `<aside class="details" aria-label="Graph node details">
    <h2>${escapeHtml(formatPlainLabel(node.type))} details</h2>
    <dl class="meta-grid compact">
      ${renderDetail("ID", node.id)}
      ${renderDetail("Type", node.type)}
      ${renderDetail("Label", node.label)}
      ${node.memoryId ? renderDetail("Memory ID", node.memoryId) : ""}
    </dl>
    ${renderGraphMetadataSection(node.metadata)}
  </aside>`;
}

function renderGraphMetadataSection(metadata: MemoryGraphNode["metadata"]): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return `<section class="detail-section"><h3>Metadata</h3><p class="empty">No metadata recorded for this node.</p></section>`;
  }

  const details = Object.entries(metadata)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => renderDetail(key, String(value)))
    .join("");
  return `<section class="detail-section"><h3>Metadata</h3><dl class="meta-grid compact">${details}</dl></section>`;
}

function renderGraphMetadataInline(metadata: NonNullable<MemoryGraphEdge["metadata"]>): string {
  return Object.entries(metadata)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .map(escapeHtml)
    .join(" · ");
}

function countGraphNodes(nodes: readonly MemoryGraphNode[], type: MemoryGraphNodeType): number {
  return nodes.filter((node) => node.type === type).length;
}

function countGraphEdges(edges: readonly MemoryGraphEdge[], type: MemoryGraphEdgeType): number {
  return edges.filter((edge) => edge.type === type).length;
}

function renderFilters(filters: ConsoleFilterState): string {
  const hasCompleteProjectScope = filters.scope === "project" && filters.projectId !== undefined && filters.containerId !== undefined;

  return `<form class="filters" method="get" action="/">
    <div class="search-row">
      <label>
        <span>Search</span>
        <input name="q" value="${escapeAttribute(filters.query ?? "")}" placeholder="Search memory content">
      </label>
      <button type="submit">Search</button>
    </div>
    ${hasCompleteProjectScope ? renderScopeContext(filters.projectId, filters.containerId) : ""}
    <details class="advanced-filters">
      <summary>Advanced filters</summary>
      <div class="advanced-grid">
        ${hasCompleteProjectScope ? "" : renderEditableScopeFilters(filters)}
        <label>
          <span>Kind</span>
          ${renderSelect("kind", consoleKindFilters, filters.kind, formatFilterLabel)}
        </label>
        <label>
          <span>Verification</span>
          ${renderSelect("verificationStatus", consoleVerificationStatusFilters, filters.verificationStatus, formatFilterLabel)}
        </label>
        <label>
          <span>Review</span>
          ${renderSelect("reviewStatus", consoleReviewStatusFilters, filters.reviewStatus, formatFilterLabel)}
        </label>
        <label>
          <span>Limit</span>
          ${renderSelect("limit", ["25", "50"], String(filters.limit) === "25" ? "25" : "50", (value) => value)}
        </label>
      </div>
    </details>
  </form>`;
}

function renderEditableScopeFilters(filters: ConsoleFilterState): string {
  return `<label>
      <span>Scope</span>
      ${renderSelect("scope", consoleScopeFilters, filters.scope, formatFilterLabel)}
    </label>
    <label>
      <span>Project ID</span>
      <input name="projectId" value="${escapeAttribute(filters.projectId ?? "")}" placeholder="optional">
    </label>
    <label>
      <span>Container ID</span>
      <input name="containerId" value="${escapeAttribute(filters.containerId ?? "")}" placeholder="optional">
    </label>`;
}

function renderScopeContext(projectId: string, containerId: string): string {
  return `<div class="scope-context">
      <span>Scope</span>
      <strong>${escapeHtml(projectId)}</strong>
      <span>${escapeHtml(containerId)}</span>
      <input type="hidden" name="scope" value="project">
      <input type="hidden" name="projectId" value="${escapeAttribute(projectId)}">
      <input type="hidden" name="containerId" value="${escapeAttribute(containerId)}">
    </div>`;
}

function renderSelect<Value extends string>(
  name: string,
  values: readonly Value[],
  selected: Value,
  labeler: (value: Value) => string,
): string {
  const options = values.map((value) => {
    const selectedAttribute = value === selected ? " selected" : "";
    return `<option value="${escapeAttribute(value)}"${selectedAttribute}>${escapeHtml(labeler(value))}</option>`;
  });

  return `<select name="${escapeAttribute(name)}">${options.join("")}</select>`;
}

function renderMemoryList(
  memories: readonly ConsoleMemory[],
  filters: ConsoleFilterState,
  selectedMemory: ConsoleMemory | undefined,
): string {
  if (memories.length === 0) {
    return `<section class="list-panel"><p class="empty">No memories matched the current filters.</p></section>`;
  }

  const items = memories.map((memory) => {
    const params = filtersToSearchParams(filters, memory.id);
    const activeClass = selectedMemory?.id === memory.id ? " active" : "";
    const summary = memory.summary ?? memory.content;
    return `<a class="memory-row${activeClass}" href="/?${escapeAttribute(params.toString())}">
      <span class="row-title">${escapeHtml(summary)}</span>
      <span class="row-meta">${escapeHtml(memory.kind)} · ${escapeHtml(memory.scope ?? "search result")}</span>
      <span class="signal-badges">${renderStatusBadges(memory)}</span>
    </a>`;
  });

  return `<section class="list-panel" aria-label="Memory list">${items.join("")}</section>`;
}

function renderDetailsPane(memory: ConsoleMemory | undefined): string {
  if (!memory) {
    return `<aside class="details"><p class="empty">Select a memory to inspect its source, evidence, and review decisions.</p></aside>`;
  }

  return `<aside class="details" aria-label="Memory details">
    <h2>Memory details</h2>
    <div class="signal-badges detail-badges">${renderStatusBadges(memory)}</div>
    ${memory.summary ? `<section class="detail-section summary-section">
      <h3>Summary</h3>
      <p>${escapeHtml(memory.summary)}</p>
    </section>` : ""}
    <section class="detail-section content-section">
      <h3>Content</h3>
      <p>${escapeHtml(memory.content)}</p>
    </section>
    <details class="technical-details">
      <summary>Technical metadata</summary>
      <dl class="meta-grid compact">
        ${renderDetail("ID", memory.id)}
        ${renderDetail("Kind", memory.kind)}
        ${renderDetail("Scope", memory.scope ?? "search result")}
        ${renderDetail("Verification", memory.verificationStatus)}
        ${renderDetail("Review", memory.reviewStatus ?? "none")}
        ${renderDetail("Importance", memory.importance.toFixed(2))}
        ${renderDetail("Created", memory.createdAt)}
        ${memory.updatedAt ? renderDetail("Updated", memory.updatedAt) : ""}
        ${memory.projectId ? renderDetail("Project", memory.projectId) : ""}
        ${memory.containerId ? renderDetail("Container", memory.containerId) : ""}
        ${memory.score !== undefined ? renderDetail("Score", memory.score.toFixed(3)) : ""}
      </dl>
    </details>
    ${memory.tags.length > 0 ? renderStringList("Tags", memory.tags) : ""}
    ${memory.reasons.length > 0 ? renderStringList("Ranking reasons", memory.reasons) : ""}
    <section class="detail-section">
      <h3>Source</h3>
      <dl class="meta-grid compact">
        ${renderDetail("Type", memory.source.type)}
        ${memory.source.uri ? renderDetail("URI", memory.source.uri) : ""}
        ${memory.source.title ? renderDetail("Title", memory.source.title) : ""}
      </dl>
    </section>
    ${renderEvidence("Verification evidence", memory.verificationEvidence)}
    ${renderReviewDecisions(memory.reviewDecisions)}
  </aside>`;
}

function renderStatusBadges(memory: ConsoleMemory): string {
  const reviewStatus = memory.reviewStatus ?? "unreviewed";
  return `${renderBadge(memory.verificationStatus, `verification-${memory.verificationStatus}`)}${renderBadge(reviewStatus, `review-${reviewStatus}`)}`;
}

function renderBadge(label: string, className: string): string {
  return `<span class="signal-badge ${escapeAttribute(className)}">${escapeHtml(label)}</span>`;
}

function renderDetail(label: string, value: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function renderStringList(title: string, values: readonly string[]): string {
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`;
}

function renderEvidence(title: string, evidence: ConsoleMemory["verificationEvidence"]): string {
  if (evidence.length === 0) {
    return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><p class="empty">No evidence recorded.</p></section>`;
  }

  const items = evidence.map((item) => `<li><strong>${escapeHtml(item.type)}</strong>: ${escapeHtml(item.value)}${item.note ? ` — ${escapeHtml(item.note)}` : ""}</li>`);
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><ul>${items.join("")}</ul></section>`;
}

function renderReviewDecisions(decisions: ConsoleMemory["reviewDecisions"]): string {
  if (decisions.length === 0) {
    return `<section class="detail-section"><h3>Review decisions</h3><p class="empty">No review decisions recorded.</p></section>`;
  }

  const items = decisions.map((decision) => `<li>
    <strong>${escapeHtml(decision.action)}</strong> at ${escapeHtml(decision.decidedAt)}${decision.note ? ` — ${escapeHtml(decision.note)}` : ""}
    ${decision.evidence && decision.evidence.length > 0 ? renderCompactEvidence(decision.evidence) : ""}
  </li>`);
  return `<section class="detail-section"><h3>Review decisions</h3><ul>${items.join("")}</ul></section>`;
}

function renderCompactEvidence(evidence: ConsoleMemory["verificationEvidence"]): string {
  const items = evidence.map((item) => `${item.type}: ${item.value}${item.note ? ` — ${item.note}` : ""}`);
  return `<span class="compact-evidence">Evidence: ${items.map(escapeHtml).join("; ")}</span>`;
}

function formatFilterLabel(value: ConsoleScopeFilter | ConsoleKindFilter | ConsoleVerificationStatusFilter | ConsoleReviewStatusFilter | MemoryGraphEdgeType): string {
  return value === "all" ? "All" : value.replaceAll("_", " ");
}

function formatPlainLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function renderStyles(): string {
  return `
    :root {
      --background: #f4f1e8;
      --surface: #fffdf7;
      --surface-muted: #ebe4d3;
      --surface-hover: #f7f2e6;
      --border: #d4c9b7;
      --text: #27231d;
      --muted: #625b4f;
      --accent: #2f5f4d;
      --accent-soft: #dce8df;
      --focus: #9fb9aa;
      --warning-bg: #fff4d2;
      --warning-text: #6f5518;
      --danger: #8f3f2f;
      --danger-bg: #f6e4df;
      --danger-border: #e3c9c2;
      --surface-wash: #fbf8f0;
      --radius: 6px;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 24px;
      --space-6: 32px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--background); color: var(--text); font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif; }
    .shell { max-width: 1320px; margin: 0 auto; padding: 28px var(--space-6) var(--space-6); }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: var(--space-1); font-size: 24px; line-height: 1.18; letter-spacing: -0.015em; }
    h2 { margin-bottom: var(--space-3); font-size: 18px; line-height: 1.3; letter-spacing: -0.01em; }
    h3 { margin-bottom: var(--space-2); font-size: 13px; line-height: 1.35; }
    .topbar p, .empty, .row-meta, .status { color: var(--muted); }
    .topbar p { max-width: 520px; margin-bottom: 0; }
    .refresh, button { border: 1px solid var(--accent); border-radius: var(--radius); background: var(--accent); color: white; padding: 8px 12px; text-decoration: none; font-weight: 650; cursor: pointer; }
    .refresh { background: transparent; color: var(--accent); }
    .refresh:hover, .refresh:focus-visible { background: var(--accent-soft); }
    .nav { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border); }
    .nav-link { border: 0; border-bottom: 2px solid transparent; color: var(--muted); padding: 10px var(--space-3) 9px; text-decoration: none; font-weight: 650; }
    .nav-link:hover { color: var(--text); background: var(--surface-hover); }
    .nav-link.active { border-bottom-color: var(--accent); color: var(--accent); }
    .filters { display: grid; gap: var(--space-3); padding: var(--space-4); margin-bottom: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .graph-filters { margin-bottom: var(--space-3); }
    .search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); align-items: end; }
    .advanced-filters { border-top: 1px solid var(--surface-muted); padding-top: var(--space-3); }
    .advanced-filters summary { color: var(--muted); cursor: pointer; font-weight: 650; }
    .advanced-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
    .graph-filter-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 0; align-items: end; }
    label, .scope-context { display: grid; gap: var(--space-1); color: var(--muted); font-size: 12px; }
    .scope-context { min-height: 38px; align-content: center; }
    .scope-context strong { color: var(--text); font-size: 14px; overflow-wrap: anywhere; }
    .scope-context span:last-of-type { overflow-wrap: anywhere; }
    input, select, textarea { width: 100%; min-height: 38px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); padding: 8px 10px; font: inherit; }
    textarea { min-height: 116px; resize: vertical; }
    input:focus, select:focus, textarea:focus, button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-color: var(--accent); }
    .filters button { align-self: end; min-height: 38px; }
    .status { margin-bottom: var(--space-4); }
    .graph-summary { display: grid; gap: var(--space-1); }
    .graph-counts { display: block; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .graph-warnings { padding: var(--space-4); margin-bottom: var(--space-4); background: var(--warning-bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--warning-text); }
    .graph-warnings h2 { margin-bottom: var(--space-2); }
    .graph-warnings .empty, .graph-warnings .compact-evidence { color: var(--warning-text); }
    .graph-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 420px); gap: var(--space-4); align-items: start; }
    .graph-main { display: grid; gap: var(--space-4); }
    .graph-panel { display: grid; gap: var(--space-4); padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .graph-panel h2, .graph-group h3 { margin-bottom: 0; }
    .graph-group { display: grid; gap: var(--space-2); }
    .graph-rows { display: grid; border: 1px solid var(--surface-muted); border-radius: var(--radius); overflow: hidden; }
    .graph-row, .graph-edge-row { display: grid; gap: var(--space-1); padding: var(--space-3); border-bottom: 1px solid var(--surface-muted); color: var(--text); text-decoration: none; }
    .graph-row:last-child, .graph-edge-row:last-child { border-bottom: 0; }
    .graph-row:hover { background: var(--surface-hover); }
    .graph-row.active { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    .graph-edge-row { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: start; }
    .graph-edge-row .compact-evidence { grid-column: 1 / -1; }
    .console-grid { display: grid; grid-template-columns: minmax(320px, 460px) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
    .list-panel, .details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .list-panel { overflow: hidden; }
    .memory-row { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); color: var(--text); text-decoration: none; border-bottom: 1px solid var(--surface-muted); }
    .memory-row:last-child { border-bottom: 0; }
    .memory-row:hover { background: var(--surface-hover); }
    .memory-row.active { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    .review-row { gap: var(--space-2); }
    .rejected-row { gap: var(--space-2); }
    .checkbox-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2); align-items: start; color: var(--text); font-size: 14px; }
    .checkbox-row input { width: auto; min-height: auto; margin-top: 3px; }
    .inspect-link { color: var(--accent); font-size: 12px; font-weight: 650; text-decoration: none; }
    .inspect-link:hover { text-decoration: underline; }
    .row-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 650; line-height: 1.35; }
    .row-meta { font-size: 12px; }
    .review-reasons { color: var(--muted); font-size: 12px; line-height: 1.45; }
    .signal-badges { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .detail-badges { margin-bottom: var(--space-3); }
    .signal-badge { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-muted); color: var(--muted); padding: 2px 7px; font-size: 12px; font-weight: 650; line-height: 1.3; }
    .verification-verified { border-color: var(--accent-soft); background: var(--accent-soft); color: var(--accent); }
    .verification-hypothesis { border-color: #e4d3a5; background: var(--warning-bg); color: var(--warning-text); }
    .review-rejected { border-color: #e3c9c2; background: var(--danger-bg); color: var(--danger); }
    .projects-panel { display: grid; gap: var(--space-3); }
    .quarantine-copy { padding: var(--space-4); margin-bottom: var(--space-4); background: var(--danger-bg); border: 1px solid var(--danger-border); border-radius: var(--radius); color: var(--danger); }
    .quarantine-copy h2 { margin-bottom: var(--space-2); }
    .quarantine-copy p { margin-bottom: 0; color: var(--danger); }
    .quarantine-form { display: grid; }
    .quarantine-form-header, .quarantine-actions { display: grid; gap: var(--space-2); padding: var(--space-4); border-bottom: 1px solid var(--surface-muted); }
    .quarantine-form-header p, .quarantine-actions .empty { margin-bottom: 0; }
    .quarantine-rows { display: grid; }
    .quarantine-actions { border-top: 1px solid var(--surface-muted); border-bottom: 0; }
    .purge-scope-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--surface-muted); background: var(--surface-wash); }
    .purge-results { position: static; }
    .purge-outcomes { margin-bottom: var(--space-4); }
    .final-purge-form { margin-top: var(--space-4); }
    .project-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, auto); gap: var(--space-2) var(--space-4); align-items: start; padding: var(--space-4); color: var(--text); text-decoration: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .project-row:hover { border-color: var(--accent); background: var(--surface-hover); }
    .project-title { font-size: 17px; line-height: 1.3; font-weight: 750; overflow-wrap: anywhere; }
    .project-container, .project-meta { color: var(--muted); overflow-wrap: anywhere; }
    .count-breakdown { grid-column: 2; grid-row: 1 / span 2; color: var(--muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; text-align: right; }
    .details { position: sticky; top: var(--space-4); min-height: 320px; padding: var(--space-5); }
    .meta-grid { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: var(--space-2) var(--space-3); margin: 0 0 var(--space-5); }
    .meta-grid.compact { margin-bottom: 0; }
    .technical-details { padding: var(--space-3); margin-top: var(--space-4); border: 1px solid var(--surface-muted); border-radius: var(--radius); background: #faf6ed; }
    .technical-details summary { color: var(--muted); cursor: pointer; font-weight: 650; }
    .technical-details .meta-grid { margin-top: var(--space-3); }
    dt { color: var(--muted); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .detail-section { padding-top: var(--space-4); margin-top: var(--space-4); border-top: 1px solid var(--surface-muted); }
    .detail-section:first-of-type { padding-top: 0; margin-top: 0; border-top: 0; }
    .detail-section p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
    .summary-section p { font-size: 16px; line-height: 1.55; }
    .content-section p { padding: var(--space-3); border-left: 3px solid var(--surface-muted); background: #fbf8f0; }
    .assist-section p { margin-bottom: var(--space-2); }
    .review-actions { display: grid; gap: var(--space-3); }
    .action-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); align-items: end; padding: var(--space-3); border: 1px solid var(--surface-muted); border-radius: var(--radius); background: #fbf8f0; }
    .action-form.stacked { grid-template-columns: 1fr; }
    .evidence-grid { display: grid; grid-template-columns: minmax(130px, 0.7fr) minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); }
    ul { margin: 0; padding-left: var(--space-5); }
    li { margin-bottom: var(--space-2); overflow-wrap: anywhere; }
    .compact-evidence { display: block; margin-top: var(--space-1); color: var(--muted); font-size: 12px; }
    @media (max-width: 980px) {
      .project-row { grid-template-columns: 1fr; }
      .count-breakdown { grid-column: auto; grid-row: auto; text-align: left; }
      .graph-layout { grid-template-columns: 1fr; }
      .details { position: static; }
    }
    @media (max-width: 860px) {
      .shell { padding: var(--space-4); }
      .topbar { display: grid; }
      .search-row, .advanced-grid, .graph-filter-grid, .graph-edge-row { grid-template-columns: 1fr; }
      .graph-edge-row .compact-evidence { grid-column: auto; }
      .console-grid { grid-template-columns: 1fr; }
      .action-form, .evidence-grid, .purge-scope-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .shell { padding: var(--space-3); }
      .nav { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 0; }
      .nav-link { white-space: nowrap; }
      .details { padding: var(--space-4); }
      .meta-grid { grid-template-columns: 1fr; gap: var(--space-1); }
    }
  `;
}
