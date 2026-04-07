import { z } from "zod";

import { memoryKinds, memoryScopes, retrievalModes } from "./constants.js";

const sourceSchema = z.object({
  type: z.enum(["manual", "chat", "tool", "document", "system"]),
  uri: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
});

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

export const buildContextForTaskInputSchema = z.object({
  task: z.string().trim().min(1),
  mode: z.enum(retrievalModes),
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  maxItems: z.number().int().positive().max(50).optional(),
  maxChars: z.number().int().positive().max(50_000).optional(),
});

export const upsertDocumentInputSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  containerId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  source: sourceSchema,
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
