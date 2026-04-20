import { paths } from "../../../../config/paths.js";
import { buildTaskCompletionToken, TmuxRuntimeOwner } from "../../../orchestration/runtime/tmux-runtime-owner.js";
import { TmuxSubagentManager } from "../../../orchestration/subagents/tmux-subagent-manager.js";
import { SubagentSessionStore } from "../../../orchestration/subagents/subagent-session-store.js";
import { extractInteractiveGeminiResponse } from "../shell/interactive-gemini-response.js";
import { buildGeminiInteractiveShellArgs, buildGeminiInteractiveTmuxSessionArgs } from "../shell/shell-gemini-runtime.js";
import type { GeminiCommandRunResult, GeminiWorkerInput, GeminiWorkerRuntime } from "../../types.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasGeminiCompleted(output: string): boolean {
  return output.includes("✦ ") && output.includes("Type your message or @path/to/file");
}

const approvalPromptMatchers = [
  "Approve this action?",
  "Do you want to proceed?",
  "Press enter to confirm",
  "Allow this action?",
] as const;

function toGeminiResult(
  output: string,
  input: GeminiWorkerInput,
  timedOut: boolean,
  extra?: {
    approvalRequired?: boolean;
    approvalPrompt?: string;
  },
): GeminiCommandRunResult {
  const response = extractInteractiveGeminiResponse(output);
  return {
    stdout: JSON.stringify({
      response,
      stats: { model: input.model },
      rawOutput: output,
      ...(extra?.approvalRequired ? { approvalRequired: true } : {}),
      ...(extra?.approvalPrompt ? { approvalPrompt: extra.approvalPrompt } : {}),
    }),
    stderr: "",
    exitCode: timedOut ? null : 0,
    signal: timedOut ? "SIGTERM" : null,
    timedOut,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
  };
}

export class InteractiveGeminiTmuxRuntime implements GeminiWorkerRuntime {
  private readonly subagentManager: TmuxSubagentManager;
  private static readonly defaultTimeoutMs = 900_000;

  public constructor(private readonly tmuxRuntimeOwner: TmuxRuntimeOwner = new TmuxRuntimeOwner()) {
    this.subagentManager = new TmuxSubagentManager(
      this.tmuxRuntimeOwner,
      new SubagentSessionStore(paths.orchestrationSubagentDirectory),
    );
  }

  public async run(input: GeminiWorkerInput): Promise<GeminiCommandRunResult> {
    const prompt = input.prompt;
    const token = buildTaskCompletionToken(`unused-${input.taskId}`);
    const timeoutMs = input.timeoutMs ?? InteractiveGeminiTmuxRuntime.defaultTimeoutMs;
    const existingSession = input.subagentId
      ? await this.subagentManager.inspectSession(input.subagentId)
      : null;
    const isNewSession = !existingSession || existingSession.status !== "running";
    const session = await this.subagentManager.ensureSession({
      subagentId: input.subagentId,
      workerKind: "gemini",
      model: input.model,
      executable: "gemini",
      args: isNewSession
        ? buildGeminiInteractiveShellArgs({ ...input, prompt })
        : buildGeminiInteractiveTmuxSessionArgs(input),
      cwd: input.cwd,
    });
    await this.subagentManager.recordTask(session.subagentId, input.taskId);
    const result = await this.tmuxRuntimeOwner.runInteractiveTask({
      sessionName: session.sessionName,
      paneId: session.paneId,
      executable: "gemini",
      args: isNewSession
        ? buildGeminiInteractiveShellArgs({ ...input, prompt })
        : buildGeminiInteractiveTmuxSessionArgs(input),
      ...(isNewSession
        ? {}
        : {
            prompt,
            promptReadyWhen: "Type your message or @path/to/file",
            promptReadyDelayMs: 5000,
          }),
      completionToken: token,
      timeoutMs,
      preserveSession: true,
      autoResponses: [
        {
          match: "Do you trust the files in this folder?",
          input: "1",
        },
      ],
      interruptOnMatches: [...approvalPromptMatchers],
    });
    let finalResult = result;
    if (result.timedOut && hasGeminiCompleted(result.output)) {
      finalResult = {
        ...result,
        timedOut: false,
        completionDetected: true,
      };
    }
    if (!result.timedOut && !result.completionDetected) {
      const deadline = Date.now() + Math.max(5_000, timeoutMs);
      let latestOutput = result.output;

      while (Date.now() < deadline) {
        await delay(1000);
        latestOutput = await this.tmuxRuntimeOwner.capturePane(session.paneId);
        if (hasGeminiCompleted(latestOutput)) {
          finalResult = {
            ...result,
            output: latestOutput,
            completionDetected: true,
          };
          break;
        }

        const stillExists = await this.tmuxRuntimeOwner.hasSession(session.sessionName);
        if (!stillExists) {
          break;
        }
      }

      if (!finalResult.completionDetected && hasGeminiCompleted(latestOutput)) {
        finalResult = {
          ...result,
          output: latestOutput,
          completionDetected: true,
        };
      } else if (!finalResult.completionDetected) {
        finalResult = {
          ...result,
          output: latestOutput,
          timedOut: true,
        };
      }
    }

    const commandResult = toGeminiResult(finalResult.output, input, finalResult.timedOut, {
      ...(finalResult.interruptedReason === "approval_required" ? { approvalRequired: true } : {}),
      ...(finalResult.matchedText ? { approvalPrompt: finalResult.matchedText } : {}),
    });
    return {
      ...commandResult,
      stdout: JSON.stringify({
        ...JSON.parse(commandResult.stdout),
        subagentId: session.subagentId,
        sessionName: session.sessionName,
        paneId: session.paneId,
      }),
    };
  }
}

export const interactiveTmuxGeminiRuntime = new InteractiveGeminiTmuxRuntime();
