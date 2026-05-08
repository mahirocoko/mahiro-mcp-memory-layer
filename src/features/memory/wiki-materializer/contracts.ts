import path from "node:path";

import { paths } from "../../../config/paths.js";
import type {
  MemoryKind,
  MemoryReviewDecision,
  MemoryReviewStatus,
  MemoryScope,
  MemorySource,
  MemoryVerificationEvidence,
  MemoryVerificationStatus,
} from "../types.js";

export const wikiMaterializerSchemaVersion = 1 as const;

export const wikiOutputLayout = {
  stateDirectoryName: ".agent-state",
  wikiDirectoryName: "wiki",
  indexFileName: "index.md",
  logFileName: "log.md",
  manifestFileName: "manifest.json",
  recordsDirectoryName: "records",
  sourcesDirectoryName: "sources",
} as const;

export const wikiMaterializerFilterModes = ["verified_only", "include_hypotheses"] as const;
export const wikiGeneratedPageKinds = ["index", "log", "record", "source"] as const;
export const wikiMaterializerExclusionReasons = [
  "scope_mismatch",
  "unverified",
  "pending_review",
  "deferred_review",
  "rejected_review",
] as const;

export type WikiMaterializerFilterMode = (typeof wikiMaterializerFilterModes)[number];
export type WikiGeneratedPageKind = (typeof wikiGeneratedPageKinds)[number];
export type WikiMaterializerExclusionReason = (typeof wikiMaterializerExclusionReasons)[number];

export interface WikiMaterializerFilterFlags {
  readonly includeHypotheses: boolean;
  readonly includePendingReview: boolean;
  readonly includeDeferredReview: boolean;
  readonly includeRejectedReview: boolean;
}

export interface WikiMaterializerFilters {
  readonly mode: WikiMaterializerFilterMode;
  readonly includeVerificationStatuses: readonly MemoryVerificationStatus[];
  readonly excludeReviewStatuses: readonly MemoryReviewStatus[];
  readonly flags: WikiMaterializerFilterFlags;
}

export interface WikiMaterializerOptions {
  readonly projectId: string;
  readonly containerId: string;
  readonly projectSlug: string;
  readonly containerSlug: string;
  /** Overrides the final scope output directory for CLI/tests. Defaults to .agent-state/wiki/<projectSlug>/<containerSlug>/. */
  readonly outputDir?: string;
  readonly filters?: Partial<WikiMaterializerFilterFlags>;
}

export interface WikiSelectedRecord {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly scope: MemoryScope;
  readonly verificationStatus: MemoryVerificationStatus;
  readonly reviewStatus?: MemoryReviewStatus;
  readonly reviewDecisions: readonly MemoryReviewDecision[];
  readonly verifiedAt?: string;
  readonly verificationEvidence: readonly MemoryVerificationEvidence[];
  readonly projectId: string;
  readonly containerId: string;
  readonly source: MemorySource;
  readonly content: string;
  readonly summary?: string;
  readonly tags: readonly string[];
  readonly importance: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly recordHash: string;
}

export interface WikiMaterializerManifestRecord {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly pagePath: string;
  readonly source: MemorySource;
  readonly sourceSlug?: string;
  readonly recordHash: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly verifiedAt?: string;
}

export interface WikiMaterializerManifest {
  readonly schemaVersion: typeof wikiMaterializerSchemaVersion;
  readonly materializerVersion: string;
  readonly projectId: string;
  readonly containerId: string;
  readonly generatedAt: string;
  readonly filters: WikiMaterializerFilters;
  readonly records: readonly WikiMaterializerManifestRecord[];
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly excludedByReason?: Partial<Record<WikiMaterializerExclusionReason, number>>;
}

export const wikiMaterializerStalenessReasons = [
  "manifest_scope_mismatch",
  "manifest_schema_mismatch",
  "record_added",
  "record_removed",
  "record_hash_changed",
] as const;

export type WikiMaterializerStalenessReason = (typeof wikiMaterializerStalenessReasons)[number];

export interface WikiMaterializerStalenessChange {
  readonly reason: WikiMaterializerStalenessReason;
  readonly recordId?: string;
  readonly manifestRecordHash?: string;
  readonly currentRecordHash?: string;
}

export interface WikiMaterializerStalenessReport {
  readonly status: "fresh" | "stale";
  readonly manifestPath: string;
  readonly projectId: string;
  readonly containerId: string;
  readonly changes: readonly WikiMaterializerStalenessChange[];
}

export interface WikiGeneratedPage {
  readonly kind: WikiGeneratedPageKind;
  readonly relativePath: string;
  readonly title: string;
  readonly content: string;
  readonly sourceRecordIds: readonly string[];
}

export interface WikiOutputLayoutOptions {
  readonly projectSlug: string;
  readonly containerSlug: string;
  readonly outputDir?: string;
}

export interface WikiOutputLayout {
  readonly scopeDirectory: string;
  readonly indexFilePath: string;
  readonly logFilePath: string;
  readonly manifestFilePath: string;
  readonly recordsDirectory: string;
  readonly sourcesDirectory: string;
}

export const defaultWikiMaterializerFilterFlags = {
  includeHypotheses: false,
  includePendingReview: false,
  includeDeferredReview: false,
  includeRejectedReview: false,
} as const satisfies WikiMaterializerFilterFlags;

export const defaultWikiMaterializerFilters = {
  mode: "verified_only",
  includeVerificationStatuses: ["verified"],
  excludeReviewStatuses: ["pending", "deferred", "rejected"],
  flags: defaultWikiMaterializerFilterFlags,
} as const satisfies WikiMaterializerFilters;

export function resolveDefaultWikiRootDirectory(): string {
  return path.join(paths.appRoot, wikiOutputLayout.stateDirectoryName, wikiOutputLayout.wikiDirectoryName);
}

export function resolveDefaultWikiScopeDirectory(options: WikiOutputLayoutOptions): string {
  return path.join(resolveDefaultWikiRootDirectory(), options.projectSlug, options.containerSlug);
}

export function resolveWikiOutputDirectory(options: WikiOutputLayoutOptions): string {
  if (options.outputDir) {
    return path.resolve(options.outputDir);
  }

  return resolveDefaultWikiScopeDirectory(options);
}

export function resolveWikiOutputLayout(options: WikiOutputLayoutOptions): WikiOutputLayout {
  const scopeDirectory = resolveWikiOutputDirectory(options);

  return {
    scopeDirectory,
    indexFilePath: path.join(scopeDirectory, wikiOutputLayout.indexFileName),
    logFilePath: path.join(scopeDirectory, wikiOutputLayout.logFileName),
    manifestFilePath: path.join(scopeDirectory, wikiOutputLayout.manifestFileName),
    recordsDirectory: path.join(scopeDirectory, wikiOutputLayout.recordsDirectoryName),
    sourcesDirectory: path.join(scopeDirectory, wikiOutputLayout.sourcesDirectoryName),
  };
}
