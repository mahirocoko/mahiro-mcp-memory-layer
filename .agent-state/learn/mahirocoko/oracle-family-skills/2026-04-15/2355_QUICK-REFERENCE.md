# oracle-family-skills — Quick Reference

## What this project does

Installs Oracle-family skills into Claude Code, OpenCode, Cursor, and many other agent environments. It is the single entry point for Oracle skill installation and supersedes older split repos according to `origin/README.md`.

## Install/runtime basics

Primary public install surface from `origin/README.md`:

- one-command installer via `install.sh`
- Bun + `ghq` as core prerequisites
- global CLI usage through `oracle-family-skills`

## Repo structure to read first

1. `origin/README.md`
2. `origin/package.json`
3. `origin/src/skills/learn/SKILL.md`
4. `origin/src/cli/index.ts`
5. `origin/src/cli/installer.ts`
6. `origin/src/cli/agents.ts`
7. `origin/scripts/compile.ts`

## Key concepts

- **skills as source** — `src/skills/*/SKILL.md`
- **commands as generated output** — `src/commands/*.md`
- **CLI installer** — copies skills and emits command stubs
- **multi-agent targeting** — agent-specific path mapping in `src/cli/agents.ts`
- **ψ state** — learn/incubate/memory conventions used by some skills

## Notable skills to inspect

- `learn` — codebase study and documentation output contract
- `project` — repo clone/track workflow
- `gemini` — largest code-backed runtime skill
- `viral` — Flow/Gemini orchestration
- `watch` — learning/transcription artifact flow
- `oraclenet` — OracleNet workflow

## One-sentence summary

This repo is a Bun CLI that compiles and installs a family of cross-agent skills from a single markdown-first source tree.
