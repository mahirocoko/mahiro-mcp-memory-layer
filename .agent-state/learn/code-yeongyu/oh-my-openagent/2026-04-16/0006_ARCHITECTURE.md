# oh-my-openagent — Architecture

## Scope and Evidence

- **Source analyzed**: `./origin/`
- **Primary anchors read**:
  - `origin/README.md`
  - `origin/AGENTS.md`
  - `origin/src/AGENTS.md`
  - `origin/package.json`
  - `origin/src/index.ts`
  - `origin/src/plugin-interface.ts`
  - `origin/src/create-managers.ts`
  - `origin/src/create-hooks.ts`
  - `origin/src/plugin/tool-registry.ts`

## What this repo is

`oh-my-openagent` is an OpenCode plugin and companion CLI for multi-agent orchestration. It is not just a prompt collection. The repo is built around a plugin runtime, a CLI runtime, tool composition, hook composition, background subagent execution, and Claude/OpenCode compatibility layers.

## Top-level structure

- `src/agents/` — builtin agent factories and prompt logic
- `src/cli/` — standalone CLI commands and runner flows
- `src/config/` — config schema and config model
- `src/features/` — reusable runtime subsystems
- `src/hooks/` — hook implementations
- `src/mcp/` — built-in MCP definitions
- `src/plugin/` — OpenCode adapter layer
- `src/tools/` — tool implementations

## Runtime composition chain

The core boot flow in `origin/src/index.ts` is:

1. load config via `origin/src/plugin-config.ts`
2. create managers via `origin/src/create-managers.ts`
3. create tools via `origin/src/create-tools.ts`
4. create hooks via `origin/src/create-hooks.ts`
5. create the plugin interface via `origin/src/plugin-interface.ts`

This is the cleanest architecture summary in the repo.

## Important boundaries

### Plugin boundary
- `origin/src/plugin-interface.ts`
- `origin/src/plugin/chat-message.ts`
- `origin/src/plugin/event.ts`

### Manager boundary
- `origin/src/create-managers.ts`
- `origin/src/features/background-agent/manager.ts`
- `origin/src/features/skill-mcp-manager/manager.ts`

### Tool boundary
- `origin/src/plugin/tool-registry.ts`
- `origin/src/tools/index.ts`

### Hook boundary
- `origin/src/create-hooks.ts`
- `origin/src/plugin/hooks/create-core-hooks.ts`
- `origin/src/plugin/hooks/create-continuation-hooks.ts`
- `origin/src/plugin/hooks/create-skill-hooks.ts`

## Architecture takeaway

The best mental model is: **plugin config and manager services feed tool + hook composition, which then gets exposed as one OpenCode plugin surface**. This repo behaves more like an agent runtime than a traditional library.
