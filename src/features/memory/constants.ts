export const memoryKinds = ["fact", "conversation", "decision", "doc", "task"] as const;

export const memoryScopes = ["global", "user", "project", "session"] as const;

export const retrievalModes = ["profile", "query", "full", "recent"] as const;

export const defaultSearchLimit = 8;
export const defaultContextMaxItems = 10;
export const defaultContextMaxChars = 6000;
export const defaultVectorCandidateLimit = 24;
export const defaultKeywordCandidateLimit = 48;
