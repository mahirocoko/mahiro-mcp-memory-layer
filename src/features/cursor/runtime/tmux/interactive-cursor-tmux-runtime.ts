import { paths } from "../../../../config/paths.js";
import { appendTaskCompletionInstruction, buildTaskCompletionToken, TmuxRuntimeOwner } from "../../../orchestration/runtime/tmux-runtime-owner.js";
import { SubagentSessionStore } from "../../../orchestration/subagents/subagent-session-store.js";
import { TmuxSubagentManager } from "../../../orchestration/subagents/tmux-subagent-manager.js";
import { buildCursorShellArgs } from "../shell/shell-cursor-runtime.js";
import type { CursorCommandRunResult, CursorWorkerInput, CursorWorkerRuntime } from "../../types.js";

function extractCursorInteractiveResult(output: string, taskId: string): string {
  const token = buildTaskCompletionToken(taskId);
  return output.replaceAll(token, "").trim();
}

export class InteractiveCursorTmuxRuntime implements CursorWorkerRuntime {
  private readonly subagentManager: TmuxSubagentManager;

  public constructor(private readonly tmuxRuntimeOwner: TmuxRuntimeOwner = new TmuxRuntimeOwner()) {
    this.subagentManager = new TmuxSubagentManager(
      this.tmuxRuntimeOwner,
      new SubagentSessionStore(paths.orchestrationSubagentDirectory),
    );
  }

  public async run(input: CursorWorkerInput): Promise<CursorCommandRunResult> {
    const prompt = appendTaskCompletionInstruction(input.prompt, input.taskId);
    const token = buildTaskCompletionToken(input.taskId);
    const baseArgs = buildCursorShellArgs({ ...input, prompt }).filter((arg) => arg !== "-p" && arg !== "--output-format" && arg !== "json" && arg !== prompt);
    const session = await this.subagentManager.ensureSession({
      subagentId: input.subagentId,
      workerKind: "cursor",
      model: input.model,
      executable: "agent",
      args: baseArgs,
      cwd: input.cwd,
    });
    await this.subagentManager.recordTask(session.subagentId, input.taskId);
    const result = await this.tmuxRuntimeOwner.runInteractiveTask({
      sessionName: session.sessionName,
      paneId: session.paneId,
      executable: "agent",
      args: baseArgs,
      prompt,
      completionToken: token,
      timeoutMs: input.timeoutMs,
      preserveSession: true,
    });

    return {
      stdout: JSON.stringify({
        type: "result",
        subtype: result.timedOut ? "timeout" : result.completionDetected ? "success" : "incomplete",
        result: extractCursorInteractiveResult(result.output, input.taskId),
        model: input.model,
        rawOutput: result.output,
        subagentId: session.subagentId,
        sessionName: session.sessionName,
        paneId: session.paneId,
      }),
      stderr: "",
      exitCode: result.timedOut ? null : 0,
      signal: result.timedOut ? "SIGTERM" : null,
      timedOut: result.timedOut,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }
}

export const interactiveTmuxCursorRuntime = new InteractiveCursorTmuxRuntime();
