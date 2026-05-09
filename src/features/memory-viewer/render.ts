import {
  filtersToSearchParams,
  viewerKindFilters,
  viewerReviewStatusFilters,
  viewerScopeFilters,
  viewerVerificationStatusFilters,
} from "./filters.js";
import type {
  ViewerFilterState,
  ViewerKindFilter,
  ViewerLoadResult,
  ViewerMemory,
  ViewerNavigationView,
  ViewerProjectScopeSummary,
  ViewerReviewStatusFilter,
  ViewerScopeFilter,
  ViewerVerificationStatusFilter,
} from "./types.js";

export function renderMemoryViewerPage(result: ViewerLoadResult): string {
  const title = "Local memory viewer";
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

export function renderEmptyViewerPage(filters: ViewerFilterState, message: string): string {
  return renderMemoryViewerPage({
    filters,
    memories: [],
    projectScopes: [],
    fetchedCount: 0,
    fetchMode: "list",
    degraded: false,
    refreshedAt: message,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNavigation(filters: ViewerFilterState): string {
  const links = [
    renderNavigationLink("Verified", "/", isActiveNavigation(filters, "verified")),
    renderNavigationLink("Inbox", "/?view=inbox", isActiveNavigation(filters, "inbox")),
    renderNavigationLink("Projects", "/?view=projects", isActiveNavigation(filters, "projects")),
    renderNavigationLink("Firehose", "/?view=firehose", isActiveNavigation(filters, "firehose")),
  ];

  return `<nav class="nav" aria-label="Memory viewer navigation">${links.join("")}</nav>`;
}

function renderNavigationLink(label: string, href: string, active: boolean): string {
  const activeClass = active ? " active" : "";
  const currentAttribute = active ? " aria-current=\"page\"" : "";
  return `<a class="nav-link${activeClass}" href="${href}"${currentAttribute}>${escapeHtml(label)}</a>`;
}

function isActiveNavigation(filters: ViewerFilterState, view: ViewerNavigationView): boolean {
  return filters.view === view;
}

function renderMemoryExplorer(result: ViewerLoadResult): string {
  return `${renderFilters(result.filters)}
    <section class="status" aria-live="polite">
      <strong>${escapeHtml(String(result.memories.length))}</strong> shown from ${escapeHtml(String(result.fetchedCount))} fetched by ${escapeHtml(result.fetchMode)}${result.degraded ? " · degraded search" : ""} · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="viewer-grid">
      ${renderMemoryList(result.memories, result.filters, result.selectedMemory)}
      ${renderDetailsPane(result.selectedMemory)}
    </section>`;
}

function renderProjectsView(result: ViewerLoadResult): string {
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

function renderProjectScopeRow(projectScope: ViewerProjectScopeSummary, filters: ViewerFilterState): string {
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

function renderProjectCounts(projectScope: ViewerProjectScopeSummary): string {
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

function renderFilters(filters: ViewerFilterState): string {
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
          ${renderSelect("kind", viewerKindFilters, filters.kind, formatFilterLabel)}
        </label>
        <label>
          <span>Verification</span>
          ${renderSelect("verificationStatus", viewerVerificationStatusFilters, filters.verificationStatus, formatFilterLabel)}
        </label>
        <label>
          <span>Review</span>
          ${renderSelect("reviewStatus", viewerReviewStatusFilters, filters.reviewStatus, formatFilterLabel)}
        </label>
        <label>
          <span>Limit</span>
          ${renderSelect("limit", ["25", "50"], String(filters.limit) === "25" ? "25" : "50", (value) => value)}
        </label>
      </div>
    </details>
  </form>`;
}

function renderEditableScopeFilters(filters: ViewerFilterState): string {
  return `<label>
      <span>Scope</span>
      ${renderSelect("scope", viewerScopeFilters, filters.scope, formatFilterLabel)}
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
  memories: readonly ViewerMemory[],
  filters: ViewerFilterState,
  selectedMemory: ViewerMemory | undefined,
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

function renderDetailsPane(memory: ViewerMemory | undefined): string {
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

function renderStatusBadges(memory: ViewerMemory): string {
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

function renderEvidence(title: string, evidence: ViewerMemory["verificationEvidence"]): string {
  if (evidence.length === 0) {
    return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><p class="empty">No evidence recorded.</p></section>`;
  }

  const items = evidence.map((item) => `<li><strong>${escapeHtml(item.type)}</strong>: ${escapeHtml(item.value)}${item.note ? ` — ${escapeHtml(item.note)}` : ""}</li>`);
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><ul>${items.join("")}</ul></section>`;
}

function renderReviewDecisions(decisions: ViewerMemory["reviewDecisions"]): string {
  if (decisions.length === 0) {
    return `<section class="detail-section"><h3>Review decisions</h3><p class="empty">No review decisions recorded.</p></section>`;
  }

  const items = decisions.map((decision) => `<li>
    <strong>${escapeHtml(decision.action)}</strong> at ${escapeHtml(decision.decidedAt)}${decision.note ? ` — ${escapeHtml(decision.note)}` : ""}
    ${decision.evidence && decision.evidence.length > 0 ? renderCompactEvidence(decision.evidence) : ""}
  </li>`);
  return `<section class="detail-section"><h3>Review decisions</h3><ul>${items.join("")}</ul></section>`;
}

function renderCompactEvidence(evidence: ViewerMemory["verificationEvidence"]): string {
  const items = evidence.map((item) => `${item.type}: ${item.value}${item.note ? ` — ${item.note}` : ""}`);
  return `<span class="compact-evidence">Evidence: ${items.map(escapeHtml).join("; ")}</span>`;
}

function formatFilterLabel(
  value: ViewerScopeFilter | ViewerKindFilter | ViewerVerificationStatusFilter | ViewerReviewStatusFilter,
): string {
  return value === "all" ? "All" : value.replaceAll("_", " ");
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
    .search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); align-items: end; }
    .advanced-filters { border-top: 1px solid var(--surface-muted); padding-top: var(--space-3); }
    .advanced-filters summary { color: var(--muted); cursor: pointer; font-weight: 650; }
    .advanced-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
    label, .scope-context { display: grid; gap: var(--space-1); color: var(--muted); font-size: 12px; }
    .scope-context { min-height: 38px; align-content: center; }
    .scope-context strong { color: var(--text); font-size: 14px; overflow-wrap: anywhere; }
    .scope-context span:last-of-type { overflow-wrap: anywhere; }
    input, select { width: 100%; min-height: 38px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); padding: 8px 10px; font: inherit; }
    input:focus, select:focus, button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-color: var(--accent); }
    .filters button { align-self: end; min-height: 38px; }
    .status { margin-bottom: var(--space-4); }
    .viewer-grid { display: grid; grid-template-columns: minmax(320px, 460px) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
    .list-panel, .details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .list-panel { overflow: hidden; }
    .memory-row { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); color: var(--text); text-decoration: none; border-bottom: 1px solid var(--surface-muted); }
    .memory-row:last-child { border-bottom: 0; }
    .memory-row:hover { background: var(--surface-hover); }
    .memory-row.active { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    .row-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 650; line-height: 1.35; }
    .row-meta { font-size: 12px; }
    .signal-badges { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .detail-badges { margin-bottom: var(--space-3); }
    .signal-badge { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-muted); color: var(--muted); padding: 2px 7px; font-size: 12px; font-weight: 650; line-height: 1.3; }
    .verification-verified { border-color: var(--accent-soft); background: var(--accent-soft); color: var(--accent); }
    .verification-hypothesis { border-color: #e4d3a5; background: var(--warning-bg); color: var(--warning-text); }
    .review-rejected { border-color: #e3c9c2; background: var(--danger-bg); color: var(--danger); }
    .projects-panel { display: grid; gap: var(--space-3); }
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
    ul { margin: 0; padding-left: var(--space-5); }
    li { margin-bottom: var(--space-2); overflow-wrap: anywhere; }
    .compact-evidence { display: block; margin-top: var(--space-1); color: var(--muted); font-size: 12px; }
    @media (max-width: 980px) {
      .project-row { grid-template-columns: 1fr; }
      .count-breakdown { grid-column: auto; grid-row: auto; text-align: left; }
      .details { position: static; }
    }
    @media (max-width: 860px) {
      .shell { padding: var(--space-4); }
      .topbar { display: grid; }
      .search-row, .advanced-grid { grid-template-columns: 1fr; }
      .viewer-grid { grid-template-columns: 1fr; }
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
