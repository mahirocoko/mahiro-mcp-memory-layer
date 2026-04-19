# anomalyco/opencode — code snippets and explanations

This file collects short, high-signal snippets from the `origin/` checkout to explain how OpenCode starts, how its runtime is composed, and how failures are surfaced.

## 1) Main entry point: root script -> CLI package

**Path:** `package.json`

> `"dev": "bun run --cwd packages/opencode --conditions=browser src/index.ts"`

Why it matters: the monorepo’s default dev path points straight at `packages/opencode/src/index.ts`, so that file is the real starting point for the CLI/server runtime.

## 2) CLI bootstrap: logging, env flags, and one-time migration

**Path:** `packages/opencode/src/index.ts`

> `await Log.init({ ... })`
>
> `Heap.start()`
>
> `process.env.AGENT = "1"`
>
> `process.env.OPENCODE = "1"`

Why it matters: startup does more than parse args. It establishes logging, heap/process telemetry, and environment markers before any command runs.

**Path:** `packages/opencode/src/index.ts`

> `const marker = path.join(Global.Path.data, "opencode.db")`
>
> `if (!(await Filesystem.exists(marker))) { ... await JsonMigration.run(...) ... }`

Why it matters: the CLI owns first-run state migration itself. OpenCode treats startup as operational bootstrapping, not just command dispatch.

## 3) CLI command registration and fatal boundary

**Path:** `packages/opencode/src/index.ts`

> `.command(RunCommand)`
>
> `.command(ServeCommand)`
>
> `.command(McpCommand)`
>
> `.command(WebCommand)`

Why it matters: this is the central control surface for the CLI. Most user-facing behavior fans out from here.

**Path:** `packages/opencode/src/index.ts`

> `Log.Default.error("fatal", data)`
>
> `const formatted = FormatError(e)`
>
> `if (formatted) UI.error(formatted)`

Why it matters: top-level failure handling keeps structured logs for debugging while still converting known failures into clean terminal UX.

## 4) Headless server startup

**Path:** `packages/opencode/src/cli/cmd/serve.ts`

> `const opts = await resolveNetworkOptions(args)`
>
> `const server = await Server.listen(opts)`
>
> `console.log(\`opencode server listening on http://${server.hostname}:${server.port}\`)`

Why it matters: the server mode is intentionally tiny. It resolves network config, starts the server, prints a readiness line, then stays alive indefinitely.

## 5) End-to-end SDK flow: spawn the CLI and wait for readiness

**Path:** `packages/sdk/js/src/server.ts`

> `const proc = launch(\`opencode\`, args, { ... })`
>
> `if (line.startsWith("opencode server listening")) { ... resolve(match[1]!) }`

Why it matters: the JS SDK does not embed the server. It treats `opencode serve` as the system boundary and watches stdout for the “ready” contract.

**Path:** `packages/sdk/js/src/server.ts`

> `reject(new Error(\`Timeout waiting for server to start after ${options.timeout}ms\`))`
>
> `reject(new Error(\`Failed to parse server url from output: ${line}\`))`

Why it matters: startup failures are explicit and actionable. The SDK distinguishes timeout, bad readiness output, exit, and process-spawn errors.

## 6) VS Code integration: launch CLI, poll HTTP, append prompt

**Path:** `sdks/vscode/src/extension.ts`

> `terminal.sendText(\`opencode --port ${port}\`)`
>
> `await fetch(\`http://localhost:${port}/app\`)`
>
> `await appendPrompt(port, \`In ${fileRef}\`)`

Why it matters: this is a clean end-to-end integration example. The extension launches the CLI in a terminal, waits for the local app endpoint to respond, then injects editor context into the running TUI.

**Path:** `sdks/vscode/src/extension.ts`

> `let filepathWithAt = \`@${relativePath}\``
>
> `filepathWithAt += \`#L${startLine}-${endLine}\``

Why it matters: OpenCode’s editor integrations convert file/selection state into compact `@path#Lx-Ly` prompt references instead of shipping raw file contents by default.

## 7) Project-scoped bootstrap wrapper

**Path:** `packages/opencode/src/cli/bootstrap.ts`

