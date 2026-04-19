# anomalyco/opencode — Testing

## Scope and Evidence

- **Source analyzed**: `./origin/`
- **Primary anchors read**:
  - `origin/package.json`
  - `origin/bunfig.toml`
  - `origin/turbo.json`
  - `origin/.husky/pre-push`
  - `origin/.github/workflows/test.yml`
  - `origin/.github/workflows/typecheck.yml`
  - `origin/.github/workflows/publish.yml`
  - `origin/.github/workflows/pr-standards.yml`
  - `origin/packages/opencode/package.json`
  - `origin/packages/app/package.json`
  - `origin/packages/shared/package.json`
  - `origin/packages/opencode/test/lib/effect.ts`
  - `origin/packages/opencode/test/preload.ts`
  - `origin/packages/opencode/test/fixture/fixture.ts`
  - `origin/packages/opencode/test/fixture/tui-runtime.ts`
  - `origin/packages/opencode/test/cli/tui/thread.test.ts`
  - `origin/packages/opencode/test/cli/tui/plugin-lifecycle.test.ts`
  - `origin/packages/opencode/test/session/processor-effect.test.ts`
  - `origin/packages/app/happydom.ts`
  - `origin/packages/app/playwright.config.ts`
  - `origin/packages/app/e2e/todo.spec.ts`
  - `origin/packages/app/src/components/prompt-input/submit.test.ts`
  - `origin/packages/app/src/context/layout-scroll.test.ts`
  - `origin/packages/ui/src/components/session-diff.test.ts`
  - `origin/packages/shared/test/filesystem/filesystem.test.ts`
  - `origin/sdks/vscode/package.json`

## Test structure and conventions

This repo is **package-local test first**, not root-test first.

- The root `package.json` intentionally blocks `test` with `echo 'do not run tests from root' && exit 1`.
- `bunfig.toml` reinforces that with `[test] root = "./do-not-run-tests-from-root"`.
- `origin/AGENTS.md` says the same explicitly: tests must run from package dirs like `packages/opencode`.

Representative layout:

- `packages/opencode/test/**` — backend/CLI/integration-heavy tests
  - examples: `test/tool/bash.test.ts`, `test/session/session.test.ts`, `test/pty/pty-session.test.ts`, `test/config/plugin.test.ts`
- `packages/app/src/**/*.test.ts` — colocated UI/app unit tests
  - examples: `src/components/prompt-input/submit.test.ts`, `src/context/layout-scroll.test.ts`, `src/utils/persist.test.ts`
- `packages/app/e2e/*.spec.ts` — Playwright end-to-end lane
- `packages/shared/test/**` — shared utility and filesystem tests
- `packages/ui/src/components/*.test.ts` — colocated component/unit tests like `session-diff.test.ts`

Conventions visible in the tests:

- Bun test runner is the default (`import { describe, test, expect } from "bun:test"`).
- Tests are named behavior-first rather than snapshot-heavy.
  - Example: `packages/ui/src/components/session-diff.test.ts` checks normalized patch behavior directly.
  - Example: `packages/app/src/context/layout-scroll.test.ts` checks debounce timing and cache reseeding.
- There is a strong split between **unit-ish colocated tests** in UI/app packages and **integration-style service tests** in `packages/opencode/test/**`.

## Test utilities and helpers

The most important helper layer is in `packages/opencode/test/`.

### 1. Effect-aware test harness

`packages/opencode/test/lib/effect.ts` wraps Bun tests around Effect runtimes:

- `testEffect(layer)` builds `{ effect, live }`
- `it.effect(...)` uses `TestClock` and `TestConsole`
- `it.live(...)` keeps real clock/OS behavior while still capturing console

This is a meaningful convention: tests that depend on real filesystem, git, subprocesses, locks, or mtimes are deliberately marked **live** instead of faking the world.

### 2. Temporary workspace helpers

`packages/opencode/test/fixture/fixture.ts` provides the main integration test scaffold:

