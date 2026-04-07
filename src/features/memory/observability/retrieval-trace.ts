import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

import type { RetrievalTraceEntry } from "../types.js";

export class RetrievalTraceStore {
  public constructor(private readonly filePath: string) {}

  public async append(entry: RetrievalTraceEntry): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
