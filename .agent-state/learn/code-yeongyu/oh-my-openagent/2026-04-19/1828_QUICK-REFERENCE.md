# oh-my-opencode quick reference

## What this project is

`oh-my-opencode` is an OpenCode plugin and CLI harness. It adds multi-agent orchestration, lifecycle hooks, custom tools, config loading, tmux-backed interactive runs, and a few guardrails like hash-anchored edits and todo continuation enforcement.

The repo is TypeScript, runs on Bun, uses Zod for config validation, and is built around small factory functions that wire modules together.

## How to use it

### Standard plugin install

Add it to OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-opencode"]
}
```

### Local dev install

Use the source checkout path:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///ABSOLUTE/PATH/TO/oh-my-openagent"]
}
```

### Common commands

```bash
bun install
bun run dev
bun run typecheck
bun run test
bun run build
```

## First files to read

- `src/index.ts`, main plugin entry and wiring
- `src/plugin-config.ts`, config load, merge, migration, validation
- `src/create-managers.ts`, tmux, background, skill MCP, config handler setup
- `src/create-tools.ts`, skill context and tool registry assembly
- `src/create-hooks.ts`, hook composition and disposal
- `src/plugin-interface.ts`, OpenCode hook handlers exposed by the plugin
- `src/plugin-dispose.ts`, cleanup path
- `src/shared/`, shared helpers, logging, merge logic, config utilities
- `src/hooks/`, lifecycle behavior and guardrails
- `src/tools/`, custom tools and tool-specific implementations

## Notable patterns and tech

- Bun first. Scripts, tests, and builds are Bun based.
- TypeScript strict mode with ESM output.
- Zod validation with partial config fallback and migration support.
- JSONC config files, with user config merged over project config.
- Factory style modules. `createX()` is the main pattern.
- Hook driven design. `index.ts` only composes, it does not hold business logic.
- tmux integration for interactive subagent sessions.
- Background managers for long running work.
- Built in guardrails for comments, todo continuation, context limits, and stale line edits.
- Telemetry is present, but failures are treated as non fatal.

## Config flow

1. Load user config from the OpenCode config dir.
2. Load project config from `.opencode/` in the repo.
3. Migrate legacy filenames if needed.
4. Validate with Zod.
5. Merge configs, with project overriding user values where applicable.

## Mental model

Think of this repo as a control plane for OpenCode. The plugin bootstraps managers, registers tools, composes hooks, and exposes a large compatibility surface without stuffing logic into the entrypoint.

## Good onboarding path

1. Read `README.md` for user-facing behavior.
2. Read `src/index.ts` for startup flow.
3. Read `src/plugin-config.ts` for config rules.
4. Read `src/create-managers.ts` and `src/create-tools.ts` for the main runtime pieces.
5. Skim `src/hooks/` and `src/tools/` for feature details.
