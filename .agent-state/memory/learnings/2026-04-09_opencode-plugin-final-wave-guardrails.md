# Durable Learning Note

**Date**: 2026-04-09
**Tags**: plugin, opencode, verification, packaging, runtime-state

When finishing event-driven plugin work, the last correctness bugs are often boundary bugs rather than core-logic bugs. In this session, the important catches were: a model-facing tool must not fall back to another session’s cached state when the current tool context lacks a session id; a new `message.updated` turn with no extractable text must not silently inherit stale prior-turn conversation unless it is clearly the same `messageID`; and a plugin-first install promise is incomplete unless the published package surface is narrowed through `files`, not just `exports`. Durable rule: for plugin adapters, verify trust boundaries at three levels — runtime state resolution, event-to-cache lifecycle, and actual published artifact contents.
