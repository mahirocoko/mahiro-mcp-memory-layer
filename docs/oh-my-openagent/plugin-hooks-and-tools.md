# plugin, hooks, and tools

## `src/plugin/`

`src/plugin/` is the OpenCode-facing runtime layer.

Important files:

- `tool-registry.ts` — assemble the final tool map
- `chat-message.ts` — drive chat-time hooks and first-message/session setup behavior
- `event.ts` — route runtime events through the hook system
- `tool-execute-before.ts` — pre-tool guard layer
- `tool-execute-after.ts` — post-tool guard/rewrite layer
- `messages-transform.ts` — transform/validate chat message streams
- `skill-context.ts` — load and merge skills before tool creation
- `available-categories.ts` — expose categories for prompt/category systems

## `src/plugin/tool-registry.ts`

This file is where tools become real.

It composes:

- builtin LSP tools
- grep/glob/ast-grep tools
- session history tools
- `background_output` and `background_cancel`
- `call_omo_agent`
- `task` (`delegate-task`)
- `interactive_bash`
- `skill` and `skill_mcp`
- task-system tools
- hashline edit tools when enabled

Important point:

- `background_output` and `background_cancel` are wrappers over `BackgroundManager`
- `task` and `call_omo_agent` are orchestration entry points, but the runtime engine sits underneath in `features/background-agent`

## `src/create-hooks.ts`

This file composes three hook families:

### Core hooks

From `plugin/hooks/create-core-hooks.ts`:

- session hooks
- tool-guard hooks
- transform hooks

### Continuation hooks

From `plugin/hooks/create-continuation-hooks.ts`:

- `stopContinuationGuard`
- `compactionContextInjector`
- `compactionTodoPreserver`
- `todoContinuationEnforcer`
- `unstableAgentBabysitter`
- `backgroundNotificationHook`
- `atlasHook`

### Skill hooks

From `plugin/hooks/create-skill-hooks.ts`:

- `categorySkillReminder`
- `autoSlashCommand`

## Most important hook builders

### `plugin/hooks/create-session-hooks.ts`

Creates the major session-level behaviors, including:

- recovery
- notifications
- model/runtime fallback
- think mode
- `interactiveBashSession`
- `ralphLoop`
- `delegateTaskRetry`
- `startWork`
- `taskResumeInfo`

### `plugin/hooks/create-tool-guard-hooks.ts`

Creates the guard and quality layer around tools, including:

- output truncation
- rules injection
- write/read guards
- JSON recovery
- hashline enhancement
- redirect guard

### `plugin/hooks/create-transform-hooks.ts`

Creates the message/prompt transform layer, including:

- Claude Code compatibility hooks
- keyword detection
- context injection
- thinking/tool-pair validation

## `src/tools/`

`src/tools/index.ts` shows the tool surface categories clearly.

Important groups:

- `delegate-task/` — category/subagent task orchestration entry point
- `call-omo-agent/` — direct named-agent invocation path
- `background-task/` — background output/cancel tools
- `interactive-bash/` — tmux command tool
- `skill/`, `skill-mcp/` — skill and MCP surfaces
- `session-manager/` — session history tools
- `task/` — persistent task system tools

Meaning:

- the plugin layer exposes tools
- the tool layer triggers execution
- the real orchestration and runtime state still live underneath in `features/` and hook policy layers