- `tmpdir()` creates disposable temp workspaces
- optional `git: true` initializes a real git repo and root commit
- optional `config` writes an `opencode.json`
- `tmpdirScoped()` offers scoped Effect cleanup
- `provideTmpdirInstance(...)` binds an instance directory
- `provideTmpdirServer(...)` adds the test LLM server on top

This pushes tests toward **real repo/file/process state** instead of hand-built fake objects.

### 2.5. Global test preload / isolation

`packages/opencode/test/preload.ts` is an important quality helper for the backend test lane. It:

- sets isolated XDG directories before `src/` imports
- forces `OPENCODE_DB=:memory:`
- clears provider/server auth environment variables
- disables default plugins for predictable tests
- initializes logging/projectors for the test process
- retries temp-dir teardown on Windows `EBUSY` cleanup failures

That file shows the suite is actively hardened against cross-test contamination and platform-specific flake.

### 3. Focused runtime fixtures

`packages/opencode/test/fixture/tui-runtime.ts` provides `mockTuiRuntime(...)` for TUI plugin tests by:

- overriding `process.cwd()`
- stubbing `TuiConfig.waitForDependencies`
- writing plugin meta file env setup

This is a narrow fixture for one subsystem, not a global giant test harness.

### 4. Browser-ish DOM preload

`packages/app/happydom.ts` registers Happy DOM for app tests and patches `HTMLCanvasElement.prototype.getContext` with a simplified canvas mock. `packages/app/package.json` preloads this file for unit tests via:

- `bun test --preload ./happydom.ts ./src`

That is the main browser-environment helper on the app side.

## Mocking patterns

The repo’s stated preference is **avoid mocks where possible** (`origin/AGENTS.md`), and the code mostly follows that by using real temp dirs, real git repos, real file IO, and Effect layers.

Still, mocks are used selectively where the boundary is external or unstable.

### Common patterns

1. **`spyOn(...)` for targeted seams**
   - `packages/opencode/test/cli/tui/thread.test.ts`
   - `packages/opencode/test/fixture/tui-runtime.ts`
   - `packages/opencode/test/cli/tui/plugin-lifecycle.test.ts`

2. **`mock.module(...)` for app-side dependency injection**
   - `packages/app/src/components/prompt-input/submit.test.ts`
   - `packages/app/src/utils/persist.test.ts`

3. **fake timers for debounced behavior**
   - `packages/app/src/context/layout-scroll.test.ts` uses `vi.useFakeTimers()` / `vi.advanceTimersByTime(...)`

4. **layer-based replacement for Effect services**
   - `packages/opencode/test/session/processor-effect.test.ts` composes a test environment with `Layer.mergeAll(...)`
   - `packages/opencode/test/project/project.test.ts` defines a mock child-process layer for git failures

### Practical nuance

`packages/opencode/test/cli/tui/thread.test.ts` documents a concrete Bun limitation: it avoids `mock.module()` because Bun caches module overrides and `mock.restore()` does not fully reset them. That comment is a good signal that the test suite has learned specific runner pitfalls and encoded workarounds in-place.

## Coverage approach

There is **plenty of test surface**, but I did **not** find evidence of a dedicated coverage gate or coverage-reporting workflow.

What is present:

- many tests across `packages/opencode`, `packages/app`, `packages/shared`, `packages/ui`, `packages/enterprise`, and `packages/desktop-electron`
- CI JUnit output for unit and e2e lanes
- Playwright artifacts and retry behavior in CI
- targeted specs/docs that talk about coverage expectations in some subsystems, e.g. `packages/opencode/specs/effect/server-package.md`

What I did **not** find at the repo root or package script level:

- no `--coverage` test scripts
- no `c8`, `istanbul`, or dedicated coverage config
- no workflow publishing coverage percentages or enforcing thresholds

So the quality model is closer to **broad behavior testing plus CI artifacts**, not numeric coverage enforcement.

## Build / lint / typecheck / test workflows

### Root posture

From `origin/package.json`:

- `lint`: `oxlint`
- `typecheck`: `bun turbo typecheck`
- `prepare`: `husky`
- `test`: intentionally fails at root

