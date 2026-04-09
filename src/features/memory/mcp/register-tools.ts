import type { MemoryService } from "../memory-service.js";
import { getMemoryToolDefinitions } from "../lib/tool-definitions.js";
import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";

export function getRegisteredMemoryTools(memoryService: MemoryService): readonly RegisteredTool[] {
  return getMemoryToolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: (input) => tool.execute(memoryService, input),
  }));
}
