# oh-my-openagent architecture notes

Source analyzed: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/`

## High-level shape

This repo is a Bun + TypeScript OpenCode plugin package with a bundled CLI.

- Package entry is declared in `origin/package.json`:
  - plugin/library entry: `dist/index.js`
  - types: `dist/index.d.ts`
  - CLI binary: `bin/oh-my-opencode.js`
- Build flow in `origin/package.json` compiles both:
  - `src/index.ts` -> plugin build
  - `src/cli/index.ts` -> CLI build

At a high level, the repo is organized around one plugin startup pipeline and one CLI startup pipeline.

## Directory structure

Top-level structure visible from the source tree and repo docs:

- `origin/src/` — primary TypeScript source
- `origin/packages/` — platform-specific compiled binaries
- `origin/script/` — build/schema/model-capability scripts
- `origin/docs/` — user-facing docs
- `origin/.sisyphus/` — internal rules/tasks/plans for the project itself

Inside `origin/src/`, the important architectural areas are:

- `src/index.ts` — plugin entry point and top-level wiring
- `src/cli/` — CLI entry and subcommands
- `src/config/` — config schema/types
- `src/plugin/` — OpenCode hook handlers and composition glue
- `src/plugin-handlers/` — config-hook pipeline
- `src/hooks/` — concrete hook implementations
- `src/tools/` — tool factories and tool implementations
- `src/features/` — subsystem modules such as background tasks, tmux, skill MCP, skill loading
- `src/openclaw/` — external runtime dispatch/integration
- `src/shared/` — reusable utilities used across the plugin

The codebase is modularized by responsibility: factories in the root `src/` compose subsystems, while implementation detail lives under `plugin/`, `hooks/`, `tools/`, and `features/`.

## Entry points

### 1. Plugin entry

Main plugin entry is `origin/src/index.ts`.

The exported default plugin function is `OhMyOpenCodePlugin`, and its control flow is explicit in that file:

1. initialize config context with `initConfigContext("opencode", null)`
2. load plugin config via `loadPluginConfig(ctx.directory, ctx)`
3. initialize telemetry with PostHog helpers from `src/shared/posthog`
4. optionally initialize OpenClaw via `initializeOpenClaw(pluginConfig.openclaw)`
5. optionally start tmux checks when tmux integration is enabled
6. create runtime helpers with:
   - `createRuntimeTmuxConfig(...)`
   - `createModelCacheState()`
7. create managers via `createManagers(...)`
8. create tools via `createTools(...)`
9. create hooks via `createHooks(...)`
10. create disposal logic via `createPluginDispose(...)`
11. create the OpenCode-facing interface via `createPluginInterface(...)`
12. return an object containing the hook handlers plus an explicit `experimental.session.compacting` implementation

That file is mainly orchestration glue, not business logic. Most real behavior is delegated into separate factories.

### 2. CLI entry

CLI entry is `origin/src/cli/index.ts`:

```ts
#!/usr/bin/env bun
import { runCli } from "./cli-program"

