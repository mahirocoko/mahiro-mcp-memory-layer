# Learnings — memory-console-modern-stack


## 2026-05-11 03:06:30Z
- Current backend routes are GET/HEAD pages at `/`, `/review`, `/rejected`, `/graph`; POST actions at `/actions/review`, `/actions/promote`, `/actions/purge-rejected`. Unknown page paths return 404 text/plain `Not found`. Unsupported page methods return 405 with `Allow: GET, HEAD`. Unsupported action methods return 405 with `Allow: POST`.
- `HEAD` is handled by the server for all page routes by suppressing the response body after rendering; existing coverage only asserts `HEAD /`, not the other page routes.
- Storage boundary is local-only and memory-scoped: `createLocalMemoryConsoleBackend()` wires `JsonlLogStore`, `LanceDB`, and `RetrievalTraceStore` into a `MemoryService`, while the read-only console backend only exposes `readAll`, `list`, and `search` for page loads.
- Existing tests cover browse/review/rejected/graph page rendering, purge previews/results, one `HEAD /` case, unknown GET 404s, unsupported page-method 405s, and GET `/actions/review` 405; there is no direct test yet for unsupported methods on `/review`, `/rejected`, `/graph`, or `/actions/purge-rejected`.


## 2026-05-11 03:09:03Z
- Vite current starter for React + TypeScript is `npm create vite@latest my-app -- --template react-ts` (or `pnpm/yarn/bun create vite`), and the template ships `react`, `react-dom`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `typescript`, `vite`, and `typescript-eslint`. Source: https://github.com/vitejs/vite/blob/main/packages/create-vite/template-react-ts/package.json
- Tailwind v4 Vite setup is `npm install -D tailwindcss @tailwindcss/vite` (or latest equivalents), add `tailwindcss()` in `vite.config.ts`, and import Tailwind in the main stylesheet with `@import "tailwindcss";`. Source: https://tailwindcss.com/docs/installation/using-vite and https://github.com/tailwindlabs/tailwindcss/blob/main/integrations/vite/index.test.ts
- shadcn/ui Vite install uses `npx shadcn@latest init -t vite`; it expects `@/*` aliases in both `tsconfig.json` and `vite.config.ts` (`@` → `./src`) and follows a copy-into-project model so only used components are added. Source: https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/installation/vite.mdx and https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/(create)/init/md/build-instructions.ts
- React 19 is the current Vite starter target in the template (`react`/`react-dom` 19.2.6, `@types/react`/`@types/react-dom` 19.2.x). TypeScript config in the starter uses `moduleResolution: "bundler"`, `jsx: "react-jsx"`, and `types: ["vite/client"]`. Source: https://github.com/vitejs/vite/blob/main/packages/create-vite/template-react-ts/package.json
- Compatibility note: Bun is supported for Vite scaffolding (`bun create vite`), but the shadcn Vite docs only show `npx shadcn@latest ...`; Vitest is not part of the starter, so verify its Vite-major compatibility separately when it is introduced.
- Real-world examples found: `ollama/ollama` uses `@vitejs/plugin-react` + `@tailwindcss/vite` in `app/ui/app/vite.config.ts`; `ariakit/ariakit`’s Vite bootstrap includes `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and `typescript`.


## 2026-05-11 03:13:55Z
- Characterized the existing memory-console backend contract before migration: page routes remain `GET`/`HEAD` for `/`, `/review`, `/rejected`, and `/graph`; action routes remain `POST`-only for `/actions/review`, `/actions/promote`, and `/actions/purge-rejected`.
- Added integration coverage for unsupported methods on `/review`, `/rejected`, `/graph`, `/actions/promote`, and `/actions/purge-rejected`; production server, render, and storage behavior were intentionally unchanged.
- Evidence files written at `.sisyphus/evidence/task-1-console-contract.txt` and `.sisyphus/evidence/task-1-console-contract-error.txt` using `Current Reality`, `Non-goals`, and `Coverage Added` labels.


## 2026-05-11 03:19:00Z
- Added the React/Vite frontend scaffold under `src/features/memory-console/web` without changing `bun run memory-console`; the existing server-rendered console remains the runtime surface until static serving is wired later.
- The frontend uses a feature-local Vite config with React and `@tailwindcss/vite`; build output goes to `src/features/memory-console/static`, which stays inside the existing package `files` inclusion via `src/features/memory-console`.
- The web TypeScript configs use `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `types: ["vite/client"]`, and `@/* -> ./src/*`; the root NodeNext `tsconfig.json` excludes the web app so the backend TypeScript build remains unchanged.
- shadcn readiness is limited to `components.json` and the `@/lib/utils` `cn` helper with `clsx` and `tailwind-merge`; no shadcn components, routers, query clients, or extra UI libraries were added.
- Biome's CSS parser in this environment reports Tailwind-specific `@theme`/`@custom-variant` syntax as diagnostics, so the stylesheet keeps the required Tailwind v4 `@import "tailwindcss";` plus local CSS variables instead.


## 2026-05-11 03:49:34Z
- Task 3 wires the memory console server to serve the built Vite shell for `/`, `/review`, `/rejected`, and `/graph`; memory data now moves through `/api/memories`, `/api/review`, and `/api/graph` instead of page HTML rendering.
- Static asset serving is intentionally narrow: only direct filenames under `/assets/` are read from `src/features/memory-console/static/assets`, JS/CSS get explicit content types, and traversal or unknown assets return the existing 404 `Not found` shape.
- JSON mutation endpoints mirror backend ownership for `reviewMemory`, `promoteMemory`, and `purgeRejectedMemories`; accepted mutations return `{ status: "ok", action, result }`, invalid payloads return 400 JSON without writer calls, and unavailable capabilities preserve the 501 unavailable concept.
- Legacy `/actions/*` routes are still form-compatible and keep their existing 303/text/html/text/plain semantics for Task 1 compatibility.


