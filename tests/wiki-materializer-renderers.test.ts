import { describe, expect, it } from "vitest";

import { defaultWikiMaterializerFilters, type WikiSelectedRecord } from "../src/features/memory/wiki-materializer/contracts.js";
import {
  groupRecordsBySource,
  renderWikiMarkdownProjection,
  wikiGeneratedProjectionWarning,
  type WikiMarkdownProjectionInput,
} from "../src/features/memory/wiki-materializer/renderers.js";
import { hashWikiMaterializerRecord, slugifyWikiMaterializerSource } from "../src/features/memory/wiki-materializer/utils.js";

describe("wiki materializer renderers", () => {
  it("starts every rendered markdown page with the generated projection warning", () => {
    const projection = renderWikiMarkdownProjection(createProjectionInput([verifiedRecord(), minimalRecord()]));

    expect(projection.length).toBeGreaterThan(0);

    for (const page of projection) {
      expect(page.content.startsWith(`${wikiGeneratedProjectionWarning}\n\n`)).toBe(true);
    }
  });

  it("renders a verified record page with provenance, source metadata, evidence, and content", () => {
    const record = verifiedRecord();
    const projection = renderWikiMarkdownProjection(createProjectionInput([record]));
    const recordPage = projection.find((page) => page.relativePath === `records/${record.id}.md`);

    expect(recordPage).toBeDefined();
    expect(recordPage?.sourceRecordIds).toEqual([record.id]);
    expect(recordPage?.content).toContain("## Provenance");
    expect(recordPage?.content).toContain("- memory ID: `mem-doc-001`");
    expect(recordPage?.content).toContain("- kind: `doc`");
    expect(recordPage?.content).toContain("- scope: `project`");
    expect(recordPage?.content).toContain("- project ID: `project-alpha`");
    expect(recordPage?.content).toContain("- container ID: `container-main`");
    expect(recordPage?.content).toContain("- verification status: `verified`");
    expect(recordPage?.content).toContain("- review status: `(missing)`");
    expect(recordPage?.content).toContain("- source type: `document`");
    expect(recordPage?.content).toContain("- source URI: `file:///docs/guide.md`");
    expect(recordPage?.content).toContain("- source title: `Guide`");
    expect(recordPage?.content).toContain("## Verification evidence");
    expect(recordPage?.content).toContain("- `link`: `https://example.test/guide` — `primary source`");
    expect(recordPage?.content).toContain("## Content");
    expect(recordPage?.content).toContain("```\nGuide body with facts only.\n```");
  });

  it("renders explicit missing metadata labels for minimal-field records without inference", () => {
    const record = minimalRecord();
    const projection = renderWikiMarkdownProjection(createProjectionInput([record]));
    const recordPage = projection.find((page) => page.relativePath === `records/${record.id}.md`);

    expect(recordPage).toBeDefined();
    expect(recordPage?.content).toContain("- review status: `(missing)`");
    expect(recordPage?.content).toContain("- verified at: `(missing)`");
    expect(recordPage?.content).toContain("- updated at: `(missing)`");
    expect(recordPage?.content).toContain("- source URI: `(missing)`");
    expect(recordPage?.content).toContain("- source title: `(missing)`");
    expect(recordPage?.content).toContain("## Tags\n- (none)");
    expect(recordPage?.content).toContain("## Summary\n(missing)");
    expect(recordPage?.content).toContain("## Verification evidence\n- (none)");
    expect(recordPage?.content).not.toContain("topic cluster");
    expect(recordPage?.content).not.toContain("inferred");
  });

  it("renders relative index and source links with stable source grouping and slugs", () => {
    const first = verifiedRecord({ id: "mem-doc-001" });
    const second = verifiedRecord({ id: "mem-doc-002", createdAt: "2026-05-08T01:05:00.000Z" });
    const third = verifiedRecord({
      id: "mem-doc-003",
      source: { type: "document", uri: "file:///docs/other.md", title: "Other" },
      createdAt: "2026-05-08T02:00:00.000Z",
    });
    const projection = renderWikiMarkdownProjection(createProjectionInput([third, second, first]));
    const indexPage = projection.find((page) => page.relativePath === "index.md");
    const groupedSources = groupRecordsBySource([third, second, first]);
    const guideGroup = groupedSources.find((group) => group.records.map((record) => record.id).includes("mem-doc-001"));
    const guideSlug = slugifyWikiMaterializerSource({ id: first.id, source: first.source });
    const guideSourcePage = projection.find((page) => page.relativePath === `sources/${guideSlug}.md`);

    expect(groupedSources).toHaveLength(2);
    expect(guideGroup?.slug).toBe(guideSlug);
    expect(indexPage?.content).toContain("- [Materialization log](log.md)");
    expect(indexPage?.content).toContain("- [`mem-doc-001`](records/mem-doc-001.md) — `doc` · `verified`");
    expect(indexPage?.content).toContain(`- [\`Guide\`](sources/${guideSlug}.md) — 2 record(s)`);
    expect(guideSourcePage?.content).toContain("- [`mem-doc-001`](../records/mem-doc-001.md) — `doc` · `verified`");
    expect(guideSourcePage?.content).toContain("- [`mem-doc-002`](../records/mem-doc-002.md) — `doc` · `verified`");
  });

  it("renders deterministically for the same selected records regardless of input order", () => {
    const alpha = verifiedRecord({ id: "mem-doc-001", createdAt: "2026-05-08T01:00:00.000Z" });
    const beta = verifiedRecord({
      id: "mem-doc-002",
      source: { type: "manual", title: "Beta note" },
      createdAt: "2026-05-08T03:00:00.000Z",
      content: "Beta content",
    });
    const first = renderWikiMarkdownProjection(createProjectionInput([alpha, beta]));
    const second = renderWikiMarkdownProjection(createProjectionInput([beta, alpha]));

    expect(second).toEqual(first);
    expect(first.map((page) => page.relativePath)).toEqual([
      "index.md",
      "log.md",
      "records/mem-doc-002.md",
      "records/mem-doc-001.md",
      `sources/${slugifyWikiMaterializerSource({ id: beta.id, source: beta.source })}.md`,
      `sources/${slugifyWikiMaterializerSource({ id: alpha.id, source: alpha.source })}.md`,
    ]);
  });
});

