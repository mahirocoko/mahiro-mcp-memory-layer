# oracle-family-skills — Architecture

## Scope and Evidence

- **Source analyzed**: `./origin/`
- **Primary anchors read**:
  - `origin/README.md`
  - `origin/package.json`
  - `origin/src/cli/index.ts`
  - `origin/src/cli/installer.ts`
  - `origin/src/cli/agents.ts`
  - `origin/scripts/compile.ts`
  - `origin/src/skills/learn/SKILL.md`

## What this repo is

`oracle-family-skills` is a single-package Bun CLI that installs and manages Oracle-family skills across multiple agent ecosystems. Its architecture is built around one core idea: **`src/skills/*/SKILL.md` is the source of truth**, then the CLI and generators compile, copy, and adapt those skills into per-agent install surfaces.

## Top-level structure

- `src/cli/` — installer/runtime entrypoints
- `src/skills/` — source skill definitions and code-backed skill scripts
- `src/commands/` — generated slash-command stubs
- `src/hooks/` — agent-specific glue, including OpenCode hook integration
- `scripts/` — compilers and README/metadata generators
- `docs/` — operational docs, mostly around Flow/Gemini/viral workflows
- `__tests__/` — root verification suite

## Entry points

- Package entry: `origin/package.json`
- CLI entry: `origin/src/cli/index.ts`
- Installer runtime: `origin/src/cli/installer.ts`
- Skill-to-command compiler: `origin/scripts/compile.ts`
- Shell bootstrap: `origin/install.sh`

## Main architecture chain

1. skills live in `origin/src/skills/<name>/SKILL.md`
2. optional code lives beside them in `origin/src/skills/<name>/scripts/`
3. `origin/scripts/compile.ts` generates `origin/src/commands/*.md`
4. `origin/src/cli/installer.ts` copies skills into per-agent install locations and emits command stubs when the target agent supports them
5. `origin/src/cli/agents.ts` defines the mapping from agent name to local/global skills and commands directories

## Package boundaries

The published product surface is mostly the root package. I found no monorepo workspace files like `pnpm-workspace.yaml` or `turbo.json`. There is one nested package at `origin/src/skills/gemini/extension/package.json` for the Gemini browser extension, plus incubating subprojects under `origin/ψ/incubate/`, but those are not the main published CLI surface.

## Important subsystem cluster

- `gemini/` — the largest code-backed runtime skill, including browser extension support
- `viral/` — orchestration layer that composes with Gemini/Flow-style automation
- `watch/` — learning/transcription flow that saves memory-style artifacts
- `project/` — `ghq` + `ψ/learn|incubate` repo tracking system
- `oraclenet/` — OracleNet identity/posting subsystem

## Architecture takeaway

This repo is best understood as a **skill distribution and installation runtime**, not just a markdown collection. The CLI, compiler, and agent-directory mapping are what turn raw skill folders into installed, agent-specific behavior.
