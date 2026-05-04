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
    ${renderFilters(result.filters)}
    <section class="status" aria-live="polite">
      <strong>${escapeHtml(String(result.memories.length))}</strong> shown from ${escapeHtml(String(result.fetchedCount))} fetched by ${escapeHtml(result.fetchMode)}${result.degraded ? " · degraded search" : ""} · refreshed ${escapeHtml(result.refreshedAt)}
    </section>
    <section class="viewer-grid">
      ${renderMemoryList(result.memories, result.filters, result.selectedMemory)}
      ${renderDetailsPane(result.selectedMemory)}
    </section>
  </main>
</body>
</html>`;
}

export function renderEmptyViewerPage(filters: ViewerFilterState, message: string): string {
  return renderMemoryViewerPage({
    filters,
    memories: [],
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

function renderFilters(filters: ViewerFilterState): string {
  return `<form class="filters" method="get" action="/">
    <label>
      <span>Search</span>
      <input name="q" value="${escapeAttribute(filters.query ?? "")}" placeholder="Search memory content">
    </label>
    <label>
      <span>Scope</span>
      ${renderSelect("scope", viewerScopeFilters, filters.scope, formatFilterLabel)}
    </label>
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
      <span>Project ID</span>
      <input name="projectId" value="${escapeAttribute(filters.projectId ?? "")}" placeholder="optional">
    </label>
    <label>
      <span>Container ID</span>
      <input name="containerId" value="${escapeAttribute(filters.containerId ?? "")}" placeholder="optional">
    </label>
    <label>
      <span>Limit</span>
      <input name="limit" type="number" min="1" max="100" value="${escapeAttribute(String(filters.limit))}">
    </label>
    <button type="submit">Apply</button>
  </form>`;
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
      <span class="row-meta">${escapeHtml(memory.kind)} · ${escapeHtml(memory.scope ?? "search result")} · ${escapeHtml(memory.verificationStatus)}</span>
    </a>`;
  });

  return `<section class="list-panel" aria-label="Memory list">${items.join("")}</section>`;
}

function renderDetailsPane(memory: ViewerMemory | undefined): string {
  if (!memory) {
    return `<aside class="details"><p class="empty">Select a memory to inspect its source, evidence, and review decisions.</p></aside>`;
  }

  return `<aside class="details" aria-label="Memory details">
    <h2>${escapeHtml(memory.summary ?? "Memory details")}</h2>
    <dl class="meta-grid">
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
    <section class="detail-section">
      <h3>Content</h3>
      <p>${escapeHtml(memory.content)}</p>
    </section>
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
    ${decision.evidence ? renderEvidence("Decision evidence", decision.evidence) : ""}
  </li>`);
  return `<section class="detail-section"><h3>Review decisions</h3><ul>${items.join("")}</ul></section>`;
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
      --background: #f7f5ef;
      --surface: #fffdf8;
      --surface-muted: #eee9dc;
      --border: #d8d1c1;
      --text: #27231d;
      --muted: #6d6659;
      --accent: #316451;
      --accent-soft: #dce9df;
      --danger: #8f3f2f;
      --radius: 10px;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 24px;
      --space-6: 32px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--background); color: var(--text); font: 14px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif; }
    .shell { max-width: 1280px; margin: 0 auto; padding: var(--space-6); }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-5); }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: var(--space-1); font-size: 28px; line-height: 1.15; }
    h2 { margin-bottom: var(--space-4); font-size: 20px; line-height: 1.25; }
    h3 { margin-bottom: var(--space-2); font-size: 13px; }
    .topbar p, .empty, .row-meta, .status { color: var(--muted); }
    .refresh, button { border: 1px solid var(--accent); border-radius: var(--radius); background: var(--accent); color: white; padding: 9px 13px; text-decoration: none; font-weight: 650; cursor: pointer; }
    .filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-4); margin-bottom: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    label { display: grid; gap: var(--space-1); color: var(--muted); font-size: 12px; }
    input, select { width: 100%; min-height: 38px; border: 1px solid var(--border); border-radius: 8px; background: white; color: var(--text); padding: 8px 10px; font: inherit; }
    input:focus, select:focus { outline: 2px solid var(--accent-soft); border-color: var(--accent); }
    .filters button { align-self: end; min-height: 38px; }
    .status { margin-bottom: var(--space-4); }
    .viewer-grid { display: grid; grid-template-columns: minmax(280px, 420px) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
    .list-panel, .details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .list-panel { overflow: hidden; }
    .memory-row { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); color: var(--text); text-decoration: none; border-bottom: 1px solid var(--surface-muted); }
    .memory-row:last-child { border-bottom: 0; }
    .memory-row:hover, .memory-row.active { background: var(--accent-soft); }
    .row-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 650; }
    .row-meta { font-size: 12px; }
    .details { padding: var(--space-5); }
    .meta-grid { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: var(--space-2) var(--space-3); margin: 0 0 var(--space-5); }
    .meta-grid.compact { margin-bottom: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .detail-section { padding-top: var(--space-4); margin-top: var(--space-4); border-top: 1px solid var(--surface-muted); }
    .detail-section p { white-space: pre-wrap; overflow-wrap: anywhere; }
    ul { margin: 0; padding-left: var(--space-5); }
    li { margin-bottom: var(--space-2); overflow-wrap: anywhere; }
    @media (max-width: 860px) {
      .shell { padding: var(--space-4); }
      .topbar { display: grid; }
      .filters { grid-template-columns: 1fr; }
      .viewer-grid { grid-template-columns: 1fr; }
    }
  `;
}
