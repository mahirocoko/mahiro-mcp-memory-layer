import type { RegisteredTool } from "../../../lib/mcp/registered-tool.js";

const pluginFacadeToolNames = new Set([
  "start_agent_task",
  "get_orchestration_result",
  "supervise_orchestration_result",
  "get_orchestration_supervision_result",
]);

export function getRegisteredPluginFacadeTools(tools: readonly RegisteredTool[]): readonly RegisteredTool[] {
  return tools.filter((tool) => pluginFacadeToolNames.has(tool.name));
}
