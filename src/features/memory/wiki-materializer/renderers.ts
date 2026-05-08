import type {
  WikiGeneratedPage,
  WikiMaterializerExclusionReason,
  WikiMaterializerFilters,
  WikiSelectedRecord,
} from "./contracts.js";
import {
  buildWikiMaterializerSourceGroups,
  sortWikiMaterializerRecords,
  type WikiMaterializerSourceGroup,
  type WikiMaterializerSourceIdentity,
} from "./source-groups.js";

export const wikiGeneratedProjectionWarning = "> **Generated projection — not source of truth.** This Markdown is a deterministic, read-only projection of canonical memory records in `mahiro-mcp-memory-layer`. Durable memory records remain canonical; `memory_context`, retrieval traces, and continuity caches are diagnostics, not durable wiki content.";

export interface WikiMarkdownProjectionInput {
  readonly projectId: string;
  readonly containerId: string;
  readonly generatedAt: string;
  readonly filters: WikiMaterializerFilters;
  readonly records: readonly WikiSelectedRecord[];
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly excludedByReason?: Partial<Record<WikiMaterializerExclusionReason, number>>;
}

const noneLabel = "(none)";
const missingLabel = "(missing)";

export function renderWikiMarkdownProjection(input: WikiMarkdownProjectionInput): readonly WikiGeneratedPage[] {
  const records = sortWikiMaterializerRecords(input.records);
  const sourceGroups = groupRecordsBySource(records);
  const pages: WikiGeneratedPage[] = [
    renderWikiIndexPage({ ...input, records }, sourceGroups),
    renderWikiLogPage({ ...input, records }),
  ];

  for (const record of records) {
    pages.push(renderWikiRecordPage(record));
  }

  for (const group of sourceGroups) {
    pages.push(renderWikiSourcePage(group));
  }

  return pages;
}

export function renderWikiIndexPage(
  input: WikiMarkdownProjectionInput,
  sourceGroups = groupRecordsBySource(sortWikiMaterializerRecords(input.records)),
): WikiGeneratedPage {
  const records = sortWikiMaterializerRecords(input.records);
  const recordLinks = records.length > 0
    ? records.map((record) => `- [${formatInline(record.id)}](${recordPagePath(record)}) — ${formatInline(record.kind)} · ${formatInline(record.verificationStatus)}`).join("\n")
    : `- ${noneLabel}`;
  const sourceLinks = sourceGroups.length > 0
    ? sourceGroups.map((group) => `- [${formatInline(sourceDisplayName(group.identity))}](${sourcePagePath(group.slug)}) — ${group.records.length} record(s)`).join("\n")
    : `- ${noneLabel}`;

  return page({
    kind: "index",
    relativePath: "index.md",
    title: "Memory wiki projection index",
    sourceRecordIds: records.map((record) => record.id),
    body: [
      "# Memory wiki projection index",
      "",
      "## Scope",
      `- project ID: ${formatInline(input.projectId)}`,
      `- container ID: ${formatInline(input.containerId)}`,
      `- generated at: ${formatInline(input.generatedAt)}`,
      "",
      "## Counts",
      `- included records: ${input.includedCount}`,
      `- excluded records: ${input.excludedCount}`,
      ...renderExclusionCounts(input.excludedByReason),
      "",
      "## Links",
      "- [Materialization log](log.md)",
      "- [Records](records/)",
      "- [Sources](sources/)",
      "",
      "## Records",
      recordLinks,
      "",
      "## Sources",
      sourceLinks,
    ],
  });
}

export function renderWikiLogPage(input: WikiMarkdownProjectionInput): WikiGeneratedPage {
  const records = sortWikiMaterializerRecords(input.records);

  return page({
    kind: "log",
    relativePath: "log.md",
    title: "Memory wiki materialization log",
    sourceRecordIds: records.map((record) => record.id),
    body: [
      "# Memory wiki materialization log",
      "",
      "This page describes the current generated materialization context only. It is not canonical memory history.",
      "",
      "## Current generation",
      `- generated at: ${formatInline(input.generatedAt)}`,
      `- project ID: ${formatInline(input.projectId)}`,
      `- container ID: ${formatInline(input.containerId)}`,
      `- filter mode: ${formatInline(input.filters.mode)}`,
      `- included verification statuses: ${formatList(input.filters.includeVerificationStatuses)}`,
      `- excluded review statuses: ${formatList(input.filters.excludeReviewStatuses)}`,
      `- included records: ${input.includedCount}`,
      `- excluded records: ${input.excludedCount}`,
      "",
      "## Included record IDs",
      records.length > 0 ? records.map((record) => `- ${formatInline(record.id)} (${formatInline(record.recordHash)})`).join("\n") : `- ${noneLabel}`,
    ],
  });
}