> `return Instance.provide({`
>
> `  directory,`
>
> `  init: () => AppRuntime.runPromise(InstanceBootstrap),`
>
> `  fn: async () => {`
>
> `    try {`
>
> `      const result = await cb()`
>
> `      return result`
>
> `    } finally {`
>
> `      await Instance.dispose()`
>
> `    }`
>
> `  },`
>
> `})`

Why it matters: commands that operate on a project directory are wrapped in a scoped lifetime. Initialization and cleanup are centralized instead of being repeated per command.

## 8) Core idiom: Effect-based parallel service initialization

**Path:** `packages/opencode/src/project/bootstrap.ts`

> `yield* Config.Service.use((svc) => svc.get())`
>
> `yield* Plugin.Service.use((svc) => svc.init())`
>
> `yield* Effect.all([ ... ].map((s) => Effect.forkDetach(s.use((i) => i.init()))))`

Why it matters: this file shows a core OpenCode pattern. Config is loaded first, plugins are initialized early because they can mutate config, then independent services are started in parallel with Effect.

**Path:** `packages/opencode/src/project/bootstrap.ts`

> `svc.subscribeCallback(Command.Event.Executed, async (payload) => {`
>
> `  if (payload.properties.name === Command.Default.INIT) {`
>
> `    Project.setInitialized(Instance.project.id)`
>
> `  }`
>
> `})`

Why it matters: initialization state is driven by bus events, which is a good clue that the runtime is event-oriented rather than a single monolithic request loop.

## 9) Tool system composition: built-ins + filesystem tools + plugins

**Path:** `packages/opencode/src/tool/registry.ts`

> `const matches = dirs.flatMap((dir) =>`
>
> `  Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true }),`
>
> `)`

Why it matters: user/project tools are discovered from the filesystem, not hardcoded. That helps explain how OpenCode stays extensible without rebuilding the app.

**Path:** `packages/opencode/src/tool/registry.ts`

> `for (const p of plugins) {`
>
> `  for (const [id, def] of Object.entries(p.tool ?? {})) {`
>
> `    custom.push(fromPlugin(id, def))`
>
> `  }`
>
> `}`

Why it matters: plugin tools and local custom tools converge into the same registry, so the runtime treats them as one tool surface after normalization.

**Path:** `packages/opencode/src/tool/registry.ts`

> `builtin: [`
>
> `  tool.invalid,`
>
> `  ...(questionEnabled ? [tool.question] : []),`
>
> `  tool.bash,`
>
> `  tool.read,`
>
> `  tool.glob,`
>
> `  ...`
>
> `]`

Why it matters: the tool palette is assembled dynamically from flags, client type, and service state. Tool exposure is policy-aware, not static.

## 10) Session processor: where LLM events become persisted runtime state

**Path:** `packages/opencode/src/session/processor.ts`

> `const initialSnapshot = yield* snapshot.track()`
>
> `const ctx: ProcessorContext = { ... blocked: false, needsCompaction: false, reasoningMap: {} }`

Why it matters: before streaming starts, the processor captures project snapshot state and creates a mutable execution context that tracks tool calls, reasoning parts, blocking, and compaction.

**Path:** `packages/opencode/src/session/processor.ts`

> `const failToolCall = Effect.fn("SessionProcessor.failToolCall")(...` 
>
> `state: {`
>
> `  status: "error",`
>
> `  input: match.part.state.input,`
>
> `  error: errorMessage(error),`
>
> `  time: { start: ..., end: Date.now() },`
>
> `}`

Why it matters: tool failures are not just thrown upward. They are turned into persisted message-part state so the session transcript reflects what failed and when.

**Path:** `packages/opencode/src/session/processor.ts`

> `if (error instanceof Permission.RejectedError || error instanceof Question.RejectedError) {`
>
> `  ctx.blocked = ctx.shouldBreak`
>
> `}`

Why it matters: permission denials and question rejections are treated as control-flow events that can block the agent loop, not just generic errors.

**Path:** `packages/opencode/src/session/processor.ts`

> `case "reasoning-start":`
>
> `case "reasoning-delta":`
>
> `case "reasoning-end":`

