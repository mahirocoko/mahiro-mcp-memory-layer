# oh-my-openagent Code Snippets

## Scope and evidence

Source read from `origin/` only.

Primary anchors:

* `origin/package.json`
* `origin/src/index.ts`
* `origin/src/plugin-interface.ts`
* `origin/src/create-managers.ts`
* `origin/src/create-hooks.ts`
* `origin/src/plugin-config.ts`
* `origin/src/create-runtime-tmux-config.ts`
* `origin/src/hooks/question-label-truncator/hook.ts`
* `origin/src/hooks/compaction-context-injector/hook.ts`

## 1. Package entry points

`origin/package.json` shows the published surface and the build path.

```json
"main": "./dist/index.js",
"bin": {
  "oh-my-opencode": "bin/oh-my-opencode.js"
}
```

Why it matters: the package ships as both a plugin entry and a CLI wrapper, so the source tree has to support both runtime shapes.

## 2. Plugin bootstrap stays thin

`origin/src/index.ts` is pure wiring. It loads config, builds managers, tools, hooks, then the final plugin interface.

```ts
const managers = createManagers({
  ctx,
  pluginConfig,
  tmuxConfig,
  modelCacheState,
  backgroundNotificationHookEnabled: isHookEnabled("background-notification"),
})
const toolsResult = await createTools({ ctx, pluginConfig, managers })
const hooks = createHooks({ ctx, pluginConfig, modelCacheState, backgroundManager: managers.backgroundManager, isHookEnabled, safeHookEnabled, mergedSkills: toolsResult.mergedSkills, availableSkills: toolsResult.availableSkills })
```

Why it matters: `index.ts` does orchestration only, which matches the repo rule that entry files should not hold business logic.

## 3. The exported plugin surface is a handler map

`origin/src/plugin-interface.ts` turns the internal subsystems into OpenCode hook handlers.

```ts
return {
  tool: tools,
  "chat.params": async (input: unknown, output: unknown) => { ... },
  config: managers.configHandler,
  event: createEventHandler({ ctx, pluginConfig, firstMessageVariantGate, managers, hooks }),
}
```

Why it matters: the plugin API is assembled as a single record, so each hook stays isolated and testable.

## 4. Managers wire lifecycle, cleanup, and session callbacks

`origin/src/create-managers.ts` creates the stateful managers and bridges background sessions into tmux and openclaw dispatch.

```ts
const tmuxSessionManager = new deps.TmuxSessionManagerClass(ctx, tmuxConfig)
deps.registerManagerForCleanupFn({
  shutdown: async () => {
    await tmuxSessionManager.cleanup().catch((error) => {
      log("[create-managers] tmux cleanup error during process shutdown:", error)
    })
  },
})
```

Why it matters: cleanup is explicit, and background session creation fans out to more than one subsystem.

## 5. Config loading uses parse, migrate, merge

`origin/src/plugin-config.ts` is the core config path. It reads user config, project config, migrates legacy names, and merges with section-specific rules.

```ts
const fullResult = OhMyOpenCodeConfigSchema.safeParse(rawConfig)
...
agents: deepMerge(base.agents, override.agents),
categories: deepMerge(base.categories, override.categories),
disabled_hooks: [...new Set([...(base.disabled_hooks ?? []), ...(override.disabled_hooks ?? [])])],
```

Why it matters: deep merge is used for structured sections, while disabled lists are deduped sets. That keeps config overrides predictable.

## 6. Hooks are composed in three layers

`origin/src/create-hooks.ts` combines core, continuation, and skill hooks, then exposes one disposal path.

```ts
const core = createCoreHooks({ ... })
const continuation = createContinuationHooks({ ..., sessionRecovery: core.sessionRecovery })
const skill = createSkillHooks({ ... })

return {
  ...core,
  ...continuation,
  ...skill,
  disposeHooks: (): void => { disposeCreatedHooks(hooks) },
}
```

Why it matters: policy is layered instead of centralized in one giant hook file.

## 7. A small hook example shows the style

`origin/src/hooks/question-label-truncator/hook.ts` is a compact tool-guard hook that rewrites question labels before `askUserQuestion` runs.

```ts
function truncateLabel(label: string, maxLength: number = MAX_LABEL_LENGTH): string {
  if (label.length <= maxLength) return label
  return label.substring(0, maxLength - 3) + "..."
}
```

```ts
if (toolName === "askuserquestion" || toolName === "ask_user_question") {
  const args = output.args as unknown as AskUserQuestionArgs | undefined
  if (args?.questions) {
    const truncatedArgs = truncateQuestionLabels(args)
    Object.assign(output.args, truncatedArgs)
  }
}
```

Why it matters: the hook is tiny, targeted, and easy to audit. That is the common pattern across the guard layer.

## 8. Runtime tmux config is a simple helper

`origin/src/create-runtime-tmux-config.ts` keeps tmux runtime checks focused.

```ts
export function isTmuxIntegrationEnabled(pluginConfig: { tmux?: { enabled?: boolean } | undefined }): boolean {
  return pluginConfig.tmux?.enabled ?? false
}
```

Why it matters: the rest of the bootstrap can ask one question and stay out of tmux details.

## 9. Compaction context injection preserves session state

`origin/src/hooks/compaction-context-injector/hook.ts` captures prompt config before compaction and injects history back into the next prompt.

```ts
const capture = async (sessionID: string): Promise<void> => {
  const promptConfig = await resolveSessionPromptConfig(ctx, sessionID)
  if (!promptConfig.agent && !promptConfig.model && !promptConfig.tools) return
  setCompactionAgentConfigCheckpoint(sessionID, promptConfig)
}
```

Why it matters: compaction does not just shrink context, it also preserves enough state to restore behavior after the shrink.

## Short readout

The strongest snippets are the bootstrap chain in `src/index.ts`, the config merge rules in `src/plugin-config.ts`, and the layered hook composition in `src/create-hooks.ts`. Together they show a repo that keeps entry files thin, pushes policy into small factories, and uses targeted hooks for runtime behavior.
