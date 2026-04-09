import { z } from "zod";

import { memoryKinds, memoryScopes, retrievalModes } from "./constants.js";

const sourceSchema = z.object({
  type: z.enum(["manual", "chat", "tool", "document", "system"]),
  uri: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
});

/** Identity for upsert_document: scope + (uri, title) pair. At least one of uri or title must be set. */
const upsertDocumentSourceSchema = sourceSchema.refine(
  (src) => src.uri !== undefined || src.title !== undefined,
  {
    message: "Provide at least one of source.uri or source.title so document identity is not empty.",
  },
);

export const rememberInputSchema = z.object({
  content: z.string().trim().min(1),
  kind: z.enum(memoryKinds),
  scope: z.enum(memoryScopes),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  source: sourceSchema,
  summary: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  importance: z.number().min(0).max(1).optional(),
});

export const searchMemoriesInputSchema = z.object({
  query: z.string().trim().min(1),
  mode: z.enum(retrievalModes),
  scope: z.enum(memoryScopes),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export const buildContextForTaskInputSchema = z
  .object({
    task: z.string().trim().min(1),
    mode: z.enum(retrievalModes),
    userId: z.string().trim().min(1).optional(),
    projectId: z.string().trim().min(1).optional(),
    containerId: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    maxItems: z.number().int().positive().max(50).optional(),
    maxChars: z.number().int().positive().max(50_000).optional(),
    /** When true, also run heuristic memory suggestions on `recentConversation` (same scope ids as this request). */
    includeMemorySuggestions: z.boolean().optional(),
    /** Recent user/assistant text for suggestion heuristics; required when `includeMemorySuggestions` is true. */
    recentConversation: z.string().optional(),
    suggestionMaxCandidates: z.number().int().positive().max(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.includeMemorySuggestions !== true) {
      return;
    }
    const trimmed = data.recentConversation?.trim();
    if (!trimmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recentConversation is required when includeMemorySuggestions is true.",
        path: ["recentConversation"],
      });
    }
  });

export const upsertDocumentInputSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  source: upsertDocumentSourceSchema,
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).optional(),
  summary: z.string().trim().min(1).optional(),
  importance: z.number().min(0).max(1).optional(),
});

export const listMemoriesInputSchema = z.object({
  scope: z.enum(memoryScopes).optional(),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  kind: z.enum(memoryKinds).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const suggestMemoryCandidatesInputSchema = z.object({
  conversation: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  maxCandidates: z.number().int().positive().max(10).optional(),
});
