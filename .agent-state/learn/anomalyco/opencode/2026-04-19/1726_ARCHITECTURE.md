# anomalyco/opencode architecture

## High-level shape

`anomalyco/opencode` is a Bun/Turbo monorepo whose center of gravity is the `packages/opencode` package, with multiple clients and integration surfaces around it.

- Root workspace definition: `origin/package.json`
- Core engine and CLI/server runtime: `origin/packages/opencode`
- Browser app client: `origin/packages/app`
- Marketing/docs website: `origin/packages/web`
- Desktop shell: `origin/packages/desktop-electron`
- Plugin API surface: `origin/packages/plugin`
- SDK surface: `origin/packages/sdk/js`
- Hosted/admin surfaces and cloud packaging: `origin/packages/console/*`, `origin/infra/*`, `origin/sst.config.ts`

The root `README.md` explicitly describes OpenCode as a **client/server architecture** where the TUI is only one possible client (`origin/README.md:131-137`). That statement matches the code layout: the repository is organized around a reusable backend/session engine with several frontends on top.

## Directory structure and organization philosophy

### 1. Monorepo as product platform

The root workspace is not “one app with helpers”; it is a platform repo with product, SDK, plugin, website, and desktop packages (`origin/package.json:22-28`). The dependency catalog at the root centralizes versions for `effect`, `ai`, `hono`, `solid-js`, `vite`, `drizzle-orm`, and other cross-cutting libraries (`origin/package.json:29-82`).

That tells you two things quickly:

1. architectural consistency matters across packages
2. the core runtime is expected to be embedded or consumed by multiple shells

### 2. `packages/opencode` is the real core

`origin/packages/opencode/package.json` exposes the `opencode` binary, contains the CLI/server scripts, and has imports for Bun-vs-Node adapters (`#db`, `#pty`, `#hono`) (`origin/packages/opencode/package.json:20-41`). This package is where the engine lives.

Within `origin/packages/opencode/src`, the subdirectories are organized by domain rather than by layer. Examples visible directly from the tree:

- `agent/` — agent definitions and prompt configuration
- `provider/` — model/provider abstraction layer
- `session/` — session state, prompting, retry, compaction, status, summaries
- `tool/` — builtin tool definitions, registry, schemas, prompt text
- `server/` — Hono routes, middleware, workspace routing, UI/server endpoints
- `control-plane/` — multi-workspace orchestration and sync plumbing
- `project/` — per-directory instance lifecycle and bootstrapping
- `storage/` — DB and migration layer
- `sync/`, `share/`, `permission/`, `command/`, `acp/`, `git/`, `worktree/` — supporting bounded contexts

This is not a classic MVC layout. It is a **domain-service architecture** with Effect services, instance-local state, and explicit boundaries around provider/tool/session/project concerns.

### 3. Frontends are deliberately split by job

- `origin/packages/app/package.json` exports a Solid/Vite app entry at `./src/index.ts` and includes both unit and Playwright e2e test flows.
- `origin/packages/web/package.json` is an Astro/Starlight site for docs/marketing.
- `origin/packages/desktop-electron/package.json` wraps the app in Electron.
- `origin/packages/plugin/package.json` exports plugin-facing modules (`./src/index.ts`, `./src/tool.ts`, `./src/tui.ts`).
- `origin/packages/sdk/js/package.json` exports client/server SDK entrypoints and a generated `v2` client/server surface.

The philosophy is: **one engine, many consumers**.

## Notable entry points

### Root/product entry points

- Workspace/dev commands: `origin/package.json:8-20`
  - `dev` runs `packages/opencode`
  - `dev:web` runs `packages/app`
  - `dev:desktop` runs `packages/desktop-electron`
  - `dev:console` runs `packages/console/app`

### CLI binary and process startup

- Binary shim: `origin/packages/opencode/bin/opencode`
  - detects platform/arch
  - looks for the packaged native binary in `node_modules`
  - supports override via `OPENCODE_BIN_PATH`
- Main runtime entry: `origin/packages/opencode/src/index.ts`
  - initializes logging and process metadata
  - performs one-time DB migration if needed
  - registers every top-level yargs command

`src/index.ts` is the single best “start here” file for understanding the engine surface. It wires commands like `run`, `serve`, `mcp`, `acp`, `web`, `session`, `plugin`, `db`, and others (`origin/packages/opencode/src/index.ts:157-179`).

### CLI interactive/non-interactive execution

- `origin/packages/opencode/src/cli/cmd/run.ts`

