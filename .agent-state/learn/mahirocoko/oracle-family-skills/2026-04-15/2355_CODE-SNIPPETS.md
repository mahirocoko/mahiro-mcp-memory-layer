# oracle-family-skills — Code Snippets

## Scope and Evidence

- **Source analyzed**: `./origin/`
- **Primary anchors read**:
  - `origin/package.json`
  - `origin/src/cli/index.ts`
  - `origin/src/cli/installer.ts`
  - `origin/src/cli/agents.ts`
  - `origin/scripts/compile.ts`
  - `origin/src/commands/learn.md`

## Representative patterns

### 1. Root CLI as the published surface

From `origin/package.json`:

```json
{
  "bin": {
    "oracle-family-skills": "./src/cli/index.ts"
  },
  "scripts": {
    "build": "bun build src/cli/index.ts --outdir dist --target bun --minify",
    "test": "bun test __tests__/"
  }
}
```

**Why it matters**: the CLI entry is direct and Bun-native. This is not compiled from many packages first; the root command owns install/list/uninstall flows.

### 2. Skill folders are the source of truth

The repo structure and generators point one way: `src/skills/<skill>/SKILL.md` is canonical, while `src/commands/*.md` is generated output.

Example generated stub anchor:
- `origin/src/commands/learn.md`

**Why it matters**: if you want to understand behavior, read skill folders first and generated command stubs second.

### 3. Installer-driven runtime mapping

Key runtime anchors:
- `origin/src/cli/installer.ts`
- `origin/src/cli/agents.ts`

These files are where the repo turns generic skill folders into agent-specific installed layouts.

**Why it matters**: the repo’s real product is “install this skill set into Claude/OpenCode/Cursor/etc. correctly”, not just “ship markdown files”.

### 4. Compiler/generator pipeline

Generator anchors:
- `origin/scripts/compile.ts`
- `origin/scripts/generate-table.ts`
- `origin/scripts/update-readme-table.ts`

**Why it matters**: docs, command stubs, and README metadata are derived artifacts. That gives the repo a strong “single source of truth, generated outputs” design.

### 5. Canonical `/learn` output contract is encoded in the repo itself

From `origin/src/skills/learn/SKILL.md`, the repo explicitly defines:

- `ψ/learn/.origins`
- `ψ/learn/<owner>/<repo>/origin`
- `ψ/learn/<owner>/<repo>/<repo>.md`
- `ψ/learn/<owner>/<repo>/YYYY-MM-DD/HHMM_*.md`

**Why it matters**: this repo is not just using `/learn`; it codifies how `/learn` artifacts should be stored, named, and restored.
