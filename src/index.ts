import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { MemoryService } from "./features/memory/memory-service.js";
import { createMemoryMcpServer } from "./features/memory/mcp/server.js";

async function main(): Promise<void> {
  const memoryService = await MemoryService.create();

  if (process.argv.includes("--reindex")) {
    await memoryService.reindex();
    console.error("Reindex complete.");
    return;
  }

  const server = createMemoryMcpServer(memoryService);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
