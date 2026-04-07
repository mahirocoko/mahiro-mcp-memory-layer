# Learning Note

Tags: orchestration, orch-mode, trust, traces, protocol

## Lesson

`orch:` only becomes reliable when the behavioral contract is explicit enough to prevent quiet fallback into local implementation. The most important supporting details are not glamorous: clear model-routing doctrine, narrow escape hatches, trust handling for Cursor-family execution, and trace semantics that distinguish "workflow finished" from "work succeeded".

## Why It Matters

Without those guardrails, an orchestrator can appear to work while still drifting into the wrong role. The biggest risks are silent downgrade of user-requested models, local implementation after a worker failure, and misleading observability where `status: completed` hides failed jobs. Trust prompts are also part of the protocol surface because they directly affect whether delegated work succeeds in a fresh repo.

## Reuse Rule

When testing cross-project orchestration, treat these as mandatory checks:

- Was the task classified before broad local reading?
- Was the worker/model chosen explicitly and for the right reason?
- Did delegated execution require `trust: true`, and was that decision intentional?
- Did traces show successful jobs, not just a terminal workflow status?

## Durable Note

Future work on orchestration should prioritize protocol clarity over feature count. Sticky `orch` mode, trust rules, and trace interpretation should all be specified before being treated as stable behavior.