runCli()
```

`origin/src/cli/cli-program.ts` builds the Commander-based CLI and registers commands:

- `install`
- `run <message>`
- `get-local-version`
- `doctor`
- `refresh-model-capabilities`
- `version`
- `mcp-oauth`

So the plugin path and CLI path are separate entry surfaces that share the same underlying config/model/tool ecosystem.

## Core abstractions

### Plugin config

`origin/src/plugin-config.ts` is the config-loading core.

Important responsibilities in that file:

- detect canonical vs legacy config filenames
- load user config from the OpenCode config directory
- load project config from `.opencode/`
- parse JSONC via `parseJsonc(...)`
- validate with `OhMyOpenCodeConfigSchema`
- partially recover from invalid sections with `parseConfigPartially(...)`
- migrate legacy config files
- merge user + project configs with `mergeConfigs(...)`

The merge behavior is concrete in `mergeConfigs(...)`:

- `agents`, `categories`, and `claude_code` use deep merge
- arrays like `disabled_agents`, `disabled_hooks`, `disabled_tools`, `mcp_env_allowlist`, and `agent_definitions` are merged by set-union semantics
- everything else falls back to shallow override

This config object is the primary input to every later subsystem.

### Managers

`origin/src/create-managers.ts` constructs the runtime managers used across the plugin:

- `TmuxSessionManager`
- `BackgroundManager`
- `SkillMcpManager`
- `configHandler` via `createConfigHandler(...)`

This is where the repo wires cross-cutting runtime behavior together:

- tmux server health is marked when enabled
- tmux cleanup is registered for shutdown
- background subagent session creation is forwarded into tmux tracking
- background session creation can also dispatch OpenClaw runtime events
- task toast support is initialized with `initTaskToastManager(ctx.client)`

So this file is the runtime backbone that connects session lifecycle, background work, tmux state, and config application.

### Tool creation and registry

`origin/src/create-tools.ts` is a thin orchestrator around three abstractions:

- `createSkillContext(...)`
- `createAvailableCategories(...)`
- `createToolRegistry(...)`

The heavy lifting is in `origin/src/plugin/tool-registry.ts`.

That registry composes tools from multiple sources:

- `builtinTools`
- background-agent tools
- `call_omo_agent`
- search tools (`grep`, `glob`, AST-grep)
- session manager tools
- skill tool + skill MCP tool
- delegate-task tool
- optional task-system tools
- optional hashline-backed `edit` tool
- optional `interactive_bash`

Important design detail: `createToolRegistry(...)` is not just a static list. It derives the final tool surface from runtime/config state:

- disabled tools are filtered
- multimodal tools are removed if the related agent is disabled
- interactive bash depends on tmux/runtime capability
- task tools depend on `isTaskSystemEnabled(pluginConfig)`
- `edit` can be swapped for the hashline edit implementation when `pluginConfig.hashline_edit` is enabled
- tool count can be trimmed with `trimToolsToCap(...)`

This makes the tool layer a configurable façade over many underlying subsystems.

### Hook composition

`origin/src/create-hooks.ts` is the top-level hook composer. It merges three hook families:

- `createCoreHooks(...)`
- `createContinuationHooks(...)`
- `createSkillHooks(...)`

The structure is explicit in these files:

- `origin/src/plugin/hooks/create-core-hooks.ts`
- `origin/src/plugin/hooks/create-continuation-hooks.ts`
- `origin/src/plugin/hooks/create-skill-hooks.ts`

Core hooks are further split into:

- session hooks
- tool-guard hooks
- transform hooks

Continuation hooks include systems such as:

- todo continuation enforcement
- stop continuation guard
- compaction context/todo preservation
- unstable agent babysitting
- background notifications
- atlas hook

Skill hooks include:

- category skill reminders
- auto slash-command behavior

The composition layer matters because it turns many independent hook modules into one `hooks` object that the plugin interface consumes.

### Plugin interface

`origin/src/plugin-interface.ts` is the adapter from internal subsystems to the OpenCode plugin API.

It returns the actual hook handlers exposed to OpenCode:

- `tool`
- `chat.params`
- `chat.headers`
- `command.execute.before`
- `chat.message`
- `experimental.chat.messages.transform`
- `experimental.chat.system.transform`
- `config`
- `event`
- `tool.execute.before`
- `tool.execute.after`

This file is important because it shows the final contract: internal factories build handlers, then `createPluginInterface(...)` maps them into the OpenCode hook names.

### Config handler pipeline

`origin/src/plugin-handlers/config-handler.ts` is the config-hook orchestrator.

The sequential pipeline there is:

1. `setAdditionalAllowedMcpEnvVars(...)`
2. `applyProviderConfig(...)`
3. `clearFormatterCache()`
4. `loadPluginComponents(...)`
5. `applyAgentConfig(...)`
6. `applyToolConfig(...)`
7. `applyMcpConfig(...)`
8. `applyCommandConfig(...)`
9. restore original `config.formatter`

This is the main path by which the plugin mutates the host OpenCode config object. It is one of the central abstractions in the whole repo because it merges agents, tools, MCPs, and commands into the host runtime.

## Dependencies

From `origin/package.json`, the main external dependencies map cleanly to repo responsibilities:

- `@opencode-ai/plugin`, `@opencode-ai/sdk` — OpenCode plugin/runtime integration
- `commander`, `@clack/prompts` — CLI surface and interactive install flow
- `zod`, `jsonc-parser`, `js-yaml` — config/schema parsing and validation
- `@modelcontextprotocol/sdk` — MCP integration
- `@ast-grep/cli`, `@ast-grep/napi` — AST-aware search/replace tools
- `diff` — diff-oriented tooling
- `vscode-jsonrpc` — LSP/JSON-RPC integration
- `picomatch` — path and pattern matching
- `posthog-node` — telemetry
- `@code-yeongyu/comment-checker` — comment quality enforcement hook/tooling

The repo is Bun-first:

- build: `bun build ...`
- tests: `bun test`
- typecheck: `tsc --noEmit`

## Main control flow

### Plugin startup flow

Grounded in `src/index.ts`, the main plugin control flow is:

1. receive OpenCode plugin context `ctx`
2. set up config context and logging
3. detect plugin conflicts and inject auth into the client
4. dispose any previous active plugin instance
5. load merged plugin config from user + project config files
6. initialize optional telemetry and optional OpenClaw integration
7. compute tmux/model runtime state
8. create managers
9. create tools using skill context + category context + registry rules
10. create hooks using config-driven enable/disable rules
11. create disposal logic for managers/hooks/LSP
12. create the final plugin interface that OpenCode will call during runtime

After startup, most runtime behavior is event-driven through OpenCode hooks.

### Runtime event flow

Once initialized, `src/plugin-interface.ts` routes host callbacks into dedicated handler modules under `src/plugin/`.

Examples:

- `chat.message` -> `src/plugin/chat-message.ts`
- `event` -> `src/plugin/event.ts`
- `tool.execute.before` -> `src/plugin/tool-execute-before.ts`
- `tool.execute.after` -> `src/plugin/tool-execute-after.ts`

Those handler modules then invoke the composed hook objects and managers created at startup.

In other words:

OpenCode runtime event -> plugin interface handler -> hook/manager/tool subsystem -> optional background/tmux/OpenClaw side effects

### Background/task flow

The background execution path is centered on `BackgroundManager`, created in `src/create-managers.ts`, and surfaced into tools through `src/plugin/tool-registry.ts`.

Concrete wiring visible in the source:

- background tools are created in `createToolRegistry(...)`
- `call_omo_agent` is created with the `backgroundManager`
- `createDelegateTask(...)` also receives the `backgroundManager`
- when a subagent session is created, callbacks notify `TmuxSessionManager` and may dispatch an OpenClaw event

So the repo’s “parallel background agents” story is not a single module; it is a collaboration between `features/background-agent`, tool registration, tmux tracking, and event dispatch.

### CLI control flow

CLI flow is simpler:

1. `src/cli/index.ts` calls `runCli()`
2. `src/cli/cli-program.ts` configures Commander commands
3. each command delegates to its module, for example:
   - `install` -> `src/cli/install.ts`
   - `run` -> `src/cli/run/`
   - `doctor` -> `src/cli/doctor/`
   - `mcp-oauth` -> `src/cli/mcp-oauth/`

This keeps the CLI as a thin command router while implementation lives in subdirectories.

## How the repo is organized

The repo is organized as a composition-based plugin system:

- root factory files in `src/` create major subsystems
- `plugin/` adapts subsystems to OpenCode hook contracts
- `plugin-handlers/` handles host config mutation
- `hooks/` contains policy and runtime behavior units
- `tools/` exposes capabilities to the agent runtime
- `features/` contains stateful or multi-file subsystems such as tmux, background agents, and skill MCP management
- `cli/` provides installation and operational entrypoints outside the plugin runtime

The most important concrete files for understanding the repo are:

- `origin/src/index.ts`
- `origin/src/plugin-config.ts`
- `origin/src/create-managers.ts`
- `origin/src/create-tools.ts`
- `origin/src/plugin/tool-registry.ts`
- `origin/src/create-hooks.ts`
- `origin/src/plugin-interface.ts`
- `origin/src/plugin-handlers/config-handler.ts`
- `origin/src/cli/index.ts`
- `origin/src/cli/cli-program.ts`

## Short summary

This repo is not a single monolithic agent harness. It is a layered OpenCode plugin:

- config loading defines runtime behavior
- managers provide stateful subsystems
- tool registry exposes capabilities
- hook composition injects policy and lifecycle behavior
- plugin interface binds everything to OpenCode’s hook API
- CLI gives a separate operator-facing surface for install/run/doctor workflows

The main control flow is therefore: load config -> build managers -> build tools -> build hooks -> expose OpenCode handlers -> react to runtime events.
