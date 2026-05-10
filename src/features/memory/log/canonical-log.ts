import type { ListMemoriesInput, ListReviewQueueInput, MemoryRecord } from "../types.js";

export interface CanonicalLogStore {
  append(record: MemoryRecord): Promise<void>;
  list(input: ListMemoriesInput): Promise<readonly MemoryRecord[]>;
  listReviewQueue(input: ListReviewQueueInput): Promise<readonly MemoryRecord[]>;
  readAll(): Promise<readonly MemoryRecord[]>;
  readById(id: string): Promise<MemoryRecord | undefined>;
  replaceRecordById(id: string, record: MemoryRecord): Promise<void>;
  replaceAll(records: readonly MemoryRecord[]): Promise<void>;
}
