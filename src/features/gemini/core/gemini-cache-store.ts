export interface GeminiCacheStore {
  get(key: string): Promise<GeminiCacheEntry | undefined>;
  set(key: string, value: GeminiCacheEntry): Promise<void>;
}

export interface GeminiCacheEntry {
  readonly response: string;
  readonly model?: string;
  readonly cachedTokens?: number;
}
