# Lesson: Keep Claude hooks compatibility as an adapter boundary

**Date**: 2026-05-04
**Tags**: opencode, claude-code, hooks, compatibility, architecture-boundary, memory-layer

Studying `code-yeongyu/oh-my-openagent` showed that Claude hooks compatibility does not require running Claude Code. The stronger pattern is an adapter layer on top of OpenCode plugin events: map `tool.execute.before` to `PreToolUse`, `tool.execute.after` to `PostToolUse`, `chat.message` to `UserPromptSubmit`, `session.idle` to `Stop`, and `experimental.session.compacting` to `PreCompact`.

For `mahiro-mcp-memory-layer`, this is research context rather than scope expansion. Memory continuity can benefit from knowing host lifecycle concepts, but this package should not own command/HTTP hook dispatch, permission enforcement, or a Claude hooks runtime. If compatibility becomes a product goal, it belongs in an OpenCode host plugin or a separate compatibility package.

Durable takeaway: preserve the adapter idea and the boundary together. The technical insight is only safe if it does not dilute the package identity.
