# /src overview

This is the high-level map of `oh-my-openagent/origin/src` from source.

## Top-level structure

- `index.ts` — plugin assembly root
- `plugin-config.ts` — config loading, migration, merge, validation
- `create-managers.ts` — creates runtime/state owners
- `create-tools.ts` — creates tool surface
- `create-hooks.ts` — creates hook families
- `plugin-interface.ts` — exposes host-facing handlers
- `create-runtime-tmux-config.ts` — tmux runtime gate and config parsing
- `cli/` — companion CLI commands such as `run`, `install`, `doctor`
- `plugin/` — OpenCode-facing handlers and hook composition
- `features/` — long-lived services and stateful feature modules
- `hooks/` — hook implementations for behavior, continuation, guards, and reminders
- `tools/` — executable tool implementations
- `agents/` — builtin agent definitions and dynamic prompt construction
- `config/` — schema/type boundary
- `mcp/` — built-in MCP integrations
- `openclaw/` — external event/runtime bridge
- `shared/` — shared utilities, caches, helpers, tmux helpers, model utilities
- `plugin-handlers/` — config hook pipeline pieces

## Major subsystem boundaries

### Composition root

Files:

- `src/index.ts`
- `src/create-managers.ts`
- `src/create-tools.ts`
- `src/create-hooks.ts`
- `src/plugin-interface.ts`

Purpose:

- build the whole plugin from config, managers, tools, and hooks

### Runtime services

Directories:

- `src/features/background-agent/`
- `src/features/tmux-subagent/`
- `src/features/skill-mcp-manager/`
- `src/features/opencode-skill-loader/`
- `src/features/context-injector/`

Purpose:

- own long-lived runtime state and service behavior

### Host-facing plugin layer

Directory:

- `src/plugin/`

Purpose:

- convert internal services and policies into OpenCode hook handlers

### Policy and continuation layer

Directory:

- `src/hooks/`

Purpose:

- inject behavior into session lifecycle, tool lifecycle, message transforms, continuation, and reminder flows

### Execution surface layer

Directory:

- `src/tools/`

Purpose:

- expose callable capabilities like delegation, background task output, interactive bash, session history, LSP, and skill tools

### Agent prompt layer

Directory:

- `src/agents/`

Purpose:

- define builtin agents, categories, and dynamic prompt assembly
