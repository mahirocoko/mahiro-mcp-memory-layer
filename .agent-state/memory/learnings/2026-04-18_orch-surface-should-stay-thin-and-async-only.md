# Learning: Orch surface should stay thin and async-only

## Tags

- orchestration
- plugin
- opencode
- async-only
- operator-loop

## Summary

The repo works best when orchestration stays split into a thin control plane and an async execution plane. Session-local operator state, reminder continuation, and verification can be layered on top of the existing workflow/result primitives without inventing a second engine. Direct worker invocation should stay lane-first (`gemini` / `cursor`) with optional model override, while public start surfaces should remain async-only so humans and agents do not have to reason about conflicting sync vs async semantics.

## What happened

During this session, the orchestration surface evolved from a mixed set of primitives into a more coherent system: plugin-local operator loop, reminder continuation through `session.promptAsync`, `orch:` auto-dispatch, explicit lane-first `call_worker`, and finally a lean refactor that removed public sync direct-worker MCP starts and made orchestration start behavior async-only.

## Durable takeaway

When an orchestration surface offers both sync and async starts for similar work, users and agents drift toward ambiguity. The cleaner design is:

- category-routed async start: `start_agent_task`
- explicit worker-lane async start: `call_worker`
- raw direct async worker tools: `run_*_worker_async` + `get_*_worker_result`
- verification/finalization kept outside the start tools

That split is easier to document, easier to test, and easier to compose into an OMO-style control loop.

## Reuse guidance

- Prefer async-only public starts for orchestration APIs.
- Use reminder continuation plus resume/finalize instead of bolting on a second scheduler.
- Keep model selection as an override, not the primary human-facing contract.
- In interactive testing, always open OpenCode with an explicit project path to avoid misleading results from resumed sessions.
