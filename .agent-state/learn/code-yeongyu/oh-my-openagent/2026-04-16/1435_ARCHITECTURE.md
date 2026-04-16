# oh-my-openagent Architecture

## Summary

`oh-my-openagent` is organized as an OpenCode plugin with a separate CLI surface. The main runtime is built by composing config, managers, tools, hooks, and the final plugin interface.

## Entry points

- `origin/src/index.ts` — plugin composition root.
- `origin/src/cli/index.ts` — CLI entrypoint that calls `runCli()`.
- `origin/src/cli/cli-program.ts` — command registry for `install`, `run`, `get-local-version`, `doctor`, `refresh-model-capabilities`, `version`, and `mcp-oauth`.
- `origin/src/cli/run/runner.ts` — non-interactive run flow.

## Core composition chain

1. `origin/src/plugin-config.ts` loads and merges config from user/project sources.
2. `origin/src/create-managers.ts` creates runtime services.
3. `origin/src/create-tools.ts` builds the tool set.
4. `origin/src/create-hooks.ts` composes hook layers.
5. `origin/src/plugin-interface.ts` returns the OpenCode hook surface.

## Main abstractions

- `origin/src/plugin-interface.ts` — defines the plugin-facing hook surface (`tool`, `chat.params`, `chat.headers`, `chat.message`, `config`, `event`, `tool.execute.before`, `tool.execute.after`, and transforms).
- `origin/src/create-managers.ts` — manager layer for `TmuxSessionManager`, `BackgroundManager`, `SkillMcpManager`, and config handling.
- `origin/src/create-tools.ts` — tool assembly boundary built from skill context, categories, and the tool registry.
- `origin/src/plugin/tool-registry.ts` — central registry that wires background tools, delegation, skill MCP, task tools, and other utility tools.
- `origin/src/create-hooks.ts` — hook composition across core, continuation, and skill tiers.
- `origin/src/plugin-config.ts` and `origin/src/config/schema/oh-my-opencode-config.ts` — configuration contract and merge rules.

## Key subsystem boundaries

- `origin/src/openclaw/` — event bridge between plugin session events and OpenClaw dispatch.
- `origin/src/features/skill-mcp-manager/` — MCP client management for skill-embedded servers.
- `origin/src/tools/lsp/` — LSP transport and JSON-RPC integration.
- `origin/src/shared/posthog.ts` — telemetry wrapper and runtime metadata capture.
- `origin/src/cli/doctor/checks/dependencies.ts` — runtime dependency checks for tools like `ast-grep`.

## Dependencies that shape the design

- `package.json` declares the plugin/runtime dependencies, including OpenCode/OpenCode SDK, MCP, Zod, `vscode-jsonrpc`, `ast-grep`, and PostHog.
- `origin/src/plugin-config.ts` and `origin/src/config/schema/oh-my-opencode-config.ts` show that config schema and merge behavior are architectural contracts, not incidental helpers.
- `origin/src/index.ts` wires startup telemetry and OpenClaw initialization before the plugin interface is returned.

## Default-mode /learn note

I did not find a `/learn` source entrypoint in `origin/`. The concrete execution surface in this checkout is the plugin entry (`origin/src/index.ts`) plus the CLI `run` flow (`origin/src/cli/run/runner.ts`).

## Short conclusion

The repository is structured around a plugin-first architecture with a CLI runner alongside it. Most behavior flows through a small number of composition roots: config, managers, tools, hooks, and the final OpenCode interface.
