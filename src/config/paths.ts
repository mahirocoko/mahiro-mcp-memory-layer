import { fileURLToPath } from "node:url";
import path from "node:path";

const currentFilePath = fileURLToPath(import.meta.url);
const configDirectory = path.dirname(currentFilePath);
const srcDirectory = path.dirname(configDirectory);
const appRoot = path.dirname(srcDirectory);
const dataDirectory = path.join(appRoot, "data");

export const paths = {
  appRoot,
  dataDirectory,
  cacheDirectory: path.join(dataDirectory, "cache"),
  logDirectory: path.join(dataDirectory, "log"),
  tracesDirectory: path.join(dataDirectory, "traces"),
  orchestrationResultDirectory: path.join(dataDirectory, "traces", "orchestration-results"),
  orchestrationSupervisionDirectory: path.join(dataDirectory, "traces", "orchestration-supervisions"),
  lanceDbDirectory: path.join(dataDirectory, "lancedb"),
  geminiCacheFilePath: path.join(dataDirectory, "cache", "gemini-cache.json"),
  canonicalLogFilePath: path.join(dataDirectory, "log", "canonical-log.jsonl"),
  retrievalTraceFilePath: path.join(dataDirectory, "traces", "retrieval-trace.jsonl"),
  orchestrationTraceFilePath: path.join(dataDirectory, "traces", "orchestration-trace.jsonl"),
} as const;
