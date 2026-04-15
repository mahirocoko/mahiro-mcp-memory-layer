# oracle-family-skills — API Surface

## Public surface

### 1. CLI API

Main CLI surface lives in:

- `origin/src/cli/index.ts`

The architecture lane identified the main command family as:

- install
- uninstall
- agents
- list

This is the primary runtime API of the package.

### 2. Skill contract surface

The real long-lived API of this repo is the `SKILL.md` format plus optional `scripts/` layout under `src/skills/<name>/`.

Key examples:

- `origin/src/skills/learn/SKILL.md`
- `origin/src/skills/project/SKILL.md`
- `origin/src/skills/gemini/SKILL.md`
- `origin/src/skills/viral/SKILL.md`

These are effectively public extension surfaces for the installer/compiler pipeline.

### 3. Generated command surface

`origin/src/commands/*.md` are generated command stubs that mirror skills and tell host agents how to invoke the installed skill definitions.

Representative example:
- `origin/src/commands/learn.md`

### 4. Agent integration boundary

`origin/src/cli/agents.ts` defines where each supported agent expects skills and commands to be installed. That file is the adapter boundary between Oracle-family skill content and specific host agent ecosystems.

### 5. OpenCode hook surface

`origin/src/hooks/opencode/oracle-skills.ts` shows that the repo does not only ship passive files. It also has OpenCode-specific integration glue that can modify runtime interaction shape.

## Extension points

### New skill creation

The template and skill tree imply the extension model:

- create `src/skills/<name>/SKILL.md`
- optionally add `src/skills/<name>/scripts/*`
- run compiler/generators to produce command stubs and metadata

### Learn-output surface

`origin/src/skills/learn/SKILL.md` also defines a stable documentation API for learn artifacts:

- hub file
- `.origins` manifest
- date folder
- HHMM-prefixed doc files

That means `/learn` output format is itself part of this repo’s API surface.

## Integration takeaway

The repo’s public surface is not a library API in the classic import/export sense. Its real API is the combination of:

- CLI commands
- skill folder contract
- generated command stubs
- per-agent install path mapping
- a few host-specific runtime hooks

That is what other agents and Oracle repos integrate with in practice.
