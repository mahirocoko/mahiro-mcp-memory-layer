# anomalyco/opencode API surface and integration boundaries

Source analyzed from:

- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/anomalyco/opencode/origin/`

This repo is a monorepo. The public integration surface is split across the CLI/runtime package, the JS SDK, the plugin API package, and editor/client integrations.

## 1. Public CLI surface

### Primary CLI entrypoint

- Binary wrapper: `packages/opencode/bin/opencode`
- Main command registry: `packages/opencode/src/index.ts`
- Package manifest exposing the CLI: `packages/opencode/package.json`
  - `bin.opencode = ./bin/opencode`

The bin wrapper is a launcher/shim. It picks the right platform binary/package and forwards argv unchanged. That file is operational packaging glue, not the behavioral API.

### Registered top-level commands

`packages/opencode/src/index.ts` is the authoritative command registry. It wires these user-facing commands into yargs:

- `acp`
- `mcp`
- `thread` / TUI thread command
- `attach`
- `run`
- `generate`
- `debug`
- `account`
- `providers`
- `agent`
- `upgrade`
- `uninstall`
- `serve`
- `web`
- `models`
- `stats`
- `export`
- `import`
- `github`
- `pr`
- `session`
- `plugin` / `plug`
- `db`

Important global options defined there:

- `--print-logs`
- `--log-level`
- `--pure` (disables external plugins by setting `OPENCODE_PURE=1`)
- standard `--help` / `--version`
- shell completion via `completion`

### Notable command boundaries

- `packages/opencode/src/cli/cmd/serve.ts`: headless server mode. This is a real integration boundary because the SDK starts and talks to this server.
- `packages/opencode/src/cli/cmd/acp.ts`: ACP server over stdio, backed by the local OpenCode server.
- `packages/opencode/src/cli/cmd/mcp.ts`: end-user MCP management surface (`add`, `list`, `auth`, `logout`, `debug`).
- `packages/opencode/src/cli/cmd/plug.ts`: plugin install/config update UX. This is public CLI behavior over internal plugin install/config machinery.
- `packages/opencode/src/cli/cmd/run.ts`: non-interactive run mode; also reveals the built-in tool vocabulary it renders (`glob`, `grep`, `read`, `write`, `edit`, `webfetch`, `bash`, `skill`, `todo`, task/subagent execution, etc.).

### Stable vs internal for CLI

More stable:

- command names and flags registered in `packages/opencode/src/index.ts`
- documented install/use flows in root `README.md`
- `serve`, `acp`, `mcp`, `plugin`, `run` as integration entrypoints

Likely internal / subject to churn:

- most files under `packages/opencode/src/**` that implement commands, providers, session processing, storage, prompt building, and tool execution
- startup migration behavior in `packages/opencode/src/index.ts`
- internal process env conventions except where clearly used as integration points

## 2. Public JS/TS SDK surface

### Published package exports

Package: `packages/sdk/js/package.json`

Exported entrypoints:

- `@opencode-ai/sdk`
- `@opencode-ai/sdk/client`
- `@opencode-ai/sdk/server`
- `@opencode-ai/sdk/v2`
- `@opencode-ai/sdk/v2/client`
- `@opencode-ai/sdk/v2/gen/client`
- `@opencode-ai/sdk/v2/server`

### Handwritten SDK surface

- `packages/sdk/js/src/index.ts`
  - re-exports client/server
  - provides `createOpencode()` helper that starts a server and returns `{ client, server }`
- `packages/sdk/js/src/client.ts`
  - exports generated types
  - exports `createOpencodeClient()`
  - exports `OpencodeClient` and `OpencodeClientConfig`
- `packages/sdk/js/src/server.ts`
  - exports `createOpencodeServer()`
  - exports `createOpencodeTui()`
  - `createOpencodeServer()` shells out to `opencode serve`

This is a clear developer-facing integration surface: start a local server, create a typed client, or launch the TUI.

### Generated HTTP/API surface

The actual typed API contract is generated and exposed through:

- `packages/sdk/js/src/gen/sdk.gen.ts`
- `packages/sdk/js/src/v2/gen/sdk.gen.ts`

These generated clients expose concrete remote operations including, for example:

- global event subscription (`event`, `subscribe`)
- project/session CRUD (`list`, `create`, `status`, `messages`, `prompt`, `promptAsync`, `shell`, `command`, `diff`, `share`)
- config/provider operations (`get`, `update`, `providers`, OAuth callbacks)
- MCP and LSP operations (`mcp.status`, `mcp.add`, `mcp.connect`, `mcp.disconnect`, `lsp.status`)
- TUI control endpoints (`appendPrompt`, `openHelp`, `openSessions`, `showToast`, `publish`)

Concrete evidence:

- `packages/sdk/js/src/gen/sdk.gen.ts` exposes methods like `session.promptAsync`, `mcp.add`, `mcp.connect`, `lsp.status`, `tui.appendPrompt`
- `packages/sdk/js/src/v2/gen/sdk.gen.ts` additionally exposes `health`, `skills`, richer permission/session reply flows, and the same TUI/MCP control family

### Stable vs internal for SDK

More stable:

- package export map in `packages/sdk/js/package.json`
- `createOpencodeClient()`, `createOpencodeServer()`, `createOpencodeTui()`, `createOpencode()`
- generated client classes/types as the intended consumer contract

Less stable:

- direct imports from generated internals such as `src/gen/core/*` or `src/gen/client/*`
- implementation details in `packages/sdk/js/src/process.ts`
- exact server boot parsing logic (`"opencode server listening ..."`) in `src/server.ts`

## 3. Plugin and extension architecture

### Public plugin package

Package: `packages/plugin/package.json`

Published exports:

- `@opencode-ai/plugin`
- `@opencode-ai/plugin/tool`
- `@opencode-ai/plugin/tui`

### Server/plugin hook API

Primary contract: `packages/plugin/src/index.ts`

Key public types:

- `PluginInput`
- `PluginOptions`
- `Config`
- `Plugin`
- `PluginModule`
- `Hooks`
- `AuthHook`
- `ProviderHook`
- `WorkspaceAdaptor`

Important hook points in `Hooks`:

- `event`
- `config`
- `tool`
- `auth`
- `provider`
- `chat.message`
- `chat.params`
- `chat.headers`
- `permission.ask`
- `command.execute.before`
- `tool.execute.before`
- `tool.execute.after`
- `shell.env`
- `tool.definition`
- several `experimental.*` hooks such as message/system transforms and compaction hooks

This file is the clearest stable plugin author boundary in the repo.

### Tool authoring helper

`packages/plugin/src/tool.ts` exposes the plugin tool authoring helper:

- `tool({...})`
- `tool.schema = z`
- `ToolContext`
- `ToolDefinition`

That is a deliberately tiny public contract for adding tools from plugins.

### TUI extension surface

`packages/plugin/src/tui.ts` exports a large typed TUI extension contract, including:

- routes (`TuiRouteDefinition`)
- slash/command palette items (`TuiCommand`)
- keybinding abstractions (`TuiKeybindSet`)
- dialog APIs
- prompt references/types
- theme and renderer types

This looks intended for TUI plugin authors, but parts labeled `Tui*` are extension-facing while the exact shape may evolve faster than the minimal server/plugin hook API.

### Plugin loading/config integration

Consumer-facing config behavior is visible in:

- `packages/opencode/src/config/plugin.ts`
- `packages/opencode/src/plugin/index.ts`

Concrete boundaries:

- plugins can be declared as strings or `[specifier, options]`
- local file plugins are auto-discovered from `{plugin,plugins}/*.{ts,js}` relative to a config dir
- path-like specs are normalized relative to the config file that declared them
- plugin loading supports both direct server-function exports and module objects with a `server` export
- plugin execution is intentionally sequential for deterministic hook order
- `experimental_workspace.register(type, adaptor)` lets plugins register workspace adaptors

### Built-in vs external plugins

`packages/opencode/src/plugin/index.ts` makes an important boundary explicit:

- built-in auth/provider plugins are hardcoded (`CodexAuthPlugin`, `CopilotAuthPlugin`, GitLab, Poe, Cloudflare variants)
- external plugins are loaded from config unless `--pure` / `OPENCODE_PURE` disables them

That means the extension architecture is real and first-class, but plugin loading mechanics in `packages/opencode/src/plugin/index.ts`, `loader.ts`, `shared.ts`, and `install.ts` are internal plumbing rather than the author-facing API.

## 4. Provider architecture

There are two visible provider extension layers.

### End-user/provider selection surface

- Root `README.md` explicitly markets provider-agnostic usage across Claude, OpenAI, Google, local models, etc.
- `packages/opencode/src/index.ts` registers `providers` and `models` commands.

### Plugin/provider extension surface

`packages/plugin/src/index.ts` defines:

- `ProviderContext`
- `ProviderHookContext`
- `ProviderHook`
- `AuthHook`

The important extension seam is:

- plugin can provide auth UI/flows (`AuthHook.methods` with `oauth` or `api` modes)
- plugin can provide/override provider model inventory via `ProviderHook.models(...)`
- plugin can mutate outgoing chat parameters and headers via `chat.params` and `chat.headers`

This is the public provider/plugin boundary. The concrete built-in provider implementations under `packages/opencode/src/plugin/*` are not.

## 5. Client/server integration patterns

### Local server as a hub

The repo README explicitly describes OpenCode as client/server. The code matches that:

- `packages/opencode/src/cli/cmd/serve.ts` starts a headless server
- `packages/sdk/js/src/server.ts` shells out to `opencode serve`
- `packages/sdk/js/src/client.ts` produces a typed HTTP client
- `packages/sdk/js/src/v2/gen/sdk.gen.ts` exposes event subscription, session control, MCP/LSP control, and TUI endpoints

This strongly suggests the server API is the main integration backbone, and the TUI/editor clients are clients of that same server.

### Editor integration

VS Code extension source:

- `sdks/vscode/package.json`
- `sdks/vscode/src/extension.ts`

Concrete user-facing command IDs:

- `opencode.openTerminal`
- `opencode.openNewTerminal`
- `opencode.addFilepathToTerminal`

Integration pattern:

1. extension opens a terminal and runs `opencode --port <port>`
2. it waits for the local app to respond on `http://localhost:<port>/app`
3. it posts to `http://localhost:<port>/tui/append-prompt`

This means the VS Code integration is intentionally thin: it shells into the CLI and then uses local HTTP/TUI endpoints.

### ACP and MCP integration

- `packages/opencode/src/cli/cmd/acp.ts` exposes ACP over stdio using `@agentclientprotocol/sdk`
- `packages/opencode/src/cli/cmd/mcp.ts` is the operational/config surface for Model Context Protocol servers
- generated SDK methods include MCP auth/status/add/connect/disconnect operations

So OpenCode acts both as:

- a consumer/controller of MCP servers
- a server/bridge for ACP clients

## 6. User-facing vs developer-facing boundaries

### User-facing

- root `README.md` install/run/configure experience
- CLI commands in `packages/opencode/src/index.ts`
- VS Code command IDs and keybindings in `sdks/vscode/package.json`
- headless server mode via `serve`
- MCP management via `mcp`

### Developer-facing

- `@opencode-ai/sdk` package exports
- `@opencode-ai/plugin` package exports
- plugin hook types in `packages/plugin/src/index.ts`
- plugin tool helper in `packages/plugin/src/tool.ts`
- TUI extension types in `packages/plugin/src/tui.ts`

### Mostly internal

- `packages/opencode/src/session/*`
- `packages/opencode/src/tool/*` implementation details
- `packages/opencode/src/plugin/loader.ts`
- `packages/opencode/src/plugin/shared.ts`
- `packages/opencode/src/plugin/install.ts`
- `packages/opencode/src/provider/*`
- `packages/opencode/src/server/*` internals behind the stable server boundary
- generated SDK internals below the exported entrypoints (`src/gen/core/*`, raw implementation files)

## 7. What looks stable vs what looks likely to churn

### Highest-confidence stable surface

- CLI binary name `opencode`
- top-level command families registered in `packages/opencode/src/index.ts`
- JS SDK package exports from `packages/sdk/js/package.json`
- plugin package exports from `packages/plugin/package.json`
- plugin hook names/types in `packages/plugin/src/index.ts`
- plugin tool contract in `packages/plugin/src/tool.ts`
- VS Code extension command IDs in `sdks/vscode/package.json`

### Medium-confidence / stable enough for integrations, but still evolving

- generated v2 SDK method names in `packages/sdk/js/src/v2/gen/sdk.gen.ts`
- TUI control endpoints like `appendPrompt`, `openSessions`, `showToast`
- workspace adaptor registration via `experimental_workspace.register(...)`
- ACP command behavior and local server startup contract

### Likely internal or intentionally experimental

- any hook prefixed with `experimental.` in `packages/plugin/src/index.ts`
- direct imports from `packages/opencode/src/**`
- plugin loader/install internals and compatibility resolution logic
- exact local HTTP endpoints used by the VS Code extension beyond the typed SDK/server contract
- runtime env vars used as internal coordination flags unless explicitly documented in README/docs

## 8. Bottom line

If treating `anomalyco/opencode` as a platform, the safest integration targets are:

1. the `opencode` CLI command family
2. the headless server started by `opencode serve`
3. `@opencode-ai/sdk` exported entrypoints
4. `@opencode-ai/plugin` hook/tool APIs
5. the VS Code command IDs if integrating at the editor level

The least safe targets are direct imports from `packages/opencode/src/**`, plugin loader internals, session/tool implementation details, and `experimental.*` hooks.
