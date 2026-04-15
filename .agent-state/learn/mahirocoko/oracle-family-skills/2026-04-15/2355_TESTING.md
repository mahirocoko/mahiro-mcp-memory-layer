# oracle-family-skills — Testing

## Scope and Evidence

- **Source analyzed**: `./origin/`
- **Primary anchors read**:
  - `origin/package.json`
  - `origin/bun.lock`
  - `origin/tsconfig.json`
  - `origin/lefthook.yml`
  - `origin/.github/workflows/ci.yml`
  - `origin/.github/workflows/release.yml`
  - `origin/__tests__/smoke.test.ts`
  - `origin/__tests__/integration.test.ts`
  - `origin/__tests__/compile.test.ts`

## Verification stack

### Root scripts

From `origin/package.json`:

- `build`
- `test`
- `compile`
- `prepare`
- `prepublishOnly`

The root repo is Bun-managed and uses `bun test __tests__/` as the main test entry.

### CI posture

The quality lane found that `origin/.github/workflows/ci.yml` runs:

- Ubuntu test flow
- macOS + Windows smoke matrix
- CLI behavior checks
- build verification that checks for `dist/index.js`

`origin/.github/workflows/release.yml` reruns tests before publishing a release.

### Pre-commit discipline

`origin/lefthook.yml` is part of the quality posture. Together with `prepare`, it enforces test-related discipline before commit.

### Type-safety signal

`origin/tsconfig.json` has `strict: true`, which is a meaningful signal even though the repo does not expose a dedicated root `typecheck` script in `package.json`.

## Representative tests

- `origin/__tests__/smoke.test.ts` — smoke/runnable-path checks
- `origin/__tests__/integration.test.ts` — install layout and integration behavior
- `origin/__tests__/compile.test.ts` — command-stub/compiler contract checks
- `origin/__tests__/installer-behavior.test.ts` — installer output differences by agent type

## Present vs absent

### Present
- Bun lockfile
- root test suite
- CI workflows
- release workflow with test rerun
- pre-commit hook discipline
- strict TS config

### Not clearly evidenced at root
- dedicated `lint` script
- dedicated `typecheck` script
- explicit coverage reporting/config
- eslint/prettier/biome root config

## Testing takeaway

The repo’s strongest quality signals are installer/compile/smoke verification and cross-platform CLI checks. It is more disciplined than a typical markdown-skill repo because it treats generation and installation as behavior that must be tested, not just documented.
