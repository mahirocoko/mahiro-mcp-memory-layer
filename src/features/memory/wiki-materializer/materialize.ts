import { JsonlLogStore } from "../log/jsonl-log-store.js";
import { paths } from "../../../config/paths.js";
import {
  type WikiGeneratedPage,
  type WikiMaterializerManifest,
  type WikiOutputLayout,
  type WikiOutputLayoutOptions,
  type WikiSelectedRecord,
} from "./contracts.js";
import { buildWikiMaterializerManifest } from "./manifest.js";
import { renderWikiMarkdownProjection } from "./renderers.js";
import { selectWikiCanonicalRecords, type WikiCanonicalRecordReader } from "./selector.js";
import { slugifyWikiMaterializerScopeId } from "./utils.js";
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
    projectSlug: slugifyWikiMaterializerScopeId(input.projectId),
    containerSlug: slugifyWikiMaterializerScopeId(input.containerId),
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
