# root composition files

## `src/index.ts`

Role:

- the composition root for the plugin

Observed flow:

1. initialize config context
2. load plugin config with `loadPluginConfig(...)`
3. parse tmux config with `createRuntimeTmuxConfig(...)`
4. create model cache state
5. create managers with `createManagers(...)`
6. create tools with `createTools(...)`
7. create hooks with `createHooks(...)`
8. expose everything via `createPluginInterface(...)`

Meaning:

- `index.ts` assembles the system but does not own the runtime logic itself

## `src/plugin-config.ts`

Role:

- config loading boundary

Responsibilities observed from source:

- JSONC parsing
- legacy/canonical config filename resolution
- migration support
- user + project config merge
- schema validation against `OhMyOpenCodeConfigSchema`
- partial salvage of invalid config sections

## `src/create-runtime-tmux-config.ts`

Role:

- tmux runtime enablement gate

Responsibilities:

- detect whether tmux integration is enabled in config
- detect whether `tmux` binary exists
- parse config into `TmuxConfigSchema`

## `src/create-managers.ts`

Role:

- create long-lived runtime owners

Managers created:

- `TmuxSessionManager`
- `BackgroundManager`
- `SkillMcpManager`
- `configHandler`

Important wiring:

- `BackgroundManager` receives `onSubagentSessionCreated`
- that callback is bridged into `TmuxSessionManager.onSessionCreated(...)`
- if `openclaw` is enabled, the same subagent session creation is also dispatched outward

Meaning:

- this file is the main runtime service factory

## `src/create-tools.ts`

Role:

- turn managers + config + skills into exposed tool definitions

Responsibilities:

- create `skillContext`
- compute `availableCategories`
- call `createToolRegistry(...)`
- return filtered tools plus merged/available skills and categories

## `src/create-hooks.ts`

Role:

- compose hook families

Hook families:

- core hooks
- continuation hooks
- skill hooks

It also provides disposal for hook instances that need cleanup.

## `src/plugin-interface.ts`

Role:

- adapt internal managers/tools/hooks to the OpenCode host API

Observed host-facing handler types:

- `config`
- `tool`
- `chat.message`
- `chat.params`
- `chat.headers`
- `event`
- `tool.execute.before`
- `tool.execute.after`
- `experimental.chat.messages.transform`
- `experimental.chat.system.transform`

Meaning:

- this is the host adapter, not the orchestration core
