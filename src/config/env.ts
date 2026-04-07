import { paths } from "./paths.js";

export interface AppEnv {
  readonly appName: string;
  readonly embeddingDimensions: number;
  readonly dataPaths: typeof paths;
  readonly geminiCache: {
    readonly version: string;
    readonly ttlMs: number;
  };
}

export function getAppEnv(): AppEnv {
  return {
    appName: "mcp-memory-layer",
    embeddingDimensions: 128,
    dataPaths: paths,
    geminiCache: {
      version: "v1",
      ttlMs: 1000 * 60 * 60 * 24,
    },
  };
}
