import type { MemoryService } from "../memory-service.js";

export interface RegisteredResource {
  readonly uri: string;
  readonly read: () => Promise<unknown>;
}

export function getRegisteredResources(memoryService: MemoryService): readonly RegisteredResource[] {
  return [
    {
      uri: "memory://recent",
      read: () => memoryService.list({ limit: 20 }),
    },
    {
      uri: "memory://projects/{projectId}",
      read: () =>
        Promise.resolve({
          message: "Use the resource template with a concrete projectId via the MCP server.",
        }),
    },
  ];
}