function createProjectionInput(records: readonly WikiSelectedRecord[]): WikiMarkdownProjectionInput {
  return {
    projectId: "project-alpha",
    containerId: "container-main",
    generatedAt: "2026-05-08T10:00:00.000Z",
    filters: defaultWikiMaterializerFilters,
    records,
    includedCount: records.length,
    excludedCount: 2,
    excludedByReason: {
      scope_mismatch: 1,
      unverified: 1,
    },
  };
}

function verifiedRecord(overrides: Partial<WikiSelectedRecord> = {}): WikiSelectedRecord {
  const base = {
    id: "mem-doc-001",
    kind: "doc",
    scope: "project",
    verificationStatus: "verified",
    reviewStatus: undefined,
    reviewDecisions: [],
    verifiedAt: "2026-05-08T01:30:00.000Z",
    verificationEvidence: [{ type: "link", value: "https://example.test/guide", note: "primary source" }],
    projectId: "project-alpha",
    containerId: "container-main",
    source: { type: "document", uri: "file:///docs/guide.md", title: "Guide" },
    content: "Guide body with facts only.",
    summary: "Guide summary",
    tags: ["guide", "verified"],
    importance: 0.8,
    createdAt: "2026-05-08T01:00:00.000Z",
    updatedAt: "2026-05-08T01:15:00.000Z",
  } satisfies Omit<WikiSelectedRecord, "recordHash">;
  const selected = {
    ...base,
    ...overrides,
  } satisfies Omit<WikiSelectedRecord, "recordHash">;

  return {
    ...selected,
    recordHash: hashWikiMaterializerRecord(selected),
  };
}

function minimalRecord(): WikiSelectedRecord {
  return verifiedRecord({
    id: "mem-minimal-001",
    source: { type: "manual" },
    summary: undefined,
    tags: [],
    verificationEvidence: [],
    verifiedAt: undefined,
    updatedAt: undefined,
    content: "Minimal content only.",
  });
}