This is the major user-facing execution path for headless and scripted use. The file imports the SDK client, server, providers, agents, permissions, tools, and app runtime in one place (`origin/packages/opencode/src/cli/cmd/run.ts:10-29`), which is a good signal that `run` is where many subsystems meet.

### Server/API entry point

- `origin/packages/opencode/src/server/server.ts`

This builds the Hono app, applies middleware, mounts global routes, control-plane routes, instance routes, workspace routes, and UI routes, then exposes `listen()` and `openapi()`.

Important architectural detail: the server has two shapes.

1. **single workspace / fenced mode** when `OPENCODE_WORKSPACE_ID` is set (`origin/packages/opencode/src/server/server.ts:47-55`)
2. **control-plane mode** when the process owns workspace routing (`origin/packages/opencode/src/server/server.ts:57-69`)

That split is one of the clearest signs that OpenCode is designed for both local single-instance use and multi-workspace remote orchestration.

### Project-scoped instance bootstrap

- `origin/packages/opencode/src/cli/bootstrap.ts`
- `origin/packages/opencode/src/project/instance.ts`
- `origin/packages/opencode/src/project/bootstrap.ts`

These three files form the lifecycle entry for most real work:

- `cli/bootstrap.ts` wraps commands in `Instance.provide(...)`
- `project/instance.ts` resolves/caches a per-directory instance context
- `project/bootstrap.ts` eagerly initializes config, plugins, LSP, sharing, formatting, file watchers, VCS, and snapshots

This is the repo’s operational center: every project directory is treated as an **instance** with its own bootstrapped services and cleanup.

### Client package entry points

- Web app exports: `origin/packages/app/package.json:6-10`
- Docs/marketing site scripts: `origin/packages/web/package.json:6-13`
- Electron main bundle: `origin/packages/desktop-electron/package.json:12-25`
- Plugin exports: `origin/packages/plugin/package.json:11-15`
- SDK exports: `origin/packages/sdk/js/package.json:11-19`

## Core abstractions and how they relate

### `Instance`: per-project runtime boundary

The single most important abstraction for understanding the backend is `Instance` in `origin/packages/opencode/src/project/instance.ts`.

It provides:

- current `directory`
- `worktree`
- resolved `project` metadata
- async-local context propagation
- reload/dispose semantics
- containment checks for permission decisions

It is not just a helper. It is the **scope boundary** around almost every project-local service.

### Effect services + `InstanceState`

The codebase uses `effect` heavily. Services are declared with `Context.Service` and layered with `Layer.effect`, for example:

- `SessionProcessor.Service` in `origin/packages/opencode/src/session/processor.ts:78-93`
- `ToolRegistry.Service` in `origin/packages/opencode/src/tool/registry.ts:68-90`
- `Agent.Service` in `origin/packages/opencode/src/agent/agent.ts:70-81`
- `LLM.Service` in `origin/packages/opencode/src/session/llm.ts:53-64`

`InstanceState.make(...)` is used repeatedly to memoize state per instance rather than globally. You can see that pattern in:

- `tool/registry.ts:118-224`
- `agent/agent.ts:81-260`
- `command/index.ts:166-176`

This means OpenCode’s architecture is effectively **Effect service graph + per-project instance cache**.

### `Agent.Info`: execution persona + permissions + model defaults

`origin/packages/opencode/src/agent/agent.ts` defines `Agent.Info`, which combines:

- name / description
- mode (`subagent`, `primary`, `all`)
- permissions
- optional provider/model
- prompt
- model tuning options
- step limits

Built-in agents include `build`, `plan`, `general`, `explore`, `compaction`, `title`, and `summary` (`origin/packages/opencode/src/agent/agent.ts:108-234`).

This is a critical abstraction because it ties together user-visible behavior, system prompts, and permission boundaries. In OpenCode, an “agent” is not just a prompt preset; it is an execution policy object.

### `Provider`: model/provider virtualization layer

`origin/packages/opencode/src/provider/provider.ts` is another major core. It wraps many AI SDK providers and custom behaviors behind a unified service.

Concrete signs:

- dozens of provider SDKs are bundled in `BUNDLED_PROVIDERS` (`origin/packages/opencode/src/provider/provider.ts:92-117`)
- provider-specific loader logic exists for `anthropic`, `opencode`, `openai`, `xai`, `github-copilot`, `azure`, `amazon-bedrock`, etc. (`origin/packages/opencode/src/provider/provider.ts:141-257` and beyond)
- provider/model transforms are delegated to `provider/transform`

This layer exists so the rest of the system can reason in terms of `Provider.Model` and capabilities rather than raw vendor SDKs.

