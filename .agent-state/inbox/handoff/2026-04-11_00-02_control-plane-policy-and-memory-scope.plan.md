# Plan: Control Plane Policy and Memory Scope Follow-up

## Background
- Clarified async MCP worker flows and sync-call guardrails across code, tests, and README.
- Wrote the control-plane vs execution-plane and token-saving doctrine into `AGENTS.md`.
- Fixed OpenCode plugin memory scope binding with explicit override support plus a stable local fallback, then seeded durable project memory for today’s key decisions.
- Wrote the latest retrospective and local learning note, then pushed the handoff commit.

## Pending from Last Session
- [ ] Start a fresh session and verify `memory_context` now resolves a complete scope from the beginning of the session lifecycle.
- [ ] Decide whether to document `MAHIRO_OPENCODE_PLUGIN_USER_ID` / `runtime.userId` in user-facing plugin config docs.
- [ ] Decide whether local `.agent-state` retro/learning artifacts should remain local-only or ever be curated elsewhere.

## Next Session Goals
- [ ] Run `/recap` and immediately inspect `memory_context` in the new session.
- [ ] Confirm project memory retrieval works without restating today’s decisions.
- [ ] If discoverability still feels weak, add concise user-facing docs for the plugin user-id override.

## Next Session: Pick Your Path

| Option | Command | What It Does |
|--------|---------|--------------|
| **Continue** | `/recap` | Pick up from the new handoff and verify the memory path in a fresh session |
| **Clean up first** | `/recap` | There is no repo cleanup backlog right now; tree is clean and no open PRs/issues were listed |
| **Fresh start** | `/recap --quick` | Minimal context if you want to start a new thread without loading the full handoff |

### Cleanup Checklist (if any)
- [ ] None right now — `git status --short` is clean
- [ ] None right now — no extra local branches besides `main`
- [ ] None right now — no open PRs surfaced by `gh pr list`
- [ ] None right now — no open issues surfaced by `gh issue list`

## Reference
- Handoff: `/Users/mahiro/ghq/github.com/mahirocoko/mahiro-mcp-memory-layer/.agent-state/inbox/handoff/2026-04-11_00-02_control-plane-policy-and-memory-scope.md`
