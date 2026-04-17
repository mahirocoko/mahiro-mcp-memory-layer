import { paths } from "./paths.js";

export interface AppEnv {
  readonly appName: string;
  readonly embeddingDimensions: number;
  readonly dataPaths: typeof paths;
  readonly orchestrationRetention: {
    readonly ttlMs: number;
  };
  readonly geminiCache: {
    readonly version: string;
    readonly ttlMs: number;
  };
}

export function getAppEnv(): AppEnv {
  return {
    appName: "mahiro-mcp-memory-layer",
    embeddingDimensions: 128,
    dataPaths: paths,
    orchestrationRetention: {
      ttlMs: 1000 * 60 * 60 * 24 * 14,
    },
    geminiCache: {
      version: "v1",
      ttlMs: 1000 * 60 * 60 * 24,
    },
  };
}
