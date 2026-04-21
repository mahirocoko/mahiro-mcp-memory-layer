# Learning: pane-evidence-must-survive-wrapper-boundaries

**Date**: 2026-04-21
**Tags**: gemini, tmux, observability, orchestration, pane-state, wrapper-truth

## Insight

When a Gemini tmux lane is the real execution surface, pane output is not just debug material. It is the nearest thing the system has to execution truth. If that evidence does not survive the wrapper boundaries, the host ends up with vague states like timeout even when the real issue was approval blocking or a broken Gemini CLI session.

## Why It Matters

Humans operating the system care about the difference between “Gemini is still thinking,” “Gemini is waiting for approval,” and “this session is unhealthy because the CLI hit an API 400 mismatch.” Those are operationally different situations that imply different next actions. A wrapper that flattens them into generic timeout or failure throws away the only information that would let the operator recover quickly.

## Durable Rule

If pane evidence exists, preserve it across layers:

1. classify the current pane state near the runtime,
2. propagate that state through worker results and orchestration metadata,
3. expose it in operator-facing inspection or attention paths,
4. avoid letting a more generic timeout overwrite a more specific known interruption reason.

Truth should get more precise as it moves up the stack, not less.
