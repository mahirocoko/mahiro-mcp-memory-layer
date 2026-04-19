# opencode Learning Index

## Source
- **Origin**: `./origin/`
- **GitHub**: https://github.com/anomalyco/opencode

## Explorations

### 2026-04-19 1726 (deep)
- [[2026-04-19/1726_ARCHITECTURE|Architecture]]
- [[2026-04-19/1726_CODE-SNIPPETS|Code Snippets]]
- [[2026-04-19/1726_QUICK-REFERENCE|Quick Reference]]
- [[2026-04-19/1726_TESTING|Testing]]
- [[2026-04-19/1726_API-SURFACE|API Surface]]

**Key insights**:
- `anomalyco/opencode` is a real product monorepo, with `packages/opencode` as the engine and multiple shells around it such as app, desktop, plugin, and SDK packages.
- The core runtime is client/server shaped, Effect-heavy, and organized around explicit domains like session, tool, provider, project, and server rather than a thin CLI wrapper.
- Testing is package-local and quality is enforced through package-specific Bun tests, app Playwright lanes, typecheck CI, and root-level guards that intentionally block running tests from the workspace root.
