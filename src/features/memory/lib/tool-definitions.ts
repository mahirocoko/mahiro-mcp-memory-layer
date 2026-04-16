import type { ZodRawShape } from "zod";

import {
  inspectMemoryRetrievalInputSchema,
  applyConservativeMemoryPolicyInputObjectSchema,
  buildContextForTaskInputObjectSchema,
  listMemoriesInputSchema,
  prepareHostTurnMemoryInputObjectSchema,
  rememberInputSchema,
  searchMemoriesInputSchema,
  suggestMemoryCandidatesInputSchema,
  upsertDocumentInputSchema,
  wakeUpMemoryInputObjectSchema,
} from "../schemas.js";
import type { MemoryService } from "../memory-service.js";

export type MemoryToolBackend = Pick<
  MemoryService,
  | "remember"
  | "search"
  | "buildContext"
  | "upsertDocument"
  | "list"
  | "suggestMemoryCandidates"
  | "applyConservativeMemoryPolicy"
  | "prepareHostTurnMemory"
  | "wakeUpMemory"
  | "prepareTurnMemory"
  | "inspectMemoryRetrieval"
>;

export interface MemoryToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly execute: (backend: MemoryToolBackend, input: Record<string, unknown>) => Promise<unknown>;
}

const memoryToolDefinitions: readonly MemoryToolDefinition[] = [
  {
    name: "inspect_memory_retrieval",
    description:
      "Read the latest retrieval trace or inspect one by requestId to understand why memory hit, missed, or degraded.",
    inputSchema: inspectMemoryRetrievalInputSchema.shape,
    execute: (backend, input) => backend.inspectMemoryRetrieval(input as never),
  },
  {
    name: "remember",
    description: "Write one scoped memory record.",
    inputSchema: rememberInputSchema.shape,
    execute: (backend, input) => backend.remember(input as never),
  },
  {
    name: "search_memories",
    description: "Search scoped memories with keyword and vector retrieval.",
    inputSchema: searchMemoriesInputSchema.shape,
    execute: (backend, input) => backend.search(input as never),
  },
  {
    name: "build_context_for_task",
    description:
      "Build a model-ready context bundle for a task. Optionally set includeMemorySuggestions plus recentConversation to also return heuristic save candidates (same scope ids), without writing storage.",
    inputSchema: buildContextForTaskInputObjectSchema.shape,
    execute: (backend, input) => backend.buildContext(input as never),
  },
  {
    name: "upsert_document",
    description:
      "Store or refresh a document-shaped memory source. Idempotency matches scope plus source.uri and source.title; at least one of uri or title is required. Prefer a stable source.uri (e.g. file path or canonical URL); title-only identity can collide across different documents that share a title.",
    inputSchema: upsertDocumentInputSchema.shape,
    execute: (backend, input) => backend.upsertDocument(input as never),
  },
  {
    name: "list_memories",
    description: "List stored memories for inspection.",
    inputSchema: listMemoriesInputSchema.shape,
    execute: (backend, input) => backend.list(input as never),
  },
  {
    name: "suggest_memory_candidates",
    description:
      "Analyze conversation text and return durable-memory candidates (kind, suggested scope, reason, draft content) plus a save recommendation. Deterministic heuristics for agent/tool loops; does not write storage.",
    inputSchema: suggestMemoryCandidatesInputSchema.shape,
    execute: (backend, input) => Promise.resolve(backend.suggestMemoryCandidates(input as never)),
  },
  {
    name: "apply_conservative_memory_policy",
    description:
      "One-call conservative save policy: runs the same heuristics as suggest_memory_candidates (unless `suggestion` is provided), then strong_candidate → auto-remember complete-scope candidates; consider_saving → review-only suggestions (no writes); likely_skip → no action. Prefer this over ad-hoc save logic in agent loops.",
    inputSchema: applyConservativeMemoryPolicyInputObjectSchema.shape,
    execute: (backend, input) => backend.applyConservativeMemoryPolicy(input as never),
  },
  {
    name: "prepare_host_turn_memory",
    description:
      "Host integration: one call with task + recentConversation + scope ids — builds retrieval context (same as build_context_for_task with memory suggestions on), then applies conservative_memory_policy using that suggestion snapshot so heuristics run once. Returns context fields plus memorySuggestions and conservativePolicy (auto-saves only strong_candidate with complete scope ids).",
    inputSchema: prepareHostTurnMemoryInputObjectSchema.shape,
    execute: (backend, input) => backend.prepareHostTurnMemory(input as never),
  },
  {
    name: "wake_up_memory",
    description:
      "Product wake-up: same scope + limits as build_context_for_task, but runs two retrieval passes internally — profile mode and recent mode — and returns wakeUpContext (combined) plus profile and recent sections (each matches one build_context_for_task result). No memory suggestions or conservative policy.",
    inputSchema: wakeUpMemoryInputObjectSchema.shape,
    execute: (backend, input) => backend.wakeUpMemory(input as never),
  },
  {
    name: "prepare_turn_memory",
    description:
      "Alias for prepare_host_turn_memory: identical inputs and behavior (retrieval + suggestions + conservative policy in one call).",
    inputSchema: prepareHostTurnMemoryInputObjectSchema.shape,
    execute: (backend, input) => backend.prepareTurnMemory(input as never),
  },
];

export function getMemoryToolDefinitions(): readonly MemoryToolDefinition[] {
  return memoryToolDefinitions;
}
