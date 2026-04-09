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

/** Object shape for MCP `build_context_for_task` (use `.shape`); use `buildContextForTaskInputSchema` for full parse + refinements. */
export const buildContextForTaskInputObjectSchema = z.object({
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
});

export const buildContextForTaskInputSchema = buildContextForTaskInputObjectSchema.superRefine((data, ctx) => {
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

const memorySuggestionCandidateSchema = z.object({
  kind: z.enum(memoryKinds),
  scope: z.enum(memoryScopes),
  reason: z.string(),
  draftContent: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
});

export const suggestMemoryCandidatesResultSchema = z.object({
  recommendation: z.enum(["likely_skip", "consider_saving", "strong_candidate"]),
  signals: z.object({
    durable: z.array(z.string()),
    ephemeral: z.array(z.string()),
  }),
  candidates: z.array(memorySuggestionCandidateSchema),
});

export const applyConservativeMemoryPolicyInputObjectSchema = z.object({
  conversation: z.string().optional(),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  maxCandidates: z.number().int().positive().max(10).optional(),
  suggestion: suggestMemoryCandidatesResultSchema.optional(),
  sourceOverride: sourceSchema.optional(),
  extraTags: z.array(z.string().trim().min(1)).optional(),
});

export const applyConservativeMemoryPolicyInputSchema = applyConservativeMemoryPolicyInputObjectSchema.superRefine(
  (data, ctx) => {
    if (data.suggestion) {
      return;
    }
    const trimmed = data.conversation?.trim();
    if (!trimmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide `conversation` or a precomputed `suggestion` object.",
        path: ["conversation"],
      });
    }
  },
);

/** MCP `prepare_host_turn_memory`: same retrieval + suggestion inputs as `build_context_for_task` with suggestions always on; optional policy `sourceOverride` / `extraTags`. */
export const prepareHostTurnMemoryInputObjectSchema = buildContextForTaskInputObjectSchema
  .omit({ includeMemorySuggestions: true, recentConversation: true })
  .extend({
    recentConversation: z.string().trim().min(1),
    sourceOverride: applyConservativeMemoryPolicyInputObjectSchema.shape.sourceOverride,
    extraTags: applyConservativeMemoryPolicyInputObjectSchema.shape.extraTags,
  });

export const prepareHostTurnMemoryInputSchema = prepareHostTurnMemoryInputObjectSchema;

/** `wake_up_memory`: scope + optional limits; runs `profile` and `recent` builds internally (no suggestions). */
export const wakeUpMemoryInputObjectSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  maxItems: z.number().int().positive().max(50).optional(),
  maxChars: z.number().int().positive().max(50_000).optional(),
});

export const wakeUpMemoryInputSchema = wakeUpMemoryInputObjectSchema;
