# Code Snippets — oh-my-openagent

Source root: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/`

## Main entry points

- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/index.ts` — plugin entry that composes config, managers, tools, hooks, and the OpenCode interface.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/cli/index.ts` — Bun CLI entry.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/cli/cli-program.ts` — Commander-based CLI command registry.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/bin/oh-my-opencode.js` — published Node wrapper that locates and launches the correct platform binary.

## Core implementations

- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/plugin-config.ts` — layered JSONC config loading, validation, partial recovery, and merge rules.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/create-managers.ts` — runtime managers for tmux sessions, background tasks, skill MCP, and config handling.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/plugin/tool-registry.ts` — central tool assembly and filtering.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/plugin/hooks/create-session-hooks.ts` — session-hook composition with safe hook creation.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/agents/agent-builder.ts` — category- and skill-aware agent prompt/model composition.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/agents/sisyphus.ts` — main orchestrator prompt builder with model-family-specific behavior.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/hooks/hashline-read-enhancer/hook.ts` — hash-anchor transformation for safer file editing.
- `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/openclaw/reply-listener.ts` — daemonized inbound bridge from Discord/Telegram back into active tmux/OpenCode sessions.

## Interesting patterns

- Composition-first startup: `load config -> create managers -> create tools -> create hooks -> create interface`.
- Factory-heavy architecture: `createX()` functions build most major subsystems.
- Safe hook gating: hooks are created behind config checks and a `safeCreateHook()` wrapper.
- Tool registry as a composition layer: builtins, background tools, MCP-related tools, and task tools are merged in one place.
- Prompt specialization by model family: Sisyphus adjusts instructions for GPT vs Gemini.
- Hash-anchored reads/writes: file reads are transformed into stable `line#hash|content` references.
- External bridge pattern: OpenClaw polls external services and injects replies back into tmux sessions.

## Representative snippets

### 1) Plugin boot pipeline
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/index.ts`

> `const managers = createManagers({ ... })`
> `const toolsResult = await createTools({ ... })`
> `const hooks = createHooks({ ... })`
> `const pluginInterface = createPluginInterface({ ... })`

The main entrypoint is mostly wiring: it assembles subsystems in a clean startup pipeline rather than embedding business logic in `index.ts`.

### 2) Layered config merge with set-style dedupe
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/plugin-config.ts`

> `agents: deepMerge(base.agents, override.agents),`
> `categories: deepMerge(base.categories, override.categories),`
> `disabled_hooks: [...new Set([...(base.disabled_hooks ?? []), ...(override.disabled_hooks ?? [])])],`

Config merging is explicit: nested objects are deep-merged, while disable lists are unioned and deduplicated.

### 3) Manager composition around tmux and background work
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/create-managers.ts`

> `const tmuxSessionManager = new deps.TmuxSessionManagerClass(ctx, tmuxConfig)`
> `const backgroundManager = new deps.BackgroundManagerClass(ctx, pluginConfig.background_task, { ... })`
> `const skillMcpManager = new deps.SkillMcpManagerClass()`

Runtime services are instantiated centrally, which makes startup and cleanup policy easy to reason about.

### 4) Central tool registry composition
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/plugin/tool-registry.ts`

> `const backgroundTools = factories.createBackgroundTools(managers.backgroundManager, ctx.client)`
> `const callOmoAgent = factories.createCallOmoAgent(ctx, managers.backgroundManager, ...)`
> `const delegateTask = factories.createDelegateTask({ ... })`

The plugin exposes tools by composing focused tool factories instead of hardcoding one monolithic registry.

### 5) Safe hook creation wrapper
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/plugin/hooks/create-session-hooks.ts`

> `const safeHook = <T>(hookName: HookName, factory: () => T): T | null =>`
> `  safeCreateHook(hookName, factory, { enabled: safeHookEnabled })`

Hook construction is guarded so a broken hook does not necessarily take down plugin startup.

### 6) Agent prompt assembly from categories and skills
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/agents/agent-builder.ts`

> `const categoryConfigs: Record<string, CategoryConfig> = mergeCategories(categories)`
> `if (resolved.size > 0) {`
> `  base.prompt = skillContent + (base.prompt ? "…" + base.prompt : "")`
> `}`

Agent definitions are not static; category defaults and loaded skill content can rewrite the final prompt and model settings.

### 7) Model-family-specific Sisyphus prompt behavior
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/agents/sisyphus.ts`

> `if (isGpt5_4Model(model)) {`
> `  const prompt = buildGpt54SisyphusPrompt(...)`
> `}`
> `if (isGeminiModel(model)) {`

The main orchestrator tailors its prompt by model family rather than using one fixed instruction block everywhere.

### 8) Hashline transformation for safer edits
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/hooks/hashline-read-enhancer/hook.ts`

> `const hash = computeLineHash(parsed.lineNumber, parsed.content)`
> `return \`${parsed.lineNumber}#${hash}|${parsed.content}\``

This converts plain read output into stable hash-anchored references so later edits can validate that the file has not drifted.

### 9) CLI command surface
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/cli/cli-program.ts`

> `program.command("install")`
> `program.command("run <message>")`
> `program.command("doctor")`

The CLI is a separate Commander-based entry surface, distinct from the plugin runtime entry.

### 10) Binary wrapper with platform fallback
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/bin/oh-my-opencode.js`

> `const result = spawnSync(currentBinary.binPath, process.argv.slice(2), {`
> `  stdio: "inherit",`
> `})`

The published executable is a launcher that resolves the best platform binary, including fallback behavior for AVX2/libc differences.

### 11) OpenClaw reply polling loop
Path: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/learn/code-yeongyu/oh-my-openagent/origin/src/openclaw/reply-listener.ts`

> `await pollDiscordReplies(config, state, rateLimiter)`
> `await pollTelegramReplies(config, state, rateLimiter)`
> `await sleep(config.replyListener?.pollIntervalMs || 3000)`

OpenClaw uses a daemon polling loop to bridge external chat replies back into the active coding session.

## Quick read order

1. `src/index.ts`
2. `src/plugin-config.ts`
3. `src/create-managers.ts`
4. `src/plugin/tool-registry.ts`
5. `src/plugin/hooks/create-session-hooks.ts`
6. `src/agents/agent-builder.ts`
7. `src/agents/sisyphus.ts`
8. `src/hooks/hashline-read-enhancer/hook.ts`
9. `src/openclaw/reply-listener.ts`