### `LLM`: request assembly + streaming + tool-call bridge

`origin/packages/opencode/src/session/llm.ts` is where model requests are actually assembled.

Its responsibilities include:

- build system prompt from agent + provider + user overrides (`session/llm.ts:99-111`)
- trigger plugin hooks for system text, params, and headers (`session/llm.ts:114-194`)
- merge model, provider, agent, and variant options (`session/llm.ts:126-179`)
- resolve tools and inject compatibility tools for certain providers (`session/llm.ts:196-228`)
- stream text/tool events back into the session pipeline

This is the main translation layer between OpenCode’s internal concepts and the external model APIs.

### `Tool.Def` and `ToolRegistry`

Tool contracts live in `origin/packages/opencode/src/tool/tool.ts`.

Each tool has:

- `id`
- `description`
- zod `parameters`
- `execute()` returning `title`, `metadata`, `output`, optional attachments

The wrapper in `tool.ts` also centralizes argument validation, tracing metadata, and output truncation (`origin/packages/opencode/src/tool/tool.ts:68-117`).

`origin/packages/opencode/src/tool/registry.ts` then assembles:

- builtin tools (`bash`, `read`, `glob`, `grep`, `edit`, `write`, `task`, `todo`, `skill`, `webfetch`, `websearch`, `codesearch`, `apply_patch`, optional `lsp`, optional `plan`)
- filesystem-discovered custom tools from configured directories (`tool/registry.ts:153-166`)
- plugin-contributed tools (`tool/registry.ts:168-173`)

This is the extensibility center of the backend.

### `SessionProcessor`: runtime event/state machine

`origin/packages/opencode/src/session/processor.ts` is the clearest representation of the inner loop.

It maintains context for:

- active tool calls
- blocking state
- snapshot state
- reasoning parts
- compaction and overflow flags

Then it consumes LLM stream events (`start`, reasoning deltas, tool-input-start, tool completion, errors, etc.) and mutates persisted session parts accordingly (`origin/packages/opencode/src/session/processor.ts:216-257` and further down the file).

If you want to understand “how a prompt becomes visible assistant output plus tool execution plus session persistence,” this is one of the highest-value files in the repo.

### `Command`: slash-command / prompt-template abstraction

`origin/packages/opencode/src/command/index.ts` builds a command registry from:

- builtin command templates (`init`, `review`)
- user config-defined commands
- MCP prompts
- skills

That means commands are not hardcoded CLI-only features; they are another prompt-producing abstraction layered into the same agent/session engine.

### `Workspace` / control plane

`origin/packages/opencode/src/control-plane/workspace.ts` manages workspace records, adapters, connection state, and session restore/replay across workspaces.

This is the file that most strongly reinforces the “OpenCode is not just a local terminal app” idea. It creates workspaces, boots remote/local adaptors, starts sync, and can replay session event history into a target workspace (`origin/packages/opencode/src/control-plane/workspace.ts:84-138`, `145-240`).

## Dependencies and transitive architectural patterns

### Primary stacks

From the root and `packages/opencode` manifests, the architectural stack is roughly:

- **Bun** for package/runtime tooling (`origin/package.json:7`, `origin/packages/opencode/package.json:8-19`)
- **Turbo** for workspace orchestration (`origin/package.json:15`, `96`)
- **Effect** for service composition, runtime layering, tracing, and scoped state (`origin/package.json:55`, `origin/packages/opencode/package.json:103-125`)
- **Vercel AI SDK + provider adapters** for model calls (`origin/packages/opencode/package.json:80-100`, `133-178`)
- **Hono** for HTTP/server routing (`origin/packages/opencode/package.json:106-109`, `150-151`)
- **Drizzle ORM + SQLite adapters** for persistence (`origin/packages/opencode/package.json:70-71`, `142-143`)
- **SolidJS/Vite** for the app client (`origin/packages/app/package.json:42-76`)
- **Astro/Starlight** for docs/web (`origin/packages/web/package.json:14-43`)
- **Electron** for desktop shell (`origin/packages/desktop-electron/package.json:26-65`)

### Architectural patterns that repeat

#### 1. Adapter split by runtime

`packages/opencode/package.json` uses import maps like `#db`, `#pty`, and `#hono` to swap Bun vs Node implementations (`origin/packages/opencode/package.json:26-41`). This is a strong signal that runtime portability is designed in, not retrofitted.

#### 2. Service graph instead of singleton modules

Instead of a giant singleton app object, the backend is composed from many Effect services with explicit dependencies. This makes the subsystem graph visible in code: for example `SessionProcessor.layer` declares exactly which services it needs (`origin/packages/opencode/src/session/processor.ts:80-93`).

