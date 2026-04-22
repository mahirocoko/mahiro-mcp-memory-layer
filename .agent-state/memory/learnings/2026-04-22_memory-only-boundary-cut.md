# Learning Note — memory-only-boundary-cut

## Tags
- boundary
- memory
- cleanup
- package-surface
- verification

## Lesson
When removing a subsystem from a package, the decisive step is not deleting its deepest implementation first. The decisive step is redefining the public surface so every later deletion is guided by one stable truth. In this session, the repo only became convincingly memory-only after the plugin tool surface, runtime capability contract, runtime state model, docs, tests, and artifact directories all converged on the same boundary. If any one of those layers had remained orchestration-shaped, the package would still have taught consumers the wrong identity.

## Why It Matters
Boundary work fails when it is treated as “code deletion” alone. Consumers learn a package from exports, runtime responses, docs, tests, and even stored example data. A subsystem is still alive if those layers keep naming it, even after the source tree shrinks.

## Durable Rule
For boundary cleanup, use this order:
1. Flip the public/runtime contract.
2. Delete the internal implementation.
3. Rewrite docs and tests to match.
4. Remove stale artifacts and naming leaks.
5. Do not call it complete until typecheck, test, and build all pass.
