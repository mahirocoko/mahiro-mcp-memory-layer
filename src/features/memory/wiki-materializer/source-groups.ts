import type { WikiSelectedRecord } from "./contracts.js";
import type { MemorySource } from "../types.js";
import { slugifyWikiMaterializerSource } from "./utils.js";

export interface WikiMaterializerSourceIdentity {
  readonly type: MemorySource["type"];
  readonly uri?: string;
  readonly title?: string;
}

export interface WikiMaterializerSourceGroup {
  readonly slug: string;
  readonly identity: WikiMaterializerSourceIdentity;
  readonly records: readonly WikiSelectedRecord[];
}

export function buildWikiMaterializerSourceGroups(records: readonly WikiSelectedRecord[]): readonly WikiMaterializerSourceGroup[] {
  const groups = new Map<string, WikiSelectedRecord[]>();

  for (const record of records) {
    const key = wikiMaterializerSourceIdentityKey(toWikiMaterializerSourceIdentity(record));
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return Array.from(groups.values())
    .map((groupRecords) => {
      const sortedGroupRecords = sortWikiMaterializerRecords(groupRecords);
      const firstRecord = sortedGroupRecords[0];

      if (!firstRecord) {
        throw new Error("Source group unexpectedly had no records");
      }

      const identity = toWikiMaterializerSourceIdentity(firstRecord);

      return {
        slug: slugifyWikiMaterializerSource({ id: firstRecord.id, source: identity }),
        identity,
        records: sortedGroupRecords,
      };
    })
    .sort((left, right) => compareText(left.slug, right.slug));
}

export function buildWikiMaterializerSourceSlugMap(records: readonly WikiSelectedRecord[]): ReadonlyMap<string, string> {
  return new Map(buildWikiMaterializerSourceGroups(records).map((group) => [
    wikiMaterializerSourceIdentityKey(group.identity),
    group.slug,
  ]));
}

export function wikiMaterializerSourceSlugForRecord(
  record: WikiSelectedRecord,
  sourceSlugMap: ReadonlyMap<string, string>,
): string {
  const key = wikiMaterializerSourceIdentityKey(toWikiMaterializerSourceIdentity(record));
  const sourceSlug = sourceSlugMap.get(key);

  if (!sourceSlug) {
    throw new Error(`Source slug was not built for record: ${record.id}`);
  }

  return sourceSlug;
}

export function toWikiMaterializerSourceIdentity(record: Pick<WikiSelectedRecord, "source">): WikiMaterializerSourceIdentity {
  return {
    type: record.source.type,
    uri: record.source.uri,
    title: record.source.title,
  };
}

export function wikiMaterializerSourceIdentityKey(identity: WikiMaterializerSourceIdentity): string {
  return JSON.stringify({
    title: identity.title ?? null,
    type: identity.type,
    uri: identity.uri ?? null,
  });
}

export function sortWikiMaterializerRecords(records: readonly WikiSelectedRecord[]): readonly WikiSelectedRecord[] {
  return [...records].sort((left, right) => compareText(left.kind, right.kind)
    || compareText(left.source.uri ?? "", right.source.uri ?? "")
    || compareText(left.source.title ?? "", right.source.title ?? "")
    || compareText(left.createdAt, right.createdAt)
    || compareText(left.updatedAt ?? "", right.updatedAt ?? "")
    || compareText(left.id, right.id));
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
