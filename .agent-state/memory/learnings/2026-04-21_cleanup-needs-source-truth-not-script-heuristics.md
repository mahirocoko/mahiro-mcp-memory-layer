# Learning: cleanup-needs-source-truth-not-script-heuristics

## Tags
- cleanup
- tests
- vitest
- source-truth
- maintenance

## Context
I cleaned a large section of `/tests` in `mahiro-mcp-memory-layer`. The initial temptation was to treat files outside the default `bun run test` command as unused. That would have been a weak heuristic and would have risked deleting tests that remain discoverable or still protect current behavior.

## Lesson
When cleaning tests, the safest deletion criterion is not “the default script does not run this file.” The stronger criterion is “this file’s target no longer exists in the current source tree, or the file has no current references and no surviving product surface behind it.” In this repo, the right move was to separate three categories: truly orphaned fixtures, stale tests importing deleted modules, and still-valid tests that simply are not part of the narrow package-contract script. That distinction made the cleanup both larger and safer.

## Why It Matters
Script-level heuristics are attractive because they are fast, but they overfit to current execution paths and ignore discovery rules, source-checkout paths, and secondary product surfaces. Source-truth cleanup is slower up front, yet it produces deletions that are much easier to defend and much less likely to remove meaningful coverage. It also keeps maintenance work aligned with actual architecture rather than convenience.

## Reuse Rule
Before deleting tests, classify candidates in this order:
1. Orphaned helper/fixture with no references.
2. Test importing a module that no longer exists.
3. Test still targeting a live module but needing wording or scope cleanup only.

Only categories 1 and 2 are safe whole-file deletion candidates by default.
