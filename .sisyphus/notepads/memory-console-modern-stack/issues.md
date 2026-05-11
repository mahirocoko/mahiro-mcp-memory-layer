# Issues — memory-console-modern-stack

## 2026-05-11 03:36:00Z
- Removed the scope-creep `.gitignore` CocoIndex/ccc ignore entry from the Wave 1 worktree.


## 2026-05-11 04:13:18Z
- Corrected Task 3 verification fallout: `tests/memory-console-server.test.ts` still expected server-rendered page HTML to include memory content such as `Browseable memory.`, `Needs review.`, rejected-list controls, and graph summary markup after page routes had switched to the Vite shell.
- Migrated those assertions to the new split contract: page route tests now assert React shell/no backend read behavior, while `/api/memories`, `/api/review`, and `/api/graph` assertions preserve the memory data, review assist, rejected filter, and graph projection coverage.
- Updated `HEAD /` expectations to match shell serving: it returns status 200 with no body and no memory backend reads.


## 2026-05-11 05:13:47Z
- Fixed Task 6 verification fallout: `ReviewActionPanel` now remounts with `key={item.id}` when the selected review item changes, so note/content/summary/tags/evidence/mutation hook state cannot leak into another item action.
- Existing server-render tests cannot simulate client-side preserved hook state, so the fix stays at the React identity boundary and targeted web tests verify the review shell still renders and API helpers still behave.


## 2026-05-11 05:49:10Z
- Fixed Task 7 verification fallout: `PurgeRejectedPanel` now receives `key={purgeContextKey}` derived from scope/project/container plus queued rejected IDs, so preview result, final result, confirmation input, and mutation status remount when the purge context changes.
- Persisted final purge results are now tagged with the same context key before display, preventing a result from one rejected scope from appearing after navigation/filter changes to another scope.
- Existing React server-render tests cannot simulate preserved hook state across client route changes, so the fix stays at the React identity boundary. Verification: lsp_diagnostics clean for App.tsx; targeted web test passed 17 tests; typecheck and build passed; safety grep found no TODO/FIXME/@ts-ignore/as any/innerHTML/dangerouslySetInnerHTML/console.log.


## 2026-05-11 06:55:00Z
- Removed out-of-scope `.playwright-mcp/` snapshots generated during Task 9 browser QA; retained source, tests, static assets, notepads, and `.sisyphus/evidence/` artifacts.


## 2026-05-11 Code Quality Review
- Blocker: JSON purge validation in src/features/memory-console/server.ts accepts malformed ids arrays by filtering out non-string entries instead of rejecting the payload; a probe with ids ["mem-ok", 123] returned 200 and called purgeRejectedMemories with only ["mem-ok"]. Fix by making getJsonIds/validateJsonPurgeRejectedAction reject any non-string, blank, or dropped id element and add API regression coverage.


## 2026-05-11 F2 Blocker Fix
- Fixed JSON purge ids validation to fail closed for non-string or blank ids instead of dropping invalid entries. Added server and integration regressions for mixed ids arrays; verification passed with lsp_diagnostics on changed TS/test files and `rtk bun run test -- tests/memory-console-server.test.ts tests/memory-console-integration.test.ts tests/memory-console-web.test.tsx`.
