# oh-my-openagent — API Surface

## Main public/runtime surfaces

### 1. Plugin surface

The OpenCode-facing plugin surface is assembled in:

- `origin/src/index.ts`
- `origin/src/plugin-interface.ts`

This exposes tool hooks, config hooks, event hooks, chat-message hooks, and tool lifecycle hooks.

### 2. CLI surface

The CLI starts at:

- `origin/src/cli/index.ts`
- `origin/src/cli/cli-program.ts`

The main command family includes install/run/doctor/version/model capability refresh/MCP OAuth flows.

### 3. Tool surface

The tool API lives behind `origin/src/plugin/tool-registry.ts`. Important capabilities include:

- `task`
- `call_omo_agent`
- `skill`
- `skill_mcp`
- background-task tools
- grep/glob/AST/LSP tools

### 4. Delegation surface

The most important runtime API is `task(...)` in `origin/src/tools/delegate-task/tools.ts`.

- `category=...` routes through category logic and ends up on `sisyphus-junior`
- `subagent_type=...` routes directly to named subagents
- `run_in_background=true` hands execution to `BackgroundManager`

### 5. MCP/integration surface

The repo also exposes integration through:

- built-in MCP definitions in `origin/src/mcp/index.ts`
- Claude-style MCP config loading
- skill-scoped MCP config and runtime MCP sessions

## Extension takeaway

This repo’s public surface is not a classic import/export SDK. Its real API is the combination of plugin hooks, CLI commands, tool registry entries, delegation rules, and MCP/skill integration boundaries.
