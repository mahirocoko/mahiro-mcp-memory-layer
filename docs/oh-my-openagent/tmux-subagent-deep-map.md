# tmux-subagent deep map

This note focuses on `oh-my-openagent/origin/src/features/tmux-subagent/` from source.

## What this subsystem is

`features/tmux-subagent/` is the tmux runtime owner.

Its job is to:

- map subagent sessions to tmux panes
- decide where new panes should go
- spawn, replace, or close panes
- poll pane/session health
- keep the tmux layout sane while subagent sessions come and go

## Main files

### `manager.ts`

This is the runtime owner class: `TmuxSessionManager`.

Observed responsibilities:

- store tracked sessions
- remember the source pane and isolated window/session anchors
- queue pane spawn work
- create isolated tmux containers when configured
- query window state
- reassign anchor panes when sessions disappear
- close tracked panes when their sessions end
- start and stop the polling manager

This file is the central tmux state holder.

### `decision-engine.ts`

This file exports the decision primitives that decide *what should happen* to the tmux layout.

It re-exports the important planning helpers:

- capacity calculation
- grid planning
- pane-to-slot mapping
- spawn target finding
- close/spawn action decisions

It is a coordination surface rather than one giant algorithm file.

### `action-executor.ts`

This file executes the pane actions decided elsewhere.

Responsibilities:

- execute `close`, `replace`, and `spawn` actions
- call shared tmux helpers such as `spawnTmuxPane`, `replaceTmuxPane`, `closeTmuxPane`, `applyLayout`, and `enforceMainPaneWidth`
- enforce layout after pane changes
- return action results including the pane id that was actually created or replaced

This file is the imperative actuator of the tmux runtime.

### `polling-manager.ts`

This file monitors tracked sessions over time.

Responsibilities:

- poll session status at a background interval
- mark activity versions when session events arrive
- detect stable idle state across multiple polls
- close panes when sessions are idle long enough, disappear too long, or time out

Important point:

- this is not only checking “is the session idle?”
- it also does stability rechecks before deciding a pane can be closed

### `grid-planning.ts`

This file calculates pane layout and slot capacity.

It is the layout math behind multi-pane behavior.

### `spawn-action-decider.ts`

This file decides whether a new session should:

- spawn a new pane
- replace an existing pane
- skip spawning

It is the policy layer for pane allocation.

### `spawn-target-finder.ts`

This file finds the best target pane to split or replace.

It is the selection layer underneath the spawn action decider.

### `pane-state-querier.ts` / `pane-state-parser.ts`

These files query and normalize current tmux window/pane state.

They turn tmux runtime observations into structured data the decision engine can use.

### `tracked-session-state.ts`

This file defines and mutates tracked session state records.

It is the small state-model helper layer for the manager.

### `session-created-handler.ts` / `session-deleted-handler.ts`

These files represent the lifecycle reaction layer:

- session created -> spawn/track pane
- session deleted -> close/cleanup pane

## Internal flow

### Session created path

1. a subagent session is created elsewhere
2. `TmuxSessionManager.onSessionCreated(...)` is called
3. current window state is queried
4. decision engine calculates actions
5. action executor applies spawn/replace actions
6. the new pane id is tracked against the session id
7. polling begins for tracked sessions

### Session deleted path

1. a subagent session ends
2. tmux manager identifies the tracked pane
3. close action is attempted
4. layout is repaired
5. isolated container anchor is reassigned or cleaned up if needed

### Polling path

1. polling manager calls `client.session.status(...)`
2. compares current session statuses against tracked sessions
3. waits for stable idle or disappearance thresholds
4. asks the manager to close panes when safe

## Why this subsystem matters

This directory is the best source for the idea that **runtime ownership should stay centralized**.

The subagent or orchestration code does not hold tmux itself.
Instead:

- the execution layer reports session creation
- the tmux manager owns layout and pane lifecycle

That separation is the key architectural lesson from this subsystem.
