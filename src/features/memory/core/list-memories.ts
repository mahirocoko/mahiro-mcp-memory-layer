import { listMemoriesInputSchema } from "../schemas.js";
import type { CanonicalLogStore } from "../log/canonical-log.js";
import type { ListMemoriesInput, MemoryRecord } from "../types.js";

export async function listMemories(input: {
  readonly payload: ListMemoriesInput;
  readonly logStore: CanonicalLogStore;
}): Promise<readonly MemoryRecord[]> {
  const payload = listMemoriesInputSchema.parse(input.payload);
  return input.logStore.list(payload);
}
