import { createHash } from "node:crypto";

import type { MemorySource } from "../types.js";
import type { WikiSelectedRecord } from "./contracts.js";

const slugReplacementPattern = /[\s/\\:?%*|"<>\u0000-\u001f]+/gu;
const slugTrimPattern = /^[._-]+|[._-]+$/g;
const slugCollapsePattern = /-+/g;
const diacriticPattern = /\p{Diacritic}+/gu;
const hashLength = 12;

export interface WikiMaterializerSourceSlugInput {
  readonly id: string;
  readonly source: MemorySource;
}

export type WikiMaterializerHashInput = Pick<
  WikiSelectedRecord,
  | "id"
  | "kind"
  | "scope"
  | "projectId"
  | "containerId"
  | "source"
  | "content"
  | "summary"
  | "tags"
  | "verificationStatus"
  | "reviewStatus"
  | "verifiedAt"
  | "verificationEvidence"
  | "updatedAt"
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const canonicalObject: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const canonicalValue = canonicalizeJsonValue(value[key]);

      if (canonicalValue !== undefined) {
        canonicalObject[key] = canonicalValue;
      }
    }

    return canonicalObject;
  }

  return String(value);
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function normalizeSlugBase(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(diacriticPattern, "")
    .toLowerCase()
    .replace(slugReplacementPattern, "-")
    .replace(slugCollapsePattern, "-")
    .replace(slugTrimPattern, "");

  return normalized.length > 0 ? normalized : "item";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, hashLength);
}

export function slugifyWikiMaterializerSource(input: WikiMaterializerSourceSlugInput): string {
  const title = input.source.title?.trim() ?? "";
  const uri = input.source.uri?.trim() ?? "";
  const slugBase = normalizeSlugBase(title || uri || `${input.source.type} source`);
  const collisionSeed = stableJsonStringify({
    source: {
      type: input.source.type,
      title: input.source.title ?? null,
      uri: input.source.uri ?? null,
    },
  });

  return `${slugBase}-${shortHash(collisionSeed)}`;
}

export function slugifyWikiMaterializerScopeId(value: string): string {
  return normalizeSlugBase(value);
}

export function hashWikiMaterializerRecord(record: WikiMaterializerHashInput): string {
  const projected = {
    id: record.id,
    kind: record.kind,
    scope: record.scope,
    projectId: record.projectId,
    containerId: record.containerId,
    source: record.source,
    content: record.content,
    summary: record.summary,
    tags: record.tags,
    verificationStatus: record.verificationStatus,
    reviewStatus: record.reviewStatus,
    verifiedAt: record.verifiedAt,
    verificationEvidence: record.verificationEvidence,
    updatedAt: record.updatedAt,
  };

  return createHash("sha256").update(stableJsonStringify(projected), "utf8").digest("hex");
}
