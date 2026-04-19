# orchestration and control-flow map

This note focuses on the path that matters most for subagents, background tasks, tmux, reminders, and continuation.

## Core runtime owners

### `src/features/background-agent/manager.ts`

This is the async task engine.

Observed responsibilities:

- task creation and pending state
- queueing and concurrency control
- spawn limits for descendant/subagent sessions
- task lifecycle: pending -> running -> terminal
- task polling and idle/stability completion checks
- fallback retry behavior
- task history
- parent-session notification batching
- cancellation and cleanup

This is the closest thing to the execution orchestration core.

### `src/features/tmux-subagent/manager.ts`

This is the tmux runtime owner.

Observed responsibilities:

- manage pane/session mapping
- decide spawn/replace/close actions
- manage isolated window/session modes
- poll tracked pane/session health
- react to session-created and session-deleted lifecycle

This is the substrate owner, not the policy layer.

## Reminder and continuation bridge

### `src/hooks/background-notification/hook.ts`

This hook forwards selected runtime events into `BackgroundManager.handleEvent(...)` and injects pending notifications into `chat.message`.

Meaning:

- it is the bridge between runtime events and user-visible reminder text

### `src/hooks/task-reminder/hook.ts`

This is a lightweight reminder hook.

- after enough non-task tool turns, it appends a reminder to use the task tools

It is not the main orchestration callback path.

### `src/hooks/interactive-bash-session/hook.ts`

This hook tracks tmux sessions created through the `interactive_bash` tool.

Responsibilities:

- parse tmux commands
- remember omo-owned tmux sessions
- append reminder messages about tracked sessions
- kill tracked tmux sessions when the parent OpenCode session is deleted

It is tmux bookkeeping, not tmux runtime ownership.

## Atlas as control-policy layer

### `src/hooks/atlas/atlas-hook.ts`

Atlas composes three handlers:

- event handler
- `tool.execute.before`
- `tool.execute.after`

It holds per-session state plus pending file/task refs.

Meaning:

- Atlas is the high-level continuation and verification policy layer
- it is not the low-level async engine

## Main orchestration call paths

### Path 1: `task(..., run_in_background=true)`

1. `src/plugin/tool-registry.ts` exposes `task`
2. `src/tools/delegate-task/tools.ts` handles the input
3. background path goes through `src/tools/delegate-task/background-task.ts`
4. that launches work through `BackgroundManager`
5. session events flow back through `background-notification/hook.ts`
6. pending notifications are re-injected into `chat.message`
7. user can inspect task state via `background_output`

### Path 2: `call_omo_agent(..., run_in_background=true)`

1. `src/tools/call-omo-agent/tools.ts`
2. background path goes through `call-omo-agent/background-executor.ts`
3. this also ends in `BackgroundManager.launch(...)`

### Path 3: subagent session creation -> tmux pane ownership

1. `BackgroundManager` creates/starts a subagent session
2. `create-managers.ts` wires `onSubagentSessionCreated`
3. that callback calls `TmuxSessionManager.onSessionCreated(...)`
4. tmux manager decides pane/layout actions and tracks the session

### Path 4: continuation after delegated work

1. runtime event or tool result enters `plugin/event.ts` or `plugin/tool-execute-after.ts`
2. continuation hooks fire
3. `atlas` checks state, lineage, pending tasks, cooldowns, and policy
4. if needed, it injects continuation or verification reminders

## CLI path versus plugin path

### `src/cli/run/runner.ts`

This is the external client path, not the main plugin runtime owner.

Observed flow:

1. load config
2. resolve agent/model
3. create server connection
4. resolve or create session
5. subscribe to events
6. call `client.session.promptAsync(...)`
7. poll for completion

Meaning:

- `cli/run` consumes the system
- it does not replace the plugin-side orchestration engine

## Final reading

The orchestration model is best read like this:

- **`BackgroundManager`** = execution engine
- **`TmuxSessionManager`** = runtime substrate owner
- **`Atlas`** = continuation/verification/control policy
- **`background-notification`** = event-to-reminder bridge
- **`plugin-interface`** = host adapter

That separation is what makes `oh-my-openagent` feel like a composed orchestration system rather than a pile of unrelated hooks.
