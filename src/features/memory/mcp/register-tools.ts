import {
  rememberInputSchema,
  searchMemoriesInputSchema,
  buildContextForTaskInputObjectSchema,
  upsertDocumentInputSchema,
  listMemoriesInputSchema,
  suggestMemoryCandidatesInputSchema,
} from "../schemas.js";
import type { MemoryService } from "../memory-service.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";

export function getRegisteredMemoryTools(memoryService: MemoryService): readonly RegisteredTool[] {
  return [
    {
      name: "remember",
      description: "Write one scoped memory record.",
      inputSchema: rememberInputSchema.shape,
      execute: (input) => memoryService.remember(input as never),
    },
    {
      name: "search_memories",
      description: "Search scoped memories with keyword and vector retrieval.",
      inputSchema: searchMemoriesInputSchema.shape,
      execute: (input) => memoryService.search(input as never),
    },
    {
      name: "build_context_for_task",
      description:
        "Build a model-ready context bundle for a task. Optionally set includeMemorySuggestions plus recentConversation to also return heuristic save candidates (same scope ids), without writing storage.",
      inputSchema: buildContextForTaskInputObjectSchema.shape,
      execute: (input) => memoryService.buildContext(input as never),
    },
    {
      name: "upsert_document",
      description:
        "Store or refresh a document-shaped memory source. Idempotency matches scope plus source.uri and source.title; at least one of uri or title is required. Prefer a stable source.uri (e.g. file path or canonical URL); title-only identity can collide across different documents that share a title.",
      inputSchema: upsertDocumentInputSchema.shape,
      execute: (input) => memoryService.upsertDocument(input as never),
    },
    {
      name: "list_memories",
      description: "List stored memories for inspection.",
      inputSchema: listMemoriesInputSchema.shape,
      execute: (input) => memoryService.list(input as never),
    },
    {
      name: "suggest_memory_candidates",
      description:
        "Analyze conversation text and return durable-memory candidates (kind, suggested scope, reason, draft content) plus a save recommendation. Deterministic heuristics for agent/tool loops; does not write storage.",
      inputSchema: suggestMemoryCandidatesInputSchema.shape,
      execute: async (input) => memoryService.suggestMemoryCandidates(input as never),
    },
  ];
}
