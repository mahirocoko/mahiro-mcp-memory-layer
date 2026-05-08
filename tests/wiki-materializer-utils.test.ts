import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  hashWikiMaterializerRecord,
  slugifyWikiMaterializerSource,
  type WikiMaterializerHashInput,
} from "../src/features/memory/wiki-materializer/utils.js";

function record(overrides: Partial<WikiMaterializerHashInput> = {}): WikiMaterializerHashInput {
  return {
    id: "mem-001",
    kind: "doc",
    scope: "project",
    projectId: "project-alpha",
    containerId: "container-main",
    source: {
      type: "document",
      uri: "file:///docs/guide.md",
      title: "Guide",
    },
    content: "Hello world",
    summary: "Short summary",
    tags: ["wiki", "memory"],
    verificationStatus: "verified",
    reviewStatus: "deferred",
    verifiedAt: "2026-05-08T00:00:00.000Z",
    verificationEvidence: [{ type: "link", value: "https://example.test" }],
    updatedAt: "2026-05-08T01:00:00.000Z",
    ...overrides,
  };
}

describe("wiki materializer utilities", () => {
  it("sanitizes source slugs while preserving readability", () => {
    const slug = slugifyWikiMaterializerSource({
      id: "mem-001",
      source: {
        type: "document",
        title: "  Crème brûlée / wiki: guide?  ",
        uri: "file:///docs/guide.md",
      },
    });

    expect(slug).toMatch(/^creme-brulee-wiki-guide-[a-f0-9]{12}$/);
    expect(path.basename(slug)).toBe(slug);
    expect(slug).not.toContain("/");
    expect(slug).not.toContain(":");
  });

  it("produces deterministic suffixes for duplicate-looking source slugs", () => {
    const first = slugifyWikiMaterializerSource({
      id: "mem-001",
      source: { type: "document", title: "Duplicate title", uri: "file:///docs/a.md" },
    });
    const second = slugifyWikiMaterializerSource({
      id: "mem-002",
      source: { type: "document", title: "Duplicate title", uri: "file:///docs/a.md" },
    });

    expect(first).toBe(slugifyWikiMaterializerSource({
      id: "mem-001",
      source: { type: "document", title: "Duplicate title", uri: "file:///docs/a.md" },
    }));
    expect(first).not.toBe(second);
    expect(first).toMatch(/^duplicate-title-[a-f0-9]{12}$/);
    expect(second).toMatch(/^duplicate-title-[a-f0-9]{12}$/);
  });

  it("falls back to the stable memory id when source metadata is missing", () => {
    const slug = slugifyWikiMaterializerSource({
      id: "mem-ømega 42",
      source: { type: "manual" },
    });

    expect(slug).toBe("mem-ømega-42");
  });

  it("accepts non-ASCII source titles and still returns a filesystem-safe slug", () => {
    const slug = slugifyWikiMaterializerSource({
      id: "mem-non-ascii",
      source: {
        type: "document",
        title: "東京 / فريق / mémoire",
        uri: "file:///docs/unicode.md",
      },
    });

    expect(slug).toMatch(/^[\p{L}\p{N}-]+-[a-f0-9]{12}$/u);
    expect(slug).not.toContain("/");
  });

  it("hashes only projected fields using stable canonical JSON ordering", () => {
    const base = record();
    const shuffled: WikiMaterializerHashInput = {
      content: base.content,
      updatedAt: base.updatedAt,
      tags: [...base.tags],
      source: { ...base.source },
      scope: base.scope,
      reviewStatus: base.reviewStatus,
      verifiedAt: base.verifiedAt,
      verificationEvidence: [...base.verificationEvidence],
      verificationStatus: base.verificationStatus,
      summary: base.summary,
      projectId: base.projectId,
      kind: base.kind,
      id: base.id,
      containerId: base.containerId,
    };

    const noisy = {
      ...base,
      generatedAt: "2026-05-08T12:34:56.000Z",
      retrievalTraceId: "trace-123",
    } as WikiMaterializerHashInput & { generatedAt: string; retrievalTraceId: string };

    expect(hashWikiMaterializerRecord(base)).toBe(hashWikiMaterializerRecord(shuffled));
    expect(hashWikiMaterializerRecord(base)).toBe(hashWikiMaterializerRecord(noisy));
  });

  it("changes the hash when projected content or verification state changes", () => {
    const base = record();
    const contentChanged = record({ content: "Hello world, revised" });
    const verificationChanged = record({ verificationStatus: "hypothesis" });

    expect(hashWikiMaterializerRecord(contentChanged)).not.toBe(hashWikiMaterializerRecord(base));
    expect(hashWikiMaterializerRecord(verificationChanged)).not.toBe(hashWikiMaterializerRecord(base));
  });
});
