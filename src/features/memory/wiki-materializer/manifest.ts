import { createHash } from "node:crypto";

import {
  type WikiMaterializerExclusionReason,
  type WikiMaterializerFilters,
  type WikiMaterializerManifest,
  type WikiMaterializerManifestRecord,
  type WikiSelectedRecord,
  wikiMaterializerSchemaVersion,
} from "./contracts.js";
import { buildWikiMaterializerSourceSlugMap, wikiMaterializerSourceSlugForRecord } from "./source-groups.js";

export interface BuildWikiMaterializerManifestInput {
  readonly records: readonly WikiSelectedRecord[];
  readonly projectId: string;
  readonly containerId: string;
  readonly generatedAt: string;
  readonly filters: WikiMaterializerFilters;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly excludedByReason: Partial<Record<WikiMaterializerExclusionReason, number>>;
  readonly materializerVersion: string;
}

export function buildWikiMaterializerManifest(input: BuildWikiMaterializerManifestInput): WikiMaterializerManifest {
  const sourceSlugMap = buildWikiMaterializerSourceSlugMap(input.records);

  return {
    schemaVersion: wikiMaterializerSchemaVersion,
    materializerVersion: input.materializerVersion,
    projectId: input.projectId,
    containerId: input.containerId,
    generatedAt: input.generatedAt,
    filters: input.filters,
    records: input.records.map((record) => toManifestRecord(record, sourceSlugMap)),
    includedCount: input.includedCount,
    excludedCount: input.excludedCount,
    ...(Object.keys(input.excludedByReason).length > 0 ? { excludedByReason: input.excludedByReason } : {}),
  };
}

function toManifestRecord(record: WikiSelectedRecord, sourceSlugMap: ReadonlyMap<string, string>): WikiMaterializerManifestRecord {
  const sourceSlug = wikiMaterializerSourceSlugForRecord(record, sourceSlugMap);

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

function hashWikiMaterializerContent(
  record: Pick<WikiSelectedRecord, "content" | "summary" | "tags" | "verificationStatus" | "reviewStatus" | "verifiedAt" | "verificationEvidence">,
): string {
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
