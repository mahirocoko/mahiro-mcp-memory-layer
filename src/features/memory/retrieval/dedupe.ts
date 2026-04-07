import type { SearchMemoryItem } from "../types.js";

export function dedupeSearchItems(items: readonly SearchMemoryItem[]): readonly SearchMemoryItem[] {
  const seenIds = new Set<string>();
  const deduped: SearchMemoryItem[] = [];

  for (const item of items) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    deduped.push(item);
  }

  return deduped;
}
