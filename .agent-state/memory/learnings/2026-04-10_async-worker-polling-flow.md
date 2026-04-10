# Lesson Learned

## Tags
- mcp
- async
- polling
- orchestration
- workers

## Summary
When direct MCP worker tools start hitting timeout pressure, the most practical fix is often not to hold the request open longer and not to delegate the waiting to a subagent. If the repo already has a durable async lifecycle and polling store, expose direct async aliases over that path instead. That keeps one source of truth for state transitions while giving callers a better API.

## Durable Note
Prefer `start -> requestId -> poll result` over `sleep until done` for long-running MCP worker flows. If orchestration already owns the lifecycle and result store, build thin async worker wrappers on top of it instead of inventing a second async backend.
