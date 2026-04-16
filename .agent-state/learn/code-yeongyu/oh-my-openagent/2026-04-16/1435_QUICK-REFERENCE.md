# oh-my-openagent Quick Reference

## What it does

`oh-my-openagent` is an OpenCode plugin and CLI for multi-agent orchestration. It wires in specialized agents, hooks, tools, built-in MCPs, and safety checks so OpenCode can run longer tasks with less manual steering.

It is published as `oh-my-opencode`, with `oh-my-openagent` kept as the compatibility plugin name in OpenCode configs during the transition.

## Installation

### Standard install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-openagent"]
}
```

### CLI install

```bash
bunx oh-my-opencode install
```

This repo is Bun-first. The package scripts use Bun for build, test, and CLI flows.

### Local checkout install

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/oh-my-openagent"]
}
```

Use the `file://` path when iterating on a local checkout. The README says this path can also inject the standalone MCP server config automatically.

## Key features

- Multi-agent orchestration with agents like Sisyphus, Hephaestus, Prometheus, Oracle, Librarian, and Explore
- `run` command that waits until todos are done and child sessions are idle
- `doctor` command for system, config, tools, and model checks
- `ultrawork` and `ulw` shortcuts for agent-driven work loops
- Hashline edit safety, which uses content hashes to reject stale-line edits
- LSP tools and AST-Grep support for precise refactors and search
- Built-in MCPs for web search, docs lookup, and GitHub code search
- Claude Code compatibility for hooks, commands, skills, and MCPs
- Built-in productivity hooks like todo enforcement, comment checking, continuation handling, and session recovery
- tmux integration for interactive terminal workflows

## Usage patterns

### Start a task

```bash
bunx oh-my-opencode run "Fix the bug in index.ts"
```

Useful flags include `--agent`, `--model`, `--directory`, `--json`, `--session-id`, `--port`, and `--attach`.

### Check the install

```bash
bunx oh-my-opencode doctor
```

Use `--status`, `--verbose`, or `--json` when you need more detail.

### Check versions

```bash
bunx oh-my-opencode get-local-version
```

### Refresh model metadata

```bash
bunx oh-my-opencode refresh-model-capabilities
```

### Run the ultrawork loop

Type `ultrawork` or `ulw` in the supported OpenCode flow to trigger the main orchestration loop.

## Best mental model

- Config decides which agents, hooks, tools, and MCPs are active
- The CLI starts, inspects, or runs the plugin
- The plugin keeps long tasks on track with hooks, continuation enforcement, and hash-checked edits