Why it matters: reasoning is modeled as first-class structured parts, not a single opaque string. That is a strong clue for how OpenCode preserves rich agent traces.

## 11) Client compatibility layer: request rewriting + server version guard

**Path:** `packages/sdk/js/src/v2/client.ts`

> `client.interceptors.request.use((request) => rewrite(request, { ... }))`

Why it matters: the SDK rewrites GET/HEAD requests so directory/workspace context can be passed either by headers or query params, smoothing over transport differences.

**Path:** `packages/sdk/js/src/v2/client.ts`

> `if (contentType === "text/html")`
>
> `  throw new Error("Request is not supported by this version of OpenCode Server ...")`

Why it matters: this is a simple but effective compatibility check. If the client hits an older or wrong server and gets HTML back, it fails with a targeted message instead of hiding the mismatch.

## 12) Error normalization for humans

**Path:** `packages/opencode/src/cli/error.ts`

> `if (NamedError.hasName(input, "ProviderModelNotFoundError")) {`
>
> `  return [`
>
> `    \`Model not found: ${data?.providerID}/${data?.modelID}\`,`
>
> `    ...`
>
> `    \`Try: \`opencode models\` to list available models\`,`
>
> `  ].join("\n")`
>
> `}`

Why it matters: OpenCode has a dedicated layer for turning typed internal errors into specific operator guidance, including recovery steps.

**Path:** `packages/opencode/src/cli/error.ts`

> `if (NamedError.hasName(input, "ProviderInitError")) {`
>
> `  return \`Failed to initialize provider "${(input as ErrorLike).data?.providerID}". Check credentials and configuration.\``
>
> `}`

Why it matters: this is representative of the repo’s error posture: precise, user-facing, and biased toward action rather than stack traces.

## 13) Guard-clause-heavy endpoint error handling

**Path:** `packages/console/app/src/routes/stripe/webhook.ts`

> `if (!workspaceID) throw new Error("Workspace ID not found")`
>
> `if (!customerID) throw new Error("Customer ID not found")`
>
> `if (!amountInCents) throw new Error("Amount not found")`

Why it matters: this repo often uses direct guard clauses instead of nested conditionals. It keeps deep workflows readable and makes failure points obvious.

**Path:** `packages/console/app/src/routes/stripe/webhook.ts`

> `if (!paymentMethod || typeof paymentMethod === "string") throw new Error("Payment method not expanded")`

Why it matters: runtime invariants are asserted aggressively when external APIs can return multiple shapes.

## 14) Dynamic resource adapter with Proxy

**Path:** `packages/console/resource/resource.node.ts`

> `export const Resource = new Proxy({}, {`
>
> `  get(_target, prop) {`
>
> `    const value = ResourceBase[prop]`
>
> `    if ("type" in value) { ... }`
>
> `    return value`
>
> `  },`
>
> `})`

Why it matters: this is a nice example of an adapter layer that converts SST resource descriptors into runtime-specific helpers, like Cloudflare KV clients.

## 15) End-to-end mental model

The most useful way to read this repo is:

1. **Root script** points you to `packages/opencode/src/index.ts`.
2. **CLI bootstrap** initializes logging, env, migrations, and command registration.
3. **`serve`** starts the headless HTTP server and prints a readiness line.
4. **SDK/editor integrations** spawn the CLI and wait for readiness over stdout or HTTP.
5. **Project commands** run through `cli/bootstrap.ts`, which gives each directory a scoped runtime.
6. **`project/bootstrap.ts`** starts config, plugins, LSP, formatting, file watching, VCS, and snapshot services.
7. **`tool/registry.ts`** merges built-ins, plugin tools, and local tools into one execution surface.
8. **`session/processor.ts`** turns streamed LLM/tool events into structured session state, including reasoning parts and tool errors.

If you only read a handful of files to understand OpenCode end to end, start with:

- `packages/opencode/src/index.ts`
- `packages/opencode/src/cli/cmd/serve.ts`
- `packages/sdk/js/src/server.ts`
- `packages/opencode/src/cli/bootstrap.ts`
- `packages/opencode/src/project/bootstrap.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/session/processor.ts`
- `packages/opencode/src/cli/error.ts`
