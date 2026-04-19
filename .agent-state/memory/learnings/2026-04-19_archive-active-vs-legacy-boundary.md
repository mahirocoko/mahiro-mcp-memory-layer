# Learning: reset-active-surface-without-compatibility-shims

**Date**: 2026-04-19
**Tags**: architecture, refactor, reset, orchestration, plugin

## Lesson
When a repo is being reset “for real,” active source paths must stop serving as compatibility surfaces for old architecture. Transitional shims are useful only while the goal is migration; once the goal changes to a true restart, those same shims keep the old design mentally present and technically reachable. The better pattern is to remove the old stack from active source paths, then repair every active import until the typechecker and active tests stop depending on deleted behavior.

## Why It Matters
This prevents disguised architecture drift. It also makes future work more honest because new code is written against the intended present system, not against leftovers from the old one.

## Reuse Rule
If a human asks for a clean restart, do not stop at “legacy shims.” Push until active `src/` imports no historical execution modules at all.
