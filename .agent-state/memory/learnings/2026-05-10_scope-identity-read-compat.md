# Lesson Learned: Scope Identity Needs Generation Policy, Read Compatibility, and Guarded Rewrite

**Date**: 2026-05-10
**Tags**: memory, scope-identity, migration, compatibility, console

When a memory product exposes `projectId` and `containerId`, those fields are not just labels; they are durable lookup keys. The safe sequence is:

1. Define a canonical generation policy for new scope IDs.
2. Add read compatibility for legacy identifiers at scoped filter boundaries.
3. Add a guarded rewrite command with dry-run by default.
4. Apply rewrite only when the data risk is understood.

For this repo the canonical plugin-generated container identity is now `workspace:/absolute/path`, while legacy `worktree:/absolute/path` and `directory:/absolute/path` remain read-compatible. Public memory tool inputs remain opaque keys instead of being silently rewritten on ingress.

The session also showed that console UI can surface storage inconsistency quickly. Row metadata should display a friendly project identity where possible, but storage cleanup belongs in scope policy and maintenance tooling, not one-off render fixes.

Manual QA lesson: always confirm the browser is connected to the current server process. A stale process on the expected port can make a verification run exercise old UI code.