From `origin/turbo.json`:

- `typecheck` is a shared Turbo task
- `opencode#test` and `opencode#test:ci` depend on `^build`
- `@opencode-ai/app#test` and `@opencode-ai/app#test:ci` also depend on `^build`
- CI outputs are standardized as `.artifacts/unit/junit.xml`

### Package scripts

Representative package-level scripts:

- `packages/opencode/package.json`
  - `typecheck`: `tsgo --noEmit`
  - `test`: `bun test --timeout 30000`
  - `test:ci`: Bun test with JUnit output
  - `build`: `bun run script/build.ts`
- `packages/app/package.json`
  - `typecheck`: `tsgo -b`
  - `build`: `vite build`
  - `test:unit`, `test:unit:watch`, `test:ci`
  - `test:e2e`, `test:e2e:local`, `test:e2e:ui`
- `packages/shared/package.json`
  - `test`: `bun test`
  - `typecheck`: `tsgo --noEmit`
- `sdks/vscode/package.json`
  - `check-types`: `tsc --noEmit`
  - `lint`: `eslint src`
  - `pretest`: compile tests + compile extension + lint
  - `test`: `vscode-test`

### CI workflows

`origin/.github/workflows/test.yml` is the main verification lane:

- unit test matrix on **Linux + Windows** via `bun turbo test:ci`
- JUnit publishing through `mikepenz/action-junit-report@v6`
- artifact upload of `packages/*/.artifacts/unit/junit.xml`
- e2e matrix on **Linux + Windows**
- Playwright browser caching
- app e2e execution via `bun --cwd packages/app test:e2e:local`
- Playwright report/test-result artifact upload

`origin/.github/workflows/typecheck.yml` runs:

- checkout
- Bun setup
- `bun typecheck`

`packages/app/playwright.config.ts` adds extra enforcement for e2e runs:

- `forbidOnly: !!process.env.CI`
- `retries: process.env.CI ? 2 : 0`
- JUnit reporter enabled when `PLAYWRIGHT_JUNIT_OUTPUT` is set
- trace/screenshot/video retention on failure or first retry

### Build / release workflow

`origin/.github/workflows/publish.yml` is primarily a build/sign/release pipeline:

- versioning via `./script/version.ts`
- CLI build via `./packages/opencode/script/build.ts`
- multi-platform asset packaging/signing

It is not the main place where tests are enforced; that responsibility is separated into the dedicated `test.yml` and `typecheck.yml` lanes.

## How quality is enforced in practice

The practical enforcement stack looks like this:

1. **Root guardrails prevent the wrong workflow**
   - root tests are intentionally blocked
   - developers are forced into package-local commands

2. **Pre-push type safety**
   - `.husky/pre-push` checks Bun version compatibility and runs `bun typecheck`

3. **Package-local ownership**
   - each major package owns its own test/typecheck scripts
   - app and opencode packages also provide CI/JUnit variants
   - the VS Code SDK keeps a separate extension-specific lane with `eslint`, `tsc`, and `vscode-test`

4. **Turbo dependencies force build-before-test where needed**
   - `turbo.json` ties test tasks to upstream `build`

5. **Cross-platform CI**
   - `test.yml` runs unit and e2e on Linux and Windows instead of only one dev OS

6. **Artifact-based debugging**
   - JUnit XML, Playwright reports, screenshots, videos, and test-results are uploaded

7. **Process quality, not just code quality**
   - `pr-standards.yml` enforces PR title conventions, linked issues, and PR template compliance

## Overall testing takeaway

OpenCode’s testing posture is **behavioral and workflow-driven** rather than coverage-metric-driven.

The strongest patterns are:

- package-local Bun testing instead of root monolith runs
- real temp repos, real git, real file/process behavior for integration tests
- Effect-native test helpers for service-heavy backend code
- Happy DOM + selective module mocking for app/UI tests
- Playwright e2e wiring with CI retries and artifact capture
- typecheck and PR-process enforcement as part of the quality system

The repo appears to value **practical reliability and fast debugging artifacts** more than explicit coverage percentages.
