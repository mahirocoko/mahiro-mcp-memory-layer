# Memory Console Modern React Stack

## TL;DR
> **Summary**: Rebuild `memory-console` as a fresh React + Vite + TypeScript + Tailwind v4 + shadcn/ui local web app while preserving the existing memory-only backend behavior and localhost contract.
> **Deliverables**:
> - Vite-built React app for browse, review, rejected quarantine, and graph inspection
> - JSON API layer backed by the existing memory-console backend, while preserving current form-action compatibility
> - Tailwind v4 + shadcn/ui setup with a restrained accessible console design
> - Tests-after coverage using existing Vitest infrastructure plus agent-run QA evidence
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Tasks 4-8 → Task 9 → Final Verification

## Context

### Original Request
- User requested `memory-console` using React + Vite + TypeScript + Tailwind + shadcn.
- User requested latest versions.
- User clarified that the UI/UX can be fully redesigned and does not need to preserve the old UI.
- User added that implementation should carry Mahiro's code-style/formatting scent using `mahiro-style` and `mahiro-docs-rules-init` as guidance lenses.

### Interview Summary
- Treat this as a full UI/UX rebuild, not just scaffold installation.
- Preserve the memory-only package boundary: local browse, review, rejected quarantine/cleanup, and read-only graph inspection only.
- Test strategy: tests-after, with mandatory agent-executed QA scenarios.
- Style strategy: repo reality wins first, then Mahiro fallback doctrine; do not present Mahiro preference as established repo reality unless the repo proves it.

### Metis Review (gaps addressed)
- Serving model decided: keep `bun run memory-console` as the stable entry; backend serves Vite-built static assets in normal mode. Add a separate dev script only for implementer convenience if needed; do not require users to run two processes.
- Route/API contract decided: add JSON `/api/*` endpoints for React and preserve existing `/actions/*` form semantics for compatibility/tests.
- Packaging behavior decided: built frontend assets must live under `src/features/memory-console/` so existing `package.json` files inclusion covers them.
- State refresh decided: pessimistic mutation with explicit loading/error states and refetch after success; no optimistic writes.
- Graph implementation decided: no new graph visualization library for MVP; use deterministic SVG/DOM driven by existing `buildMemoryGraph` data.
- shadcn scope decided: add only components used by the MVP; do not initialize a broad component library.
- Accessibility guardrails added for navigation, tables, dialogs, focus, and destructive actions.
- Mahiro-style guardrails added: keep route/screen files from becoming mixed-ownership modules, keep shared UI domain-neutral, use `import type` for type-only imports, and label `Current Reality` vs `Preferred Direction` when documenting decisions.

## Work Objectives

### Core Objective
Replace the current server-rendered HTML memory console with a modern React/Vite frontend that preserves existing memory-console data semantics, routes/actions, and local-only runtime behavior.

### Deliverables
- React + TypeScript frontend under `src/features/memory-console/web/`.
- Vite config, Tailwind v4 config via `@tailwindcss/vite`, shadcn/ui base setup, and `@/` alias.
- Backend support for serving built assets and JSON API endpoints.
- Redesigned accessible UI for browse/projects/firehose, review inbox, rejected quarantine/purge, and graph inspection.
- Updated Vitest tests for backend API/static serving plus frontend component behavior.

### Definition of Done (verifiable conditions with commands)
- `rtk bun run typecheck` passes.
- `rtk bun run test` passes.
- `rtk bun run build` passes and includes the memory-console frontend build.
- `rtk bun run memory-console` starts a localhost-only console at `127.0.0.1` and serves the React app.
- Playwright/manual browser QA confirms browse, review, rejected, graph, and error/destructive paths.

