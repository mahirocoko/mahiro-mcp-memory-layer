# Claude Hooks Compatibility Notes from oh-my-openagent

This note records what we learned from studying `code-yeongyu/oh-my-openagent` and the official Claude Code / OpenCode docs. It is research context only: this package remains a memory layer and should not claim ownership of hook execution or workflow-control features.

## Core finding

`oh-my-openagent` does not run Claude Code to get hook behavior. It implements a Claude Code hooks compatibility layer on top of OpenCode plugin events.

The important bridge is:

| Claude Code hook | OpenCode primitive |
| --- | --- |
| `PreToolUse` | `tool.execute.before` |
| `PostToolUse` | `tool.execute.after` |
| `UserPromptSubmit` | `chat.message` |
| `Stop` | generic `event`, filtered to `session.idle` |
| `PreCompact` | `experimental.session.compacting` |

In `oh-my-openagent`, the main files are under `src/hooks/claude-code-hooks/`, especially:

- `claude-code-hooks-hook.ts`
- `config.ts`
- `pre-tool-use.ts`
- `post-tool-use.ts`
- `user-prompt-submit.ts`
- `stop.ts`
- `pre-compact.ts`
- `dispatch-hook.ts`

Plugin assembly happens through `src/plugin/hooks/create-transform-hooks.ts`, where the `claude-code-hooks` hook is enabled or disabled as part of the OpenCode plugin hook set.

## Configuration model

The compatibility layer reads Claude-style hook configuration from:

1. `${CLAUDE_CONFIG_DIR || ~/.claude}/settings.json`
2. `./.claude/settings.json`
3. `./.claude/settings.local.json`

The expected shape follows Claude Code settings:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/check.sh"
          }
        ]
      }
    ]
  }
}
```

`oh-my-openagent` also accepts `pattern` as an alias for `matcher`.

## Execution model

The bridge translates OpenCode events into Claude-shaped hook input, then dispatches the hook:

- `type: "command"` receives JSON on stdin.
- `type: "http"` receives the same JSON as an HTTP POST body.
- `$CLAUDE_PROJECT_DIR` is expanded and exported for command hooks.
- Tool names are normalized toward Claude-style names, for example `todowrite` -> `TodoWrite` and `webfetch` -> `WebFetch`.
- Tool input keys are converted to snake_case.
- Runtime transcript and todo compatibility data are written under Claude-style locations such as `~/.claude/transcripts` and `~/.claude/todos`.

For policy behavior, `PreToolUse` can block by throwing through the OpenCode `tool.execute.before` path. It can also mutate tool input through Claude-style `hookSpecificOutput.updatedInput`.

## Supported subset

The observed runtime subset is intentionally much smaller than the current Claude Code hooks reference.

Implemented in the compatibility layer:

- `PreToolUse`
- `PostToolUse`
- `UserPromptSubmit`
- `Stop`
- `PreCompact`

Not observed as implemented runtime hooks in the bridge:

- `SessionStart`
- `SessionEnd`
- `Notification`
- `SubagentStart`
- `SubagentStop`
- `PermissionRequest`
- `PermissionDenied`
- `PostToolUseFailure`
- `PostToolBatch`
- `FileChanged`
- other newer Claude hook lifecycle events

This means the useful pattern is not full Claude parity. The useful pattern is a focused compatibility subset mapped onto OpenCode plugin primitives.

## OpenCode-side lesson

OpenCode already exposes the right primitives for the most important subset:

- plugin callbacks for tool interception
- generic session events
- compaction customization
- permissions for static policy
- commands, custom tools, and agents for explicit extension points

What OpenCode does not provide as a first-class documented equivalent is Claude's complete hook DSL: event matcher groups, handler types such as prompt/agent/MCP-tool hooks, and a universal structured hook decision schema.

So the practical architecture is:

1. Keep OpenCode as the runtime.
2. Add a plugin-level compatibility adapter.
3. Read Claude-style hook settings.
4. Convert OpenCode events into Claude-shaped JSON.
5. Execute command/HTTP hooks.
6. Translate the result back into OpenCode behavior.

## Boundary for this repo

This repository is `mahiro-mcp-memory-layer`. Its product boundary is memory: durable memory writes, retrieval, context assembly, retrieval inspection, memory review flows, and plugin-native continuity helpers.

These notes are useful because memory continuity may need to understand host lifecycle events, but this package should not promise or own:

- Claude Code hook execution
- OpenCode workflow automation
- command/HTTP hook dispatch
- permission enforcement outside memory tools
- a Claude hooks compatibility runtime

If this knowledge is used later, it should guide integration with an OpenCode host plugin or a separate compatibility package, not expand the memory layer beyond its memory boundary.

## Takeaways

- The best model is an adapter, not a Claude Code dependency.
- Start with the same subset as `oh-my-openagent`: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, and `PreCompact`.
- Treat full Claude hooks parity as a later compatibility project, not the default target.
- Keep memory-facing helpers separate from hook execution. Memory can consume lifecycle context, but should not become the lifecycle runtime.