export function renderWikiRecordPage(record: WikiSelectedRecord): WikiGeneratedPage {
  return page({
    kind: "record",
    relativePath: recordPagePath(record),
    title: `Memory record: ${record.id}`,
    sourceRecordIds: [record.id],
    body: [
      `# Memory record: ${formatPlain(record.id)}`,
      "",
      "## Provenance",
      `- memory ID: ${formatInline(record.id)}`,
      `- kind: ${formatInline(record.kind)}`,
      `- scope: ${formatInline(record.scope)}`,
      `- project ID: ${formatInline(record.projectId)}`,
      `- container ID: ${formatInline(record.containerId)}`,
      `- verification status: ${formatInline(record.verificationStatus)}`,
      `- review status: ${formatInline(record.reviewStatus ?? missingLabel)}`,
      `- verified at: ${formatInline(record.verifiedAt ?? missingLabel)}`,
      `- created at: ${formatInline(record.createdAt)}`,
      `- updated at: ${formatInline(record.updatedAt ?? missingLabel)}`,
      `- record hash: ${formatInline(record.recordHash)}`,
      "",
      "## Source metadata",
      `- source type: ${formatInline(record.source.type)}`,
      `- source URI: ${formatInline(record.source.uri ?? missingLabel)}`,
      `- source title: ${formatInline(record.source.title ?? missingLabel)}`,
      "",
      "## Tags",
      record.tags.length > 0 ? record.tags.map((tag) => `- ${formatInline(tag)}`).join("\n") : `- ${noneLabel}`,
      "",
      "## Summary",
      record.summary ?? missingLabel,
      "",
      "## Content",
      fencedBlock(record.content),
      "",
      "## Verification evidence",
      renderEvidenceList(record.verificationEvidence),
    ],
  });
}

export function renderWikiSourcePage(group: WikiMaterializerSourceGroup): WikiGeneratedPage {
  const records = sortWikiMaterializerRecords(group.records);

  return page({
    kind: "source",
    relativePath: sourcePagePath(group.slug),
    title: `Source: ${sourceDisplayName(group.identity)}`,
    sourceRecordIds: records.map((record) => record.id),
    body: [
      `# Source: ${formatPlain(sourceDisplayName(group.identity))}`,
      "",
      "## Source metadata",
      `- source slug: ${formatInline(group.slug)}`,
      `- source type: ${formatInline(group.identity.type)}`,
      `- source URI: ${formatInline(group.identity.uri ?? missingLabel)}`,
      `- source title: ${formatInline(group.identity.title ?? missingLabel)}`,
      "",
      "## Records",
      records.map((record) => `- [${formatInline(record.id)}](../${recordPagePath(record)}) — ${formatInline(record.kind)} · ${formatInline(record.verificationStatus)}`).join("\n"),
    ],
  });
}

export function groupRecordsBySource(records: readonly WikiSelectedRecord[]): readonly WikiMaterializerSourceGroup[] {
  return buildWikiMaterializerSourceGroups(records);
}

function page(input: Omit<WikiGeneratedPage, "content"> & { readonly body: readonly string[] }): WikiGeneratedPage {
  return {
    kind: input.kind,
    relativePath: input.relativePath,
    title: input.title,
    content: `${wikiGeneratedProjectionWarning}\n\n${input.body.join("\n")}\n`,
    sourceRecordIds: input.sourceRecordIds,
  };
}

function renderExclusionCounts(
  excludedByReason: Partial<Record<WikiMaterializerExclusionReason, number>> | undefined,
): readonly string[] {
  if (!excludedByReason || Object.keys(excludedByReason).length === 0) {
    return ["- excluded by reason: (none)"];
  }

  return Object.entries(excludedByReason)
    .sort(([left], [right]) => compareText(left, right))
    .map(([reason, count]) => `- excluded ${reason}: ${count}`);
}

function renderEvidenceList(evidence: WikiSelectedRecord["verificationEvidence"]): string {
  if (evidence.length === 0) {
    return `- ${noneLabel}`;
  }

  return evidence
    .map((item) => `- ${formatInline(item.type)}: ${formatInline(item.value)}${item.note ? ` — ${formatInline(item.note)}` : ""}`)
    .join("\n");
}

function sourceDisplayName(identity: WikiMaterializerSourceIdentity): string {
  return identity.title ?? identity.uri ?? `${identity.type} source`;
}

function recordPagePath(record: Pick<WikiSelectedRecord, "id">): string {
  return `records/${record.id}.md`;
}

function sourcePagePath(slug: string): string {
  return `sources/${slug}.md`;
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => formatInline(value)).join(", ") : noneLabel;
}

function formatInline(value: string): string {
  return `\`${value.replaceAll("`", "\\`")}\``;
}

function formatPlain(value: string): string {
  return value.replaceAll("\n", " ");
}

function fencedBlock(value: string): string {
  const backtickRuns = value.match(/`+/g) ?? [];
  const longestRun = backtickRuns.reduce((longest, run) => Math.max(longest, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));

  return `${fence}\n${value}\n${fence}`;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