### Must Have
- Use latest stable/current-doc stack at implementation time: React 19.x line, Vite current stable, TypeScript current repo-compatible line, Tailwind v4, shadcn latest CLI/components.
- Preserve local-only binding from `src/features/memory-console/server.ts:33-34` and `src/memory-console.ts:7-9`.
- Preserve memory backend ownership in `src/features/memory-console/reader.ts:12-50`; the React app must not access storage directly.
- Preserve page scope: browse, review, rejected quarantine, graph. Do not add workflow/executor/admin features.
- Keep destructive purge guarded by confirmation and scoped review.
- Follow precedence for style judgments: `AGENTS.md` → repo-local docs → established repo patterns → Mahiro fallback doctrine.
- Use `import type` for type-only imports and keep props/payload/store shapes explicit enough to scan.
- Keep shared UI primitives domain-neutral; put memory-specific labels/status mapping in domain components.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Do not turn memory-console into hosted admin, multi-user, auth, telemetry, sync, workflow control, executor routing, or worker supervision UI.
- Do not introduce a generic dashboard full of vanity metrics unrelated to memory management.
- Do not rewrite unrelated memory core/storage/retrieval behavior.
- Do not add a graph editing surface; graph remains read-only inspection.
- Do not install a broad shadcn component set or unused visual libraries.
- Do not claim formatter/code-style rules as `Current Reality` unless config, scripts, docs, or repeated repo patterns prove them.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + Vitest; add React component tests with Testing Library/jsdom only where needed.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`
- Style QA: review changed code against Mahiro precedence and truth labels (`Current Reality`, `Preferred Direction`, `Not Established Yet`, `Adoption Triggers`).

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 foundation characterization, Task 2 stack/config setup
Wave 2: Task 3 backend API/static serving, Task 4 frontend app shell/data contract
Wave 3: Task 5 browse/projects/firehose, Task 6 review workflow, Task 7 rejected quarantine, Task 8 graph inspection
Wave 4: Task 9 accessibility/error polish, Task 10 test/build/package hardening

### Dependency Matrix (full, all tasks)
- Task 1 blocks Tasks 3-10.
- Task 2 blocks Tasks 4-10.
- Task 3 blocks Tasks 4-10.
- Task 4 blocks Tasks 5-9.
- Tasks 5-8 can run in parallel after Task 4.
- Task 9 depends on Tasks 5-8.
- Task 10 depends on Tasks 1-9.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 2 tasks → `unspecified-high`, `visual-engineering`
- Wave 2 → 2 tasks → `unspecified-high`, `visual-engineering`
- Wave 3 → 4 tasks → `visual-engineering`, `unspecified-high`
- Wave 4 → 2 tasks → `visual-engineering`, `unspecified-high`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Characterize Existing Console Contract Before Migration

  **What to do**: Create implementation notes inside the task worklog/evidence that enumerate current page routes, action routes, response semantics, and storage boundaries. Use the existing tests as behavior anchors. Do not change product behavior in this task except adding tests that lock current behavior if gaps are found.
  **Must NOT do**: Do not begin React/Vite setup. Do not rewrite renderer code.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: needs careful backend contract reading and test anchoring.
  - Skills: [`mahiro-style`, `mahiro-docs-rules-init`] - use precedence/truth-label guidance while capturing current reality vs preferred direction.
  - Omitted: [`uncodixify`] - no UI generation in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 4, 5, 6, 7, 8, 9, 10 | Blocked By: none

  **References**:
  - Pattern: `src/features/memory-console/server.ts:36-38` - current page/action route list.
  - Pattern: `src/features/memory-console/server.ts:116-164` - GET/HEAD routing and HTML render flow.
  - Pattern: `src/features/memory-console/server.ts:167-235` - POST action behavior, 400/501/303/200 semantics.
  - Pattern: `src/features/memory-console/reader.ts:12-50` - backend ownership and memory service boundary.
  - Test: `tests/memory-console-integration.test.ts:40-57` - existing route/action expectations.
  - Style: `~/.config/opencode/skills/mahiro-docs-rules-init/resources/generation-rules.md:5-18` - keep repo reality separate from preferred direction.
  - Style: `~/.config/opencode/skills/mahiro-style/foundations/review-checklist.md:14-34` - review precedence and truth labels.

  **Acceptance Criteria**:
  - [ ] `rtk bun run test -- tests/memory-console-integration.test.ts` passes.
  - [ ] Any missing characterization coverage is added to existing console tests, not to production code.
  - [ ] Evidence file records route contract, action contract, and non-goals.

  **QA Scenarios**:
  ```
  Scenario: Existing console contract is captured
    Tool: Bash
    Steps: Run `rtk bun run test -- tests/memory-console-integration.test.ts tests/memory-console-render.test.ts`.
    Expected: Both test files pass and evidence lists `/`, `/review`, `/rejected`, `/graph`, `/actions/review`, `/actions/promote`, `/actions/purge-rejected`.
    Evidence: .sisyphus/evidence/task-1-console-contract.txt

  Scenario: Unsupported route remains rejected
    Tool: Bash
    Steps: Ensure characterization includes a 404/405 expectation for unsupported routes or methods.
    Expected: Existing or added test proves unsupported route/method does not silently render the SPA.
    Evidence: .sisyphus/evidence/task-1-console-contract-error.txt
  ```

  **Commit**: NO | Message: `test(memory-console): characterize console contract` | Files: [`tests/memory-console-integration.test.ts`, optional evidence]

- [x] 2. Add React/Vite/Tailwind/shadcn Stack and Build Wiring

  **What to do**: Add latest stable/current-doc dependencies and configs for React + Vite + TypeScript + Tailwind v4 + shadcn/ui. Create `src/features/memory-console/web/` with `src/main.tsx`, `src/App.tsx`, `src/index.css`, `vite.config.ts`, and local TS config if needed. Configure `@/` to resolve to `src/features/memory-console/web/src`. Add scripts so `rtk bun run build` includes both TypeScript and Vite asset build.
  **Must NOT do**: Do not scaffold a separate package/workspace unless unavoidable. Do not add unused shadcn components. Do not change `bun run memory-console` behavior until Task 3.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: frontend stack setup with design-system constraints.
  - Skills: [`mahiro-style`, `uncodixify`] - apply Mahiro TS/import/component boundaries while preventing generic dashboard scaffolding and visual bloat.
  - Omitted: [`kien-thai`] - no Thai prose output required in code.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6, 7, 8, 9, 10 | Blocked By: none

  **References**:
  - Script: `package.json:37-48` - existing scripts; preserve `memory-console` and add Vite build script.
  - Dependency baseline: `package.json:49-62` - currently no React/Vite/Tailwind/shadcn deps.
  - External: `https://vite.dev/guide` - current Vite scaffold/build guidance.
  - External: `https://tailwindcss.com/docs` - Tailwind v4 with `@tailwindcss/vite` and `@import "tailwindcss"`.
  - External: `https://ui.shadcn.com/docs/installation/vite` - shadcn Vite setup and alias requirements.
  - Style: `~/.config/opencode/skills/mahiro-style/foundations/code-style.md:9-18` - imports and explicit TypeScript surfaces.

  **Acceptance Criteria**:
  - [ ] `package.json` includes React, React DOM, Vite, `@vitejs/plugin-react`, Tailwind v4 packages, and only required shadcn/runtime helpers.
  - [ ] `rtk bun run build` runs TypeScript build and Vite build successfully.
  - [ ] `rtk bun run typecheck` passes with React JSX and Vite client types.
  - [ ] shadcn base files exist only for used components and shared utilities.

  **QA Scenarios**:
  ```
  Scenario: Frontend build emits static app assets
    Tool: Bash
    Steps: Run `rtk bun run build`.
    Expected: Command exits 0 and Vite build output exists under `src/features/memory-console/` package-included path.
    Evidence: .sisyphus/evidence/task-2-stack-build.txt

  Scenario: Alias/config failure is caught
    Tool: Bash
    Steps: Run `rtk bun run typecheck` after importing from `@/` in the console app.
    Expected: Command exits 0; no unresolved `@/` imports or missing `vite/client` types.
    Evidence: .sisyphus/evidence/task-2-stack-typecheck.txt
  ```

  **Commit**: NO | Message: `build(memory-console): add react vite tailwind shadcn stack` | Files: [`package.json`, lockfile, `src/features/memory-console/web/**`, config files]

