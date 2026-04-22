import { paths } from "./paths.js";

export interface AppEnv {
  readonly appName: string;
  readonly embeddingDimensions: number;
  readonly dataPaths: typeof paths;
}

export function getAppEnv(): AppEnv {
  return {
    appName: "mahiro-mcp-memory-layer",
    embeddingDimensions: 128,
    dataPaths: paths,
  };
}
