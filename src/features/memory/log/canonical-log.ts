import type { ListMemoriesInput, MemoryRecord } from "../types.js";

export interface CanonicalLogStore {
  append(record: MemoryRecord): Promise<void>;
  list(input: ListMemoriesInput): Promise<readonly MemoryRecord[]>;
  readAll(): Promise<readonly MemoryRecord[]>;
}
