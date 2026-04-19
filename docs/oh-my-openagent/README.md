# oh-my-openagent source notes

This folder summarizes what we found from the real source under:

- `.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/`

These notes are grounded in source reads, not in generated learn summaries.

## Files

- `src-overview.md` — top-level `/src` map and major subsystem boundaries
- `root-composition.md` — what the root composition files do and how the plugin boots
- `plugin-hooks-and-tools.md` — how `plugin/`, `hooks/`, and `tools/` fit together
- `orchestration-flow.md` — the real orchestration/control-flow path across background tasks, tmux, reminders, and CLI
- `background-agent-deep-map.md` — file-by-file role map of the async task engine
- `tmux-subagent-deep-map.md` — file-by-file role map of the tmux runtime owner
- `atlas-deep-map.md` — file-by-file role map of the continuation/control-policy layer

## Core takeaway

`oh-my-openagent` is easiest to understand as a layered system:

1. `src/index.ts` composes the system
2. managers own long-lived runtime state
3. tools expose executable capabilities
4. hooks inject policy, continuation, and guard behavior
5. `plugin-interface.ts` adapts the assembled system to the OpenCode host

The orchestration center is not a single file. It is the combination of:

- `features/background-agent/*` as the async execution engine
- `features/tmux-subagent/*` as the tmux runtime owner
- `hooks/atlas/*` and continuation hooks as the control-policy layer
- `hooks/background-notification/*` as the event/reminder bridge back into the session
