import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getRegisteredOrchestrationTools } from "../../orchestration/mcp/register-tools.js";
import type { MemoryService } from "../memory-service.js";
import { getRegisteredResources } from "./register-resources.js";
import { getRegisteredMemoryTools } from "./register-tools.js";

export function createMemoryMcpServer(memoryService: MemoryService): McpServer {
  const server = new McpServer({
    name: "mahiro-mcp-memory-layer",
    version: "0.0.0",
  });

  const tools = [
    ...getRegisteredMemoryTools(memoryService),
    ...getRegisteredOrchestrationTools(),
  ];

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        const result = await tool.execute(args);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );
  }

  const resources = getRegisteredResources(memoryService);
  const recentResource = resources.find((resource) => resource.uri === "memory://recent");

  if (recentResource) {
    server.registerResource(
      "recent-memories",
      "memory://recent",
      {
        title: "Recent memories",
        description: "Recent memory records from the canonical log.",
        mimeType: "application/json",
      },
      async (uri) => {
        const data = await recentResource.read();

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      },
    );
  }

  server.registerResource(
    "project-memories",
    new ResourceTemplate("memory://projects/{projectId}", {
      list: undefined,
    }),
    {
      title: "Project memories",
      description: "Project-scoped memories from the canonical log.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const projectId = String(variables.projectId ?? "");
      const data = await memoryService.list({
        scope: "project",
        projectId,
        limit: 100,
      });

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
