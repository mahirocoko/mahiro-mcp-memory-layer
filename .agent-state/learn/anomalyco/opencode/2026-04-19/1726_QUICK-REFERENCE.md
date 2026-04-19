# anomalyco/opencode quick reference

## What it does

OpenCode is an open source AI coding agent. It gives you a terminal UI, CLI commands, provider-agnostic model support, workspace and session management, MCP tooling, and a plugin system for extending the agent.

The repo is split into a few main pieces:

- `packages/opencode` for the main CLI, server, session logic, tools, and storage
- `packages/plugin` for the OpenCode plugin surface
- `packages/sdk/js` for the generated JavaScript SDK

## Install methods

### Fast install

```bash
curl -fsSL https://opencode.ai/install | bash
```

### Package managers

```bash
npm i -g opencode-ai@latest
scoop install opencode
choco install opencode
brew install anomalyco/tap/opencode
brew install opencode
sudo pacman -S opencode
paru -S opencode-bin
mise use -g opencode
nix run nixpkgs#opencode
```

### Desktop app

Download from the releases page or `opencode.ai/download`, or install with:

```bash
brew install --cask opencode-desktop
scoop bucket add extras; scoop install extras/opencode-desktop
```

### Local checkout

Use the repo directly when developing:

```json
{
  "plugin": ["file:///Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer"]
}
```

## Key features

### 1. Built-in agent modes

- `build` is the default full-access agent
- `plan` is read-only and good for exploration
- `general` is used internally for complex search and multistep work

Example:

```text
@general
```

### 2. Provider-agnostic model support

The project is designed to work with multiple providers, not just one model family. The main app routes through provider and model configuration in the CLI and runtime layers.

### 3. TUI, CLI, and client/server shape

OpenCode is built as a client/server system. The terminal UI is one client, but the same core can support other frontends.

### 4. Plugin and MCP support

The plugin layer can inject memory tools, config, and a thin orchestration surface. In source checkout mode, the repo can also expose MCP-backed orchestration helpers.

### 5. Workspace, session, and GitHub tooling

The command set covers sessions, models, providers, GitHub workflows, exports and imports, stats, debug, MCP, and more.

## Configuration options

### Root `opencode.jsonc`

The checked-in example config shows these top-level areas:

- `provider`
- `permission.edit`
- `mcp`
- `tools`

Example from the repo:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {},
  "permission": {
    "edit": {
      "packages/opencode/migration/*": "deny"
    }
  },
  "mcp": {},
  "tools": {
    "github-triage": false,
    "github-pr-search": false
  }
}
```

### Plugin config knobs

The plugin supports these useful options:

- `runtime.messageDebounceMs`
- `runtime.remindersEnabled`
- `routing.categories.<category>.model`
- `routing.categories.<category>.workerRuntime`

Environment overrides seen in the repo:

- `OPENCODE_INSTALL_DIR`
- `XDG_BIN_DIR`
- `MAHIRO_OPENCODE_PLUGIN_MESSAGE_DEBOUNCE_MS`
- `MAHIRO_OPENCODE_PLUGIN_REMINDERS_ENABLED`
- `MAHIRO_OPENCODE_PLUGIN_DEBUG_STDERR`

### CLI flags worth knowing

From `packages/opencode/src/index.ts`:

- `--print-logs`
- `--log-level DEBUG|INFO|WARN|ERROR`
- `--pure` to run without external plugins

## Important commands

### Workspace root

```bash
bun install
bun run dev
bun run dev:web
bun run dev:desktop
bun run dev:console
bun run dev:storybook
bun run typecheck
```

### Main package, `packages/opencode`

```bash
cd packages/opencode
bun run dev
bun run typecheck
bun run test
bun run build
bun run db generate --name <slug>
```

### SDK and plugin support

```bash
bun run gemini -- --model gemini-3-flash-preview "Summarize this repo"
bun run cursor -- --model composer-2 "Review this diff"
bun run orchestrate -- --file <workflow.json>
bun run list-orchestration-traces
```

## Usage patterns

### Quick local run

1. Install dependencies with `bun install`
2. Start the app with `bun run dev`
3. Use `Tab` to switch between the built-in `build` and `plan` agents

### Plugin-first install

1. Add `"mahiro-mcp-memory-layer"` to the OpenCode plugin list
2. Let OpenCode install it with Bun at startup
3. Use the in-process memory tools directly

### Source checkout development

1. Point the plugin at the local `file://` checkout
2. Use the repo’s local config and runtime hooks
3. Run package-level checks from `packages/opencode`

### MCP and orchestration work

- use `orchestrate` for multi-job or multi-step workflows
- use direct worker commands for single jobs
- use `list-orchestration-traces` when you need history or debugging

## Files a new contributor should read first

1. `README.md` for the user-facing overview, install paths, and command list
2. `packages/opencode/src/index.ts` for the main CLI entrypoint and command map
3. `packages/opencode/package.json` for scripts, exports, and package boundaries
4. `packages/plugin/src/index.ts` for the plugin API and hook types
5. `packages/plugin/src/tool.ts` for custom tool definitions
6. `packages/opencode/AGENTS.md` for repo-specific module shape and Effect rules
7. `.opencode/opencode.jsonc` for example config structure
8. `MCP_USAGE.md` for runtime and async orchestration behavior
9. `ORCHESTRATION.md` for worker routing and verification posture
10. `packages/sdk/js/script/build.ts` if you need to regenerate the JS SDK

## One-line mental model

OpenCode is a Bun-based, provider-agnostic AI coding agent with a terminal-first UX, plugin hooks, session and workspace handling, and a CLI surface that spans local use, MCP integration, and workflow orchestration.