## 2026-05-11T04:24:35Z
- Task 4 kept the React console routing dependency-free: `window.location`, `history.pushState`, route helpers, and URLSearchParams are enough for `/`, `/review`, `/rejected`, and `/graph` MVP navigation.
- The app shell uses a small typed client over the Task 3 API shapes: GET `/api/memories`, `/api/review`, `/api/graph`, and POST `/api/review`, `/api/promote`, `/api/purge-rejected`; rejected-route API defaults are added client-side without forcing those defaults into the visible deep-link query.
- Component-level route rendering can be covered without adding jsdom/testing-library by rendering `MemoryConsoleShell` with `react-dom/server`; this covers active nav, loading, error, retry, and selected query field round-trips while keeping the existing Vitest dependency set unchanged.
- `rtk`, `rg`, and chrome-devtools browser attachment were unavailable in this executor PATH/session; verification used plain `bun` commands plus live HTTP route/API checks against the already-running 127.0.0.1:4317 console, and text evidence files replaced screenshots for this task.


## 2026-05-11 04:53:36Z
- Task 5 web implementation kept Browse/Projects/Firehose as `ConsoleFilterState.view` modes on the `/` route, reusing the existing `/api/memories` `ConsoleLoadResult` contract rather than adding new API endpoints.
- `projectBrowseHref` now removes `view`/selected id and lands on Browse with `scope=project`, `verificationStatus=all`, `reviewStatus=all`, `projectId`, and `containerId`, so project cards can link back into filtered memory exploration.
- Memory detail renders content, source, verification evidence, review decisions, tags, reasons, IDs, scope, and timestamps through React text nodes; the focused web test fixture proves `<script>alert(1)</script>` is escaped and no raw script markup is emitted.
- Browser QA on port 4317 verified search query updates, row selection writes `id` into the URL and opens detail, Projects cards link into scoped Browse, and Firehose labels itself as raw/not-approved. Evidence: `.sisyphus/evidence/task-5-browse-filters.png` and `.sisyphus/evidence/task-5-browse-escape.txt`.


## 2026-05-11 05:06:30Z
- The React `/review` surface now uses `/api/review` data directly: `id` query selection drives the selected review detail, review hints/assist suggestions render in the detail pane, and action controls call existing JSON helpers instead of adding a fetch layer.
- Pessimistic review mutations keep the selected item visible, disable buttons while submitting, show progress/error/success text, and trigger a data refetch only after the JSON API accepts the action.
- Manual QA avoided mutating local memories by clicking `Defer` without a note; the visible route alert showed `400 (invalid_payload)`, while 501/unavailable rendering is covered through the web component/API tests.


## 2026-05-11 05:43:30Z
- Task 7 rejected quarantine React route keeps /rejected out of the generic empty-state path so the quarantine guard remains visible even with zero rejected records.
- Purge UX uses existing /api/purge-rejected JSON semantics only: dry-run preview first, exact single scope/container context plus queued IDs/count, then typed DELETE REJECTED confirmation before final purge.
- Verification evidence: lsp_diagnostics clean for App.tsx and memory-console-web.test.tsx; bun run test -- tests/memory-console-web.test.tsx passed 17 tests; bun run test -- tests/memory-console-server.test.ts passed 24 tests; bun run build passed; browser QA on fixture server observed preview, missing-confirmation error with no mutation, final deleted=1/skipped=0 result, and refreshed rejected list count 0.


## 2026-05-11 06:17:30Z
- Task 8 graph UI now uses the existing `/api/graph` payload directly in React: deterministic SVG columns by node type, text fallback directories for dense/empty graphs, edge-type shortcut links preserving route params, warning output, and selected node metadata with browse-detail links for memory nodes.
- Verification for Task 8: lsp_diagnostics clean for App.tsx/index.css/web tests; targeted web test passed 19 tests; graph/server/render/web suite passed 64 tests; typecheck and build passed; browser QA covered `/graph`, node selection, `edgeType=tagged_with`, empty query state, and no console warnings/errors.


## 2026-05-11 06:52:00Z
- Task 9 accessibility pass kept the console on the no-modal path: review and purge confirmations remain inline labeled controls, so no focus trap is needed.
- Narrow graph layouts should prefer the text fallback over the SVG canvas; below 560px the canvas is hidden and the node/edge lists remain the readable surface.
- Grid/panel children need explicit min-width: 0 and wrapping tokens to prevent long memory IDs, warning text, and graph metadata from creating body-level horizontal overflow.


## 2026-05-11 07:35:00Z
- Task 10 test hardening split the remaining legacy renderer coverage down to the still-used `/actions/purge-rejected` result page; removed server-template assertions for browse/review/rejected/graph pages that now serve the Vite React shell.
- React shell escaping coverage now includes unsafe memory content, source title/URI, verification evidence, review decision note/evidence, tags, and search reasons in `tests/memory-console-web.test.tsx`.
- Package surface/build verification confirmed `package.json` includes `src/features/memory-console`, and `rtk bun run build` writes `static/index.html` plus built CSS/JS assets under `src/features/memory-console/static`.
- Task 10 verification evidence: `lsp_diagnostics` clean for changed tests, targeted memory-console tests passed, full `rtk bun run typecheck`, `rtk bun run test`, and `rtk bun run build` passed, and Playwright loaded `/` plus `/review` from `127.0.0.1:4317` with zero console errors/warnings.
