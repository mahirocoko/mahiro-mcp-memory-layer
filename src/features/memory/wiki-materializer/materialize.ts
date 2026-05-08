import { createHash } from "node:crypto";
import { JsonlLogStore } from "../log/jsonl-log-store.js";
import { paths } from "../../../config/paths.js";
import {
  type WikiGeneratedPage,
  type WikiMaterializerExclusionReason,
  type WikiMaterializerFilters,
  type WikiMaterializerManifest,
  type WikiMaterializerManifestRecord,
  type WikiOutputLayout,
  type WikiOutputLayoutOptions,
  type WikiSelectedRecord,
  wikiMaterializerSchemaVersion,
} from "./contracts.js";
import { renderWikiMarkdownProjection } from "./renderers.js";
import { selectWikiCanonicalRecords, type WikiCanonicalRecordReader } from "./selector.js";
import { slugifyWikiMaterializerSource } from "./utils.js";
import { writeWikiMaterialization, type WikiMaterializationWriteResult } from "./writer.js";

export interface WikiMaterializationRunInput {
  readonly projectId: string;
  readonly containerId: string;
  readonly outputDir?: string;
  readonly includeHypotheses?: boolean;
  readonly logStore?: WikiCanonicalRecordReader;
  readonly generatedAt?: string;
  readonly materializerVersion?: string;
}

export interface WikiMaterializationRunResult extends WikiMaterializationWriteResult {
  readonly generatedAt: string;
  readonly manifest: WikiMaterializerManifest;
  readonly pages: readonly WikiGeneratedPage[];
  readonly records: readonly WikiSelectedRecord[];
  readonly layout: WikiOutputLayout;
}

export async function runWikiMaterialization(input: WikiMaterializationRunInput): Promise<WikiMaterializationRunResult> {
  const logStore = input.logStore ?? new JsonlLogStore(paths.canonicalLogFilePath);
  const selection = await selectWikiCanonicalRecords({
    logStore,
    options: {
      projectId: input.projectId,
      containerId: input.containerId,
      filters: input.includeHypotheses ? { includeHypotheses: true } : undefined,
    },
  });

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const pages = renderWikiMarkdownProjection({
    projectId: input.projectId,
    containerId: input.containerId,
    generatedAt,
    filters: selection.filters,
    records: selection.records,
    includedCount: selection.includedCount,
    excludedCount: selection.excludedCount,
    excludedByReason: selection.excludedByReason,
  });
  const manifest = buildWikiMaterializerManifest({
    records: selection.records,
    projectId: input.projectId,
    containerId: input.containerId,
    generatedAt,
    filters: selection.filters,
    includedCount: selection.includedCount,
    excludedCount: selection.excludedCount,
    excludedByReason: selection.excludedByReason,
    materializerVersion: input.materializerVersion ?? "0.0.0",
  });
  const layoutOptions: WikiOutputLayoutOptions = {
    projectSlug: slugifyScopeId(input.projectId),
    containerSlug: slugifyScopeId(input.containerId),
    outputDir: input.outputDir,
  };

  const writeResult = await writeWikiMaterialization({ pages, manifest, layoutOptions });

  return {
    ...writeResult,
    generatedAt,
    manifest,
    pages,
    records: selection.records,
  };
}

function buildWikiMaterializerManifest(input: {
  readonly records: readonly WikiSelectedRecord[];
  readonly projectId: string;
  readonly containerId: string;
  readonly generatedAt: string;
  readonly filters: WikiMaterializerFilters;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly excludedByReason: Partial<Record<WikiMaterializerExclusionReason, number>>;
  readonly materializerVersion: string;
}): WikiMaterializerManifest {
  return {
    schemaVersion: wikiMaterializerSchemaVersion,
    materializerVersion: input.materializerVersion,
    projectId: input.projectId,
    containerId: input.containerId,
    generatedAt: input.generatedAt,
    filters: input.filters,
    records: input.records.map((record) => toManifestRecord(record)),
    includedCount: input.includedCount,
    excludedCount: input.excludedCount,
    ...(Object.keys(input.excludedByReason).length > 0 ? { excludedByReason: input.excludedByReason } : {}),
  };
}

function toManifestRecord(record: WikiSelectedRecord): WikiMaterializerManifestRecord {
  const sourceSlug = slugifyWikiMaterializerSource({ id: record.id, source: record.source });

  return {
    id: record.id,
    kind: record.kind,
    pagePath: `records/${record.id}.md`,
    source: record.source,
    sourceSlug,
    recordHash: record.recordHash,
    contentHash: hashWikiMaterializerContent(record),
    createdAt: record.createdAt,
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    ...(record.verifiedAt ? { verifiedAt: record.verifiedAt } : {}),
  };
}

function hashWikiMaterializerContent(record: Pick<WikiSelectedRecord, "content" | "summary" | "tags" | "verificationStatus" | "reviewStatus" | "verifiedAt" | "verificationEvidence">): string {
  return createHash("sha256").update(JSON.stringify({
    content: record.content,
    summary: record.summary ?? null,
    tags: record.tags,
    verificationStatus: record.verificationStatus,
    reviewStatus: record.reviewStatus ?? null,
    verifiedAt: record.verifiedAt ?? null,
    verificationEvidence: record.verificationEvidence,
  })).digest("hex");
}

function slugifyScopeId(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .replace(/[\s/\\:?%*|"<>\u0000-\u001f]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return normalized.length > 0 ? normalized : "item";
}
