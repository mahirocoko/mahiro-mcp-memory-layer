# oh-my-openagent — Code Snippets

## Scope and Evidence

- **Source analyzed**: `./origin/`
- **Primary anchors read**:
  - `origin/package.json`
  - `origin/src/index.ts`
  - `origin/src/plugin/tool-registry.ts`
  - `origin/src/tools/delegate-task/tools.ts`
  - `origin/src/features/background-agent/manager.ts`
  - `origin/src/create-hooks.ts`

## Representative patterns

### 1. Plugin-first bootstrap

`origin/src/index.ts` wires config, managers, tools, hooks, and the final plugin interface in one deterministic sequence.

**Why it matters**: this file shows the repo is composed from subsystems rather than being dominated by one giant runtime object.

### 2. Tool registry as capability surface

`origin/src/plugin/tool-registry.ts` is the central tool assembly point. It merges search tools, LSP tools, session helpers, background-task tools, `task`, `skill`, `skill_mcp`, and other runtime helpers.

**Why it matters**: the real external behavior surface of the plugin is mostly decided here.

### 3. `task(...)` as orchestration entrypoint

`origin/src/tools/delegate-task/tools.ts` is the core delegation surface. It validates `load_skills` and `run_in_background`, resolves skills, resolves parent context, chooses category vs direct subagent routing, and then launches either sync or background execution.

**Why it matters**: this is the handoff point between orchestration policy and concrete execution.

### 4. Background execution is a real subsystem

`origin/src/features/background-agent/manager.ts` handles queueing, concurrency, child-session spawn, polling, retries, completion detection, and parent-session notifications.

**Why it matters**: async delegation is first-class in this repo, not a thin wrapper around `await` and polling.

### 5. Hooks are policy, not decoration

`origin/src/create-hooks.ts` composes core, continuation, and skill hooks.

**Why it matters**: a large part of the repo’s intelligence is enforced through runtime policy hooks rather than living only in agent prompts.
