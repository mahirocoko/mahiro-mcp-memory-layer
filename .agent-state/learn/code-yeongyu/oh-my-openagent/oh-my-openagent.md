# oh-my-openagent Learning Index

## Source
- **Origin**: ./origin/
- **GitHub**: https://github.com/code-yeongyu/oh-my-openagent

## Explorations

### 2026-04-16 0006 (deep)
- [[2026-04-16/0006_ARCHITECTURE|Architecture]]
- [[2026-04-16/0006_CODE-SNIPPETS|Code Snippets]]
- [[2026-04-16/0006_QUICK-REFERENCE|Quick Reference]]
- [[2026-04-16/0006_TESTING|Testing]]
- [[2026-04-16/0006_API-SURFACE|API Surface]]

**Key insights**: This repo is an OpenCode plugin plus companion CLI rather than a single monolith; `task(...)` and `BackgroundManager` form the core orchestration runtime; the codebase is unusually focused on runtime reliability with race/recovery/verification-heavy tests.

### 2026-04-16 1435 (default)
- [[2026-04-16/1435_ARCHITECTURE|Architecture]]
- [[2026-04-16/1435_CODE-SNIPPETS|Code Snippets]]
- [[2026-04-16/1435_QUICK-REFERENCE|Quick Reference]]

**Key insights**: This run re-emphasized the plugin and CLI split, the config -> managers -> tools -> hooks composition chain, and the practical install/usage surface published as `oh-my-opencode` while keeping `oh-my-openagent` as the compatibility plugin name.
