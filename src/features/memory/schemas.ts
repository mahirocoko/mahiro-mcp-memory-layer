import { z } from "zod";

import { memoryKinds, memoryScopes, retrievalModes } from "./constants.js";

const memoryVerificationStatusSchema = z.enum(["hypothesis", "verified"]);
const memoryReviewStatusSchema = z.enum(["pending", "deferred", "rejected"]);
const memoryReviewActionSchema = z.enum(["reject", "defer", "edit_then_promote"]);
const memoryVerificationEvidenceSchema = z.object({
  type: z.enum(["human", "test", "trace", "issue", "link"]),
  value: z.string().trim().min(1),
  note: z.string().trim().min(1).optional(),
}).strict();
const memoryReviewDecisionSchema = z.object({
  action: memoryReviewActionSchema,
  decidedAt: z.string().trim().min(1),
  note: z.string().trim().min(1).optional(),
  evidence: z.array(memoryVerificationEvidenceSchema).optional(),
}).strict();

const sourceSchema = z.object({
  type: z.enum(["manual", "chat", "tool", "document", "system"]),
  uri: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
}).strict();

export const memoryRecordSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(memoryKinds),
  scope: z.enum(memoryScopes),
  verificationStatus: memoryVerificationStatusSchema.default("hypothesis"),
  reviewStatus: memoryReviewStatusSchema.optional(),
  reviewDecisions: z.array(memoryReviewDecisionSchema).optional(),
  verifiedAt: z.string().trim().min(1).optional(),
  verificationEvidence: z.array(memoryVerificationEvidenceSchema).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  source: sourceSchema,
  content: z.string().trim().min(1),
  summary: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)),
  importance: z.number().min(0).max(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1).optional(),
}).strict();

export const retrievalRowSchema = z.object({
  id: z.string().trim().min(1),
  content: z.string(),
  summary: z.string(),
  embedding: z.array(z.number()),
  kind: z.enum(memoryKinds),
  scope: z.enum(memoryScopes),
  verification_status: memoryVerificationStatusSchema.optional(),
  verificationStatus: memoryVerificationStatusSchema.optional(),
  review_status: memoryReviewStatusSchema.optional(),
  reviewStatus: memoryReviewStatusSchema.optional(),
  review_decisions: z.string().optional(),
  reviewDecisions: z.string().optional(),
  verified_at: z.string().optional(),
  verifiedAt: z.string().optional(),
  verification_evidence: z.string().optional(),
  verificationEvidence: z.string().optional(),
  project_id: z.string().optional(),
  projectId: z.string().optional(),
  container_id: z.string().optional(),
  containerId: z.string().optional(),
  importance: z.number(),
  created_at: z.string().optional(),
  createdAt: z.string().optional(),
  updated_at: z.string().optional(),
  updatedAt: z.string().optional(),
  source_type: z.string().optional(),
  sourceType: z.string().optional(),
  source_uri: z.string().optional(),
  sourceUri: z.string().optional(),
  source_title: z.string().optional(),
  sourceTitle: z.string().optional(),
  tags: z.string(),
  embedding_version: z.string().optional(),
  embeddingVersion: z.string().optional(),
  index_version: z.string().optional(),
  indexVersion: z.string().optional(),
}).passthrough();

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
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  source: sourceSchema,
  verificationStatus: memoryVerificationStatusSchema.optional(),
  reviewStatus: memoryReviewStatusSchema.optional(),
  reviewDecisions: z.array(memoryReviewDecisionSchema).optional(),
  verifiedAt: z.string().trim().min(1).optional(),
  verificationEvidence: z.array(memoryVerificationEvidenceSchema).optional(),
  summary: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  importance: z.number().min(0).max(1).optional(),
}).strict();

export const searchMemoriesInputSchema = z.object({
  query: z.string().trim().min(1),
  mode: z.enum(retrievalModes),
  scope: z.enum(memoryScopes),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
}).strict();

/** Object shape for MCP `build_context_for_task` (use `.shape`); use `buildContextForTaskInputSchema` for full parse + refinements. */
export const buildContextForTaskInputObjectSchema = z.object({
  task: z.string().trim().min(1),
  mode: z.enum(retrievalModes),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  maxItems: z.number().int().positive().max(50).optional(),
  maxChars: z.number().int().positive().max(50_000).optional(),
  /** When true, also run heuristic memory suggestions on `recentConversation` (same scope ids as this request). */
  includeMemorySuggestions: z.boolean().optional(),
  /** Recent user/assistant text for suggestion heuristics; required when `includeMemorySuggestions` is true. */
  recentConversation: z.string().optional(),
  suggestionMaxCandidates: z.number().int().positive().max(10).optional(),
}).strict();

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
  containerId: z.string().trim().min(1).optional(),
  source: upsertDocumentSourceSchema,
  content: z.string().trim().min(1),
  verificationStatus: memoryVerificationStatusSchema.optional(),
  reviewStatus: memoryReviewStatusSchema.optional(),
  reviewDecisions: z.array(memoryReviewDecisionSchema).optional(),
  verifiedAt: z.string().trim().min(1).optional(),
  verificationEvidence: z.array(memoryVerificationEvidenceSchema).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  summary: z.string().trim().min(1).optional(),
  importance: z.number().min(0).max(1).optional(),
}).strict();

export const listMemoriesInputSchema = z.object({
  scope: z.enum(memoryScopes).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  kind: z.enum(memoryKinds).optional(),
  limit: z.number().int().positive().max(100).optional(),
}).strict();

export const suggestMemoryCandidatesInputSchema = z.object({
  conversation: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  maxCandidates: z.number().int().positive().max(10).optional(),
}).strict();

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
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  maxCandidates: z.number().int().positive().max(10).optional(),
  suggestion: suggestMemoryCandidatesResultSchema.optional(),
  sourceOverride: sourceSchema.optional(),
  extraTags: z.array(z.string().trim().min(1)).optional(),
}).strict();

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
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  maxItems: z.number().int().positive().max(50).optional(),
  maxChars: z.number().int().positive().max(50_000).optional(),
}).strict();

export const wakeUpMemoryInputSchema = wakeUpMemoryInputObjectSchema;

export const resetMemoryStorageInputSchema = z.object({}).strict();

export const promoteMemoryInputSchema = z.object({
  id: z.string().trim().min(1),
  verificationStatus: z.literal("verified").optional(),
  evidence: z.array(memoryVerificationEvidenceSchema).min(1),
}).strict();

export const listReviewQueueInputSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
}).strict();

export const listReviewQueueOverviewInputSchema = listReviewQueueInputSchema;

export const getReviewAssistInputSchema = z.object({
  id: z.string().trim().min(1),
}).strict();

export const enqueueMemoryProposalInputSchema = z.object({
  conversation: z.string().optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  maxCandidates: z.number().int().positive().max(10).optional(),
  suggestion: suggestMemoryCandidatesResultSchema.optional(),
  sourceOverride: sourceSchema.optional(),
  extraTags: z.array(z.string().trim().min(1)).optional(),
}).strict().superRefine((data, ctx) => {
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
});

export const reviewMemoryInputSchema = z.object({
  id: z.string().trim().min(1),
  action: memoryReviewActionSchema,
  note: z.string().trim().min(1).optional(),
  evidence: z.array(memoryVerificationEvidenceSchema).optional(),
  content: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.action !== "edit_then_promote") {
    return;
  }

  if (!data.evidence || data.evidence.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "edit_then_promote requires evidence.",
      path: ["evidence"],
    });
  }
});

export const inspectMemoryRetrievalInputSchema = z.object({
  requestId: z.string().trim().min(1).optional(),
});
