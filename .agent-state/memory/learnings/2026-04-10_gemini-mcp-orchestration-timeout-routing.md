# Lesson Learned

## Tags
- orchestration
- mcp
- gemini
- timeout
- routing

## Summary
When a workflow launched through the MCP orchestration entrypoint fails around 60 seconds with `MCP error -32001: Request timed out`, the safest fix may be to remove an unnecessary nested MCP hop instead of increasing worker timeouts. In this repo, the critical mistake was forcing MCP-origin workflows onto `workerRuntime: "mcp"`, which made the MCP SDK request timeout relevant even for jobs that should have used the default shell runtime inside the server process.

## Durable Note
Preserve explicit per-job runtime selection at the orchestration boundary. Default async orchestration should keep using shell-backed workers unless a job explicitly asks for MCP. If the observed timeout closely matches an SDK default, inspect the routing architecture before modifying execution budgets.
