import * as lancedb from "@lancedb/lancedb";

export async function connectToLanceDb(directoryPath: string) {
  return lancedb.connect(directoryPath);
}