- [x] 3. Add Static Asset Serving and JSON API Layer

  **What to do**: Extend the existing server so normal page routes serve the React app shell, built assets are served with safe content types, and JSON endpoints expose current data/actions. Preserve existing `/actions/*` POST form routes and status semantics. Add API endpoints: `GET /api/memories`, `GET /api/review`, `GET /api/graph`, `POST /api/review`, `POST /api/promote`, `POST /api/purge-rejected`. JSON mutation endpoints must return structured success/error payloads and refetch-friendly data.
  **Must NOT do**: Do not move memory access into React. Do not remove existing HTML/form action compatibility until tests are updated and explicitly prove compatibility.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: backend compatibility and API semantics matter more than UI.
  - Skills: [`mahiro-style`] - keep API/server changes aligned with local-first style and explicit type surfaces.
  - Omitted: [`uncodixify`] - no visual generation in this task.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 4, 5, 6, 7, 8, 9, 10 | Blocked By: 1, 2

  **References**:
  - Pattern: `src/features/memory-console/server.ts:66-90` - server response handling and `no-store` cache policy.
  - Pattern: `src/features/memory-console/server.ts:136-164` - current page render routing.
  - Pattern: `src/features/memory-console/server.ts:167-235` - action validation and mutation response semantics.
  - API/Type: `src/features/memory-console/types.ts:25-67` - route/filter/action type contract.
  - Test: `tests/memory-console-integration.test.ts:40-57` - preserve existing GET and form-action checks.

  **Acceptance Criteria**:
  - [ ] `GET /`, `/review`, `/rejected`, `/graph` returns React app shell with `text/html`.
  - [ ] Built JS/CSS assets are served only from expected Vite output paths and not from arbitrary filesystem paths.
  - [ ] Existing `/actions/*` tests still pass or are updated to assert preserved compatibility.
  - [ ] JSON API tests cover happy and invalid payloads for each mutation endpoint.

  **QA Scenarios**:
  ```
  Scenario: React shell and JSON API are both served
    Tool: Bash
    Steps: Run `rtk bun run test -- tests/memory-console-integration.test.ts`.
    Expected: Tests prove page routes return HTML shell and `/api/*` endpoints return JSON with expected status codes.
    Evidence: .sisyphus/evidence/task-3-api-static.txt

  Scenario: Invalid mutation returns structured failure
    Tool: Bash
    Steps: Integration test sends invalid `/api/review` payload and invalid purge confirmation.
    Expected: API returns 400 JSON with stable error message; no mutation is performed.
    Evidence: .sisyphus/evidence/task-3-api-errors.txt
  ```

  **Commit**: NO | Message: `feat(memory-console): serve react app and json api` | Files: [`src/features/memory-console/server.ts`, `src/features/memory-console/types.ts`, tests]

- [x] 4. Build React App Shell, Routing, Data Client, and Shared Types

  **What to do**: Build the React shell with route-aware navigation for Browse, Review, Rejected, and Graph. Implement a typed fetch client for `/api/*`, shared UI state for filters/selected item, loading/error boundaries, and refetch-after-mutation behavior. Use URL query params for filters and selection so refresh/deep links work.
  **Must NOT do**: Do not add React Router unless it materially reduces code; simple URL/query handling is enough. Do not add React Query/TanStack Query for MVP.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: app structure and frontend state need UI discipline.
  - Skills: [`mahiro-style`, `uncodixify`] - enforce route/component ownership boundaries and avoid generic dashboard defaults.
  - Omitted: [] - frontend UI skill is appropriate through category.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 5, 6, 7, 8, 9, 10 | Blocked By: 2, 3

  **References**:
  - API/Type: `src/features/memory-console/types.ts:25-67` - filter/view model to mirror in UI types.
  - Pattern: `src/features/memory-console/render.ts:47-70` - current top-level page intent and scope copy.
  - Pattern: `src/features/memory-console/server.ts:140-163` - current query filters and route mapping.
  - External: `https://react.dev/learn/build-a-react-app-from-scratch` - React app with Vite.

  **Acceptance Criteria**:
  - [ ] App shell renders four primary navigation targets with active state from URL.
  - [ ] Data client handles success, loading, empty, and error states without uncaught promise errors.
  - [ ] URL query params round-trip filters and selected IDs.
  - [ ] Component tests cover navigation, loading state, and API error rendering.

  **QA Scenarios**:
  ```
  Scenario: Navigation and data loading work
    Tool: Playwright
    Steps: Open `http://127.0.0.1:4317/`, click nav items `Browse`, `Review`, `Rejected`, `Graph`.
    Expected: Active nav changes, URL path changes, and each route displays route-specific loading then content/empty state.
    Evidence: .sisyphus/evidence/task-4-app-shell.png

  Scenario: API failure is visible and recoverable
    Tool: Playwright
    Steps: Mock or trigger a `/api/memories` failure, then restore API and press `Retry`.
    Expected: Error message appears; Retry refetches and replaces error with content.
    Evidence: .sisyphus/evidence/task-4-app-shell-error.png
  ```

  **Commit**: NO | Message: `feat(memory-console): add react app shell` | Files: [`src/features/memory-console/web/src/**`, tests]

- [x] 5. Implement Browse, Projects, and Firehose Memory Views

  **What to do**: Build the primary memory exploration experience: filter bar, search input, scope/kind/verification/review filters, project scope summary, memory list/table, and detail panel. Keep copy direct and product-specific: memory records, scopes, source, tags, evidence, review state. Use shadcn components only where needed: button, input, select, badge, card, table, tabs/separator.
  **Must NOT do**: Do not add vanity KPI cards, analytics charts, or generic SaaS dashboard decoration.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: core UX/UI redesign.
  - Skills: [`mahiro-style`, `uncodixify`] - keep domain components intentional and avoid fake premium dashboard slop.
  - Omitted: [] - UI skill is useful here.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 9, 10 | Blocked By: 4

  **References**:
  - Pattern: `src/features/memory-console/render.ts:47-70` - existing browse page intent.
  - Pattern: `src/features/memory-console/render.ts:66-67` - verified/projects view split to preserve conceptually.
  - API/Type: `src/features/memory-console/types.ts:55-67` - filter state contract.
  - Test: `tests/memory-console-render.test.ts:22-60` - escaping/security expectations for rendered memory content.
  - Style: `~/.config/opencode/skills/mahiro-style/patterns/shared-ui-boundaries.md:16-33` - shared primitives stay domain-neutral; memory mappings belong in domain components.

  **Acceptance Criteria**:
  - [ ] Browse view supports search, filters, limit, scope identity, and selected memory detail.
  - [ ] Projects view groups project/container scope summaries and links into filtered browse view.
  - [ ] Firehose/all view exposes raw recent/list mode without implying canonical review approval.
  - [ ] Memory content/source/evidence are rendered safely with React escaping; no raw HTML injection.

  **QA Scenarios**:
  ```
  Scenario: Search and filters narrow memory results
    Tool: Playwright
    Steps: Open `/`, type `Browse integration` in the search field, set kind filter to matching kind, select the first memory row.
    Expected: Result count/list updates, URL query includes filters, detail panel shows matching memory ID/content/source.
    Evidence: .sisyphus/evidence/task-5-browse-filters.png

  Scenario: Unsafe memory content is escaped
    Tool: Bash
    Steps: Run component/integration test fixture containing `<script>alert(1)</script>` memory content.
    Expected: DOM text shows escaped content; no executable script is present.
    Evidence: .sisyphus/evidence/task-5-browse-escape.txt
  ```

  **Commit**: NO | Message: `feat(memory-console): add browse and project views` | Files: [`src/features/memory-console/web/src/**`, tests]

- [x] 6. Implement Review Inbox and Assist Workflow

  **What to do**: Build review queue UI with overview list, selected item details, review hints/assist suggestions, and actions for reject, defer, edit-then-promote/promote where supported by backend. Use pessimistic mutation: disable action, show progress, refetch review data on success, show structured errors on failure.
  **Must NOT do**: Do not invent new review actions or modify memory review semantics. Do not auto-promote without explicit user action.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: complex interaction UI.
  - Skills: [`mahiro-style`, `uncodixify`] - keep review workflow ownership explicit and interface task-focused, not dashboard-like.
  - Omitted: [] - no external docs required.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 9, 10 | Blocked By: 4

  **References**:
  - Pattern: `src/features/memory-console/server.ts:238-256` - review loading and assist lookup.
  - API/Type: `src/features/memory-console/types.ts:34-53` - action input/result typing.
  - Pattern: `src/features/memory-console/reader.ts:39-50` - backend action capabilities.
  - Test: `tests/memory-console-integration.test.ts:54-57` - existing form actions include review/reject behavior.

  **Acceptance Criteria**:
  - [ ] Review route lists pending/hypothesis items and selected item details.
  - [ ] Review assist suggestions render with source/hint context when available.
  - [ ] Reject/defer/edit-then-promote/promote actions call JSON API and refetch on success.
  - [ ] Unsupported backend action returns a visible 501/unavailable state, not a broken UI.

  **QA Scenarios**:
  ```
  Scenario: Review item can be rejected
    Tool: Playwright
    Steps: Open `/review`, select a pending item, click `Reject`, enter note `QA rejection`, confirm.
    Expected: Button disables during request; success state appears; item disappears or updates after refetch.
    Evidence: .sisyphus/evidence/task-6-review-reject.png

  Scenario: Invalid review action shows API error
    Tool: Bash
    Steps: Integration test posts invalid review payload to `/api/review`.
    Expected: 400 JSON error; no review status is changed.
    Evidence: .sisyphus/evidence/task-6-review-error.txt
  ```

  **Commit**: NO | Message: `feat(memory-console): add review inbox workflow` | Files: [`src/features/memory-console/web/src/**`, tests]

- [x] 7. Implement Rejected Quarantine and Guarded Purge UX

  **What to do**: Build rejected quarantine UI with rejected-only records, scope grouping, purge preview, explicit confirmation dialog, and result page/state. Confirmation must show exact scope/count and require deliberate action. Reuse existing purge backend semantics.
  **Must NOT do**: Do not make purge the default cleanup path. Do not purge non-rejected records. Do not hide scope/container identity before destructive action.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: destructive UX needs careful interaction design.
  - Skills: [`mahiro-style`, `uncodixify`] - keep destructive-action boundaries clear and avoid generic modal patterns that obscure risk.
  - Omitted: [] - no external library research needed.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 9, 10 | Blocked By: 4

  **References**:
  - Pattern: `src/features/memory-console/server.ts:208-235` - purge rejected action semantics and result rendering.
  - API/Type: `src/features/memory-console/types.ts:51-53` - purge input/result types.
  - Repo doc: `MCP_USAGE.md` - rejected purge is guarded, rejected-only, explicit confirmation, not default cleanup.
  - Test: `tests/memory-console-integration.test.ts` - fixture storage and action mutation test pattern.

  **Acceptance Criteria**:
  - [ ] Rejected route only presents rejected/quarantined records and scope context.
  - [ ] Purge flow requires explicit confirmation and displays affected scope/count before submission.
  - [ ] Successful purge displays deleted/skipped counts and refetches rejected list.
  - [ ] Invalid/missing confirmation returns visible error with no mutation.

  **QA Scenarios**:
  ```
  Scenario: Guarded purge requires explicit confirmation
    Tool: Playwright
    Steps: Open `/rejected`, choose a rejected-only scope, click `Purge rejected`, leave confirmation unchecked/blank, submit.
    Expected: UI blocks submission or API returns visible validation error; rejected records remain.
    Evidence: .sisyphus/evidence/task-7-purge-guard.png

  Scenario: Confirmed purge reports exact outcome
    Tool: Playwright
    Steps: Repeat purge with required confirmation for fixture rejected records.
    Expected: Result shows deleted/skipped counts; refreshed rejected list no longer shows purged records.
    Evidence: .sisyphus/evidence/task-7-purge-success.png
  ```

  **Commit**: NO | Message: `feat(memory-console): add rejected quarantine ui` | Files: [`src/features/memory-console/web/src/**`, tests]

- [x] 8. Implement Read-only Graph Inspection UI

  **What to do**: Build graph route using existing graph data from backend. Render deterministic SVG/DOM layout for memory/source/tag/evidence nodes and edge filters. Provide selected node detail, warnings, and accessible text fallback/list for screen readers or dense graphs.
  **Must NOT do**: Do not add a graph editing mode. Do not add D3/Cytoscape/force-graph dependency unless all simpler deterministic options fail and the reason is documented.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: visual data representation and accessibility.
  - Skills: [`mahiro-style`, `uncodixify`] - keep graph domain mapping outside shared primitives and avoid decorative graph wallpaper.
  - Omitted: [] - no extra graph library skill required.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 9, 10 | Blocked By: 4

  **References**:
  - Pattern: `src/features/memory-console/server.ts:259-272` - graph load result and selected node.
  - API/Type: `src/features/memory-console/types.ts:31-32` - route and edge filter typing.
  - Pattern: `src/features/memory-console/render.ts:31-32` - graph node/edge type list.
  - Pattern: `src/features/memory-console/render.ts:2-8` - current graph edge filter support.

  **Acceptance Criteria**:
  - [ ] Graph route renders nodes, edges, edge type filter, selected node details, and warnings.
  - [ ] Graph remains read-only and links back to browse/detail where appropriate.
  - [ ] Dense/empty graph states are readable and do not overlap critical controls.
  - [ ] Component tests cover node selection and edge filtering.

  **QA Scenarios**:
  ```
  Scenario: Graph node selection updates detail panel
    Tool: Playwright
    Steps: Open `/graph`, click a node labelled with a fixture memory/source/tag, then change edge type filter.
    Expected: Detail panel updates to selected node; graph/list filters edges without page crash.
    Evidence: .sisyphus/evidence/task-8-graph-select.png

  Scenario: Empty graph is explicit
    Tool: Playwright
    Steps: Open `/graph?query=no-such-memory-for-qa`.
    Expected: Empty state explains no graph data matched; no blank canvas-only screen.
    Evidence: .sisyphus/evidence/task-8-graph-empty.png
  ```

  **Commit**: NO | Message: `feat(memory-console): add graph inspection ui` | Files: [`src/features/memory-console/web/src/**`, tests]

- [x] 9. Accessibility, Responsive Layout, Error States, and Visual Restraint Pass

  **What to do**: Perform a cross-route UI quality pass: keyboard navigation, focus rings, aria labels, dialogs, tables, status announcements, empty states, mobile/narrow layout, dark/light token sanity if shadcn template includes themes, and copy cleanup. Remove any generic SaaS/dashboard filler introduced during tasks 4-8.
  **Must NOT do**: Do not add new feature scope during polish. Do not introduce marketing copy or decorative metric cards.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI/UX quality and accessibility.
  - Skills: [`mahiro-style`, `uncodixify`] - review Mahiro-shape drift and remove AI-default visual patterns.
  - Omitted: [] - no backend skill required.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 10 | Blocked By: 5, 6, 7, 8

  **References**:
  - Repo doc: `MCP_USAGE.md` - console scope: browse, review management, rejected quarantine, graph inspection.
  - Pattern: `src/features/memory-console/render.ts:61-63` - concise current product description to preserve without fluff.
  - External: `https://ui.shadcn.com/docs/installation/vite` - shadcn conventions and component structure.
  - Style: `~/.config/opencode/skills/mahiro-style/foundations/review-checklist.md:36-46` - reject mixed ownership modules, vague naming, and unearned UI depth.

  **Acceptance Criteria**:
  - [ ] Every interactive control is reachable by keyboard with visible focus.
  - [ ] Dialogs trap/restore focus and expose accessible labels/descriptions.
  - [ ] Tables/lists expose useful labels and do not become unreadable at narrow widths.
  - [ ] Error/empty/loading states exist for all four routes.
  - [ ] No generic KPI cards, gradient blobs, fake analytics, or unrelated dashboard filler remain.

  **QA Scenarios**:
  ```
  Scenario: Keyboard-only primary workflow
    Tool: Playwright
    Steps: Open `/`, use Tab/Enter/Arrow keys to navigate to Review, select an item, open and close a confirm dialog.
    Expected: Focus is always visible; dialog focus returns to trigger; no mouse required.
    Evidence: .sisyphus/evidence/task-9-keyboard.gif

  Scenario: Narrow viewport remains usable
    Tool: Playwright
    Steps: Set viewport to 390x844, open `/`, `/review`, `/rejected`, `/graph`.
    Expected: Navigation, filters, main content, and actions remain reachable without horizontal page-breaking controls.
    Evidence: .sisyphus/evidence/task-9-responsive.png
  ```

  **Commit**: NO | Message: `style(memory-console): polish accessibility and layout` | Files: [`src/features/memory-console/web/src/**`, tests]

- [x] 10. Tests-after Migration, Build Hardening, and Package Surface Verification

  **What to do**: Complete tests-after hardening. Update or replace old render tests that directly target `render.ts` with backend/API/component tests appropriate for React. Keep integration tests for server route/action/API behavior. Ensure package files include built console assets and scripts are coherent for source checkout and published package use.
  **Must NOT do**: Do not leave old server-rendered template tests asserting removed HTML internals. Do not weaken security/escaping tests; migrate them to React/component/API assertions.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-cutting verification and packaging reliability.
  - Skills: [`mahiro-style`, `mahiro-docs-rules-init`] - verify style precedence, truth labels, and package/docs wording during test/build hardening.
  - Omitted: [`uncodixify`] - no UI design work should remain.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Final Verification | Blocked By: 1, 2, 3, 4, 5, 6, 7, 8, 9

  **References**:
  - Script: `package.json:37-48` - build/typecheck/test/memory-console commands to preserve and update.
  - Package surface: `package.json:10-35` - ensure frontend build output is inside included files.
  - Test config: `vitest.config.ts:1-11` - test exclusions; add jsdom/project config if frontend tests need it.
  - Test: `tests/memory-console-render.test.ts:22-60` - migrate escaping/content assertions from server templates to React/component coverage.
  - Test: `tests/memory-console-integration.test.ts:40-57` - preserve route integration coverage.

  **Acceptance Criteria**:
  - [ ] `rtk bun run typecheck` passes.
  - [ ] `rtk bun run test` passes.
  - [ ] `rtk bun run build` passes and includes Vite build output.
  - [ ] `rtk bun run memory-console -- --port 4317` serves React UI from `127.0.0.1:4317` after build.
  - [ ] Existing memory-console behavior is covered by integration/API/component tests, not deleted without replacement.

  **QA Scenarios**:
  ```
  Scenario: Full repo verification passes
    Tool: Bash
    Steps: Run `rtk bun run typecheck`, then `rtk bun run test`, then `rtk bun run build`.
    Expected: All commands exit 0 without skipped memory-console failures.
    Evidence: .sisyphus/evidence/task-10-verification.txt

  Scenario: Built console starts locally
    Tool: interactive_bash + Playwright
    Steps: Start `rtk bun run memory-console -- --port 4317`; open `http://127.0.0.1:4317/`; capture home route and `/review` route.
    Expected: Server logs local-only URL; browser shows React console and routes load without 404 asset errors.
    Evidence: .sisyphus/evidence/task-10-local-console.png
  ```

  **Commit**: YES | Message: `feat(memory-console): rebuild console with react stack` | Files: [`package.json`, lockfile, `src/features/memory-console/**`, `tests/**`, config files]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright because UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Single commit after all tasks and final verification pass.
- Message: `feat(memory-console): rebuild console with react stack`
- Do not commit `.sisyphus/evidence/*` unless repo convention explicitly requires evidence artifacts.

## Success Criteria
- Console starts locally and remains bound to `127.0.0.1`.
- All existing memory-console workflows have React UI equivalents.
- JSON API preserves backend semantics and existing form actions remain compatible.
- Build/test/typecheck pass with repo-native commands.
- Final verification wave approves and user explicitly accepts completion.