#### 3. Per-instance state instead of global mutable state

The code repeatedly prefers `Instance` + `InstanceState` over “one process, one state bag”. That supports multiple workspaces/projects in one process and cleaner teardown/reload.

#### 4. Evented persistence and projection

The workspace/session code references bus events, sync events, restore/replay, SQL event tables, and projectors (`origin/packages/opencode/src/control-plane/workspace.ts:6-11`, `157-183`; `origin/packages/opencode/src/server/server.ts:11-18`). The system appears to lean on an event/projection model rather than simple request-local mutation.

#### 5. Extensibility through plugins, tools, skills, and MCP prompts

`tool/registry.ts`, `agent/agent.ts`, and `command/index.ts` all incorporate externally loaded behavior. OpenCode is designed so “prompt/runtime behavior” can be extended at several layers:

- tools
- commands
- skills
- plugins
- MCP prompts

## How control flow moves through the system

### CLI path

The most important local flow is:

1. `bin/opencode` resolves the platform-specific binary (`origin/packages/opencode/bin/opencode`)
2. `src/index.ts` starts process-level logging, migration, and yargs command registration
3. a command such as `run` is selected (`origin/packages/opencode/src/index.ts:157-179`)
4. `cli/bootstrap.ts` enters an `Instance` context for the chosen directory
5. `project/bootstrap.ts` initializes config, plugin, LSP, snapshot, VCS, etc.
6. agent/model/tool selection is assembled
7. `session/llm.ts` creates the model stream request
8. `session/processor.ts` consumes stream events and persists assistant/tool/reasoning parts
9. `tool/registry.ts` resolves builtin/plugin/custom tools when tool calls occur

That is the main “user asks → agent thinks → tools run → session persists” pipeline.

### Server/control-plane path

The main remote/multi-client flow is:

1. `server/server.ts` builds the Hono app
2. middleware handles auth/logging/compression/cors/fencing
3. routes dispatch either to global/control-plane or instance-bound handlers
4. workspace routing/middleware chooses the right project instance
5. the same underlying session/tool/provider/project services are used behind the HTTP/WebSocket edge

So the server is not a separate implementation. It is another shell over the same engine.

### Workspace restore/sync path

For distributed or remote use, `control-plane/workspace.ts` shows another flow:

1. create workspace record in DB
2. resolve an adaptor
3. provision the target environment
4. start sync
5. optionally replay persisted session events into that workspace

This is the clearest code path that turns OpenCode into a control plane rather than only a terminal app.

## What matters most for learning the codebase quickly

If I were onboarding an engineer fast, I would read in this order:

1. `origin/package.json`
   - understand the monorepo scope and package boundaries
2. `origin/README.md`
   - understand the intended product story: provider-agnostic, TUI-focused, client/server
3. `origin/packages/opencode/src/index.ts`
   - learn the top-level engine surface and command map
4. `origin/packages/opencode/src/project/instance.ts`
   - learn the per-project runtime model
5. `origin/packages/opencode/src/project/bootstrap.ts`
   - see what services are considered essential at startup
6. `origin/packages/opencode/src/agent/agent.ts`
   - understand agent personas, permissions, and prompts
7. `origin/packages/opencode/src/provider/provider.ts`
   - understand how model vendors are normalized
8. `origin/packages/opencode/src/session/llm.ts`
   - understand model request assembly and tool wiring
9. `origin/packages/opencode/src/session/processor.ts`
   - understand the actual execution loop and persisted message/tool state transitions
10. `origin/packages/opencode/src/tool/tool.ts` and `origin/packages/opencode/src/tool/registry.ts`
    - understand how tools are defined, wrapped, discovered, and gated
11. `origin/packages/opencode/src/server/server.ts`
    - understand how the engine is exposed over HTTP/WebSocket
12. `origin/packages/opencode/src/control-plane/workspace.ts`
    - understand the multi-workspace/control-plane story

## Practical mental model

The fastest useful mental model is:

- **Monorepo platform** at the top
- **`packages/opencode` engine** in the middle
- **`Instance` + Effect services** as the runtime skeleton
- **Agent + Provider + ToolRegistry + SessionProcessor** as the core execution loop
- **CLI/server/control-plane/app/desktop/plugin/sdk** as shells around the same backend

In short: OpenCode is architected less like a simple terminal CLI and more like an **agent runtime platform** with a shared backend, pluggable tools/prompts/providers, and multiple user interfaces layered on top.
