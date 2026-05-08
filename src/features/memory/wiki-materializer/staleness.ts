import { readFile } from "node:fs/promises";

import { JsonlLogStore } from "../log/jsonl-log-store.js";
import { paths } from "../../../config/paths.js";
import {
  resolveWikiOutputLayout,
  type WikiMaterializerManifest,
  type WikiMaterializerStalenessChange,
  type WikiMaterializerStalenessReport,
  wikiMaterializerSchemaVersion,
} from "./contracts.js";
import { buildWikiMaterializerManifest } from "./manifest.js";
import { selectWikiCanonicalRecords, type WikiCanonicalRecordReader } from "./selector.js";
import { slugifyWikiMaterializerScopeId } from "./utils.js";

export interface ValidateWikiMaterializerStalenessInput {
  readonly projectId: string;
  readonly containerId: string;
  readonly outputDir?: string;
  readonly manifestPath?: string;
  readonly logStore?: WikiCanonicalRecordReader;
}

export async function validateWikiMaterializerStaleness(
  input: ValidateWikiMaterializerStalenessInput,
): Promise<WikiMaterializerStalenessReport> {
  const manifestPath = input.manifestPath ?? resolveWikiOutputLayout({
    projectSlug: slugifyWikiMaterializerScopeId(input.projectId),
    containerSlug: slugifyWikiMaterializerScopeId(input.containerId),
    outputDir: input.outputDir,
  }).manifestFilePath;
  const savedManifest = await readWikiMaterializerManifest(manifestPath);
  const logStore = input.logStore ?? new JsonlLogStore(paths.canonicalLogFilePath);
  const changes: WikiMaterializerStalenessChange[] = [];

  if (savedManifest.schemaVersion !== wikiMaterializerSchemaVersion) {
    changes.push({ reason: "manifest_schema_mismatch" });
  }

  if (savedManifest.projectId !== input.projectId || savedManifest.containerId !== input.containerId) {
    changes.push({ reason: "manifest_scope_mismatch" });
  }

  const selection = await selectWikiCanonicalRecords({
    logStore,
    options: {
      projectId: input.projectId,
      containerId: input.containerId,
      filters: savedManifest.filters.flags,
    },
  });
  const currentManifest = buildWikiMaterializerManifest({
    records: selection.records,
    projectId: input.projectId,
    containerId: input.containerId,
    generatedAt: savedManifest.generatedAt,
    filters: selection.filters,
    includedCount: selection.includedCount,
    excludedCount: selection.excludedCount,
    excludedByReason: selection.excludedByReason,
    materializerVersion: savedManifest.materializerVersion,
  });

  changes.push(...compareManifestRecords(savedManifest, currentManifest));

  return {
    status: changes.length === 0 ? "fresh" : "stale",
    manifestPath,
    projectId: input.projectId,
    containerId: input.containerId,
    changes,
  };
}

async function readWikiMaterializerManifest(manifestPath: string): Promise<WikiMaterializerManifest> {
  const manifestText = await readFile(manifestPath, "utf8");
  return JSON.parse(manifestText) as WikiMaterializerManifest;
}

function compareManifestRecords(
  savedManifest: WikiMaterializerManifest,
  currentManifest: WikiMaterializerManifest,
): readonly WikiMaterializerStalenessChange[] {
  const changes: WikiMaterializerStalenessChange[] = [];
  const savedRecords = new Map(savedManifest.records.map((record) => [record.id, record]));
  const currentRecords = new Map(currentManifest.records.map((record) => [record.id, record]));

  for (const savedRecord of [...savedManifest.records].sort(compareManifestRecordIds)) {
    const currentRecord = currentRecords.get(savedRecord.id);

    if (!currentRecord) {
      changes.push({ reason: "record_removed", recordId: savedRecord.id, manifestRecordHash: savedRecord.recordHash });
      continue;
    }

    if (savedRecord.recordHash !== currentRecord.recordHash) {
      changes.push({
        reason: "record_hash_changed",
        recordId: savedRecord.id,
        manifestRecordHash: savedRecord.recordHash,
        currentRecordHash: currentRecord.recordHash,
      });
    }
  }

  for (const currentRecord of [...currentManifest.records].sort(compareManifestRecordIds)) {
    if (!savedRecords.has(currentRecord.id)) {
      changes.push({ reason: "record_added", recordId: currentRecord.id, currentRecordHash: currentRecord.recordHash });
    }
  }

  return changes;
}

function compareManifestRecordIds(left: { readonly id: string }, right: { readonly id: string }): number {
  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}
