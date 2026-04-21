import { spawn } from "node:child_process";

export interface TmuxSpawnResult {
  readonly sessionName: string;
  readonly paneId: string;
}

export interface TmuxRuntimeTaskInput {
  readonly sessionName: string;
  readonly executable: string;
  readonly args: string[];
  readonly paneId?: string;
  readonly prompt?: string;
  readonly promptReadyWhen?: string;
  readonly promptReadyDelayMs?: number;
  readonly cwd?: string;
  readonly completionToken: string;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly preserveSession?: boolean;
  readonly autoResponses?: Array<{
    readonly match: string;
    readonly input: string;
  }>;
  readonly interruptOnMatches?: string[];
}

export interface TmuxRuntimeTaskResult {
  readonly output: string;
  readonly timedOut: boolean;
  readonly completionDetected: boolean;
  readonly sessionName: string;
  readonly paneId: string;
  readonly interruptedReason?: "approval_required";
  readonly matchedText?: string;
  readonly promptSubmissionAttempted: boolean;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function toShellCommand(executable: string, args: string[]): string {
  return [executable, ...args].map(quoteShellArg).join(" ");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TmuxRuntimeOwner {
  private runTmux(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn("tmux", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", reject);
      child.once("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });
    });
  }

  public async createDetachedTask(input: {
    readonly sessionName: string;
    readonly executable: string;
    readonly args: string[];
    readonly cwd?: string;
  }): Promise<TmuxSpawnResult> {
    const result = await this.runTmux([
      "new-session",
      "-d",
      "-s",
      input.sessionName,
      "-P",
      "-F",
      "#{session_name}\t#{pane_id}",
      ...(input.cwd ? ["-c", input.cwd] : []),
      toShellCommand(input.executable, input.args),
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`tmux new-session failed: ${result.stderr || result.stdout || "unknown error"}`);
    }

    const [sessionName, paneId] = result.stdout.trim().split(/\t/);
    if (!sessionName || !paneId) {
      throw new Error(`tmux new-session returned an unparseable descriptor: ${result.stdout}`);
    }

    return {
      sessionName,
      paneId,
    };
  }

  public async capturePane(paneId: string): Promise<string> {
    const result = await this.runTmux(["capture-pane", "-p", "-t", paneId, "-S", "-200"]);
    if (result.exitCode !== 0) {
      throw new Error(`tmux capture-pane failed: ${result.stderr || result.stdout || "unknown error"}`);
    }
    return result.stdout;
  }

  public async killSession(sessionName: string): Promise<void> {
    await this.runTmux(["kill-session", "-t", sessionName]);
  }

  public async hasSession(sessionName: string): Promise<boolean> {
    const result = await this.runTmux(["has-session", "-t", sessionName]);
    return result.exitCode === 0;
  }

  public async sendKeys(paneId: string, input: string): Promise<void> {
    const textResult = await this.runTmux(["send-keys", "-t", paneId, "-l", input]);
    if (textResult.exitCode !== 0) {
      throw new Error(`tmux send-keys failed: ${textResult.stderr || textResult.stdout || "unknown error"}`);
    }
    const enterResult = await this.runTmux(["send-keys", "-t", paneId, "Enter"]);
    if (enterResult.exitCode !== 0) {
      throw new Error(`tmux send-keys enter failed: ${enterResult.stderr || enterResult.stdout || "unknown error"}`);
    }
  }

  public async runInteractiveTask(input: TmuxRuntimeTaskInput): Promise<TmuxRuntimeTaskResult> {
    const spawned = input.paneId
      ? { sessionName: input.sessionName, paneId: input.paneId }
      : await this.createDetachedTask(input);
    let promptSent = false;
    if (input.prompt && !input.promptReadyWhen) {
      await this.sendKeys(spawned.paneId, input.prompt);
      promptSent = true;
    }
    const pollIntervalMs = input.pollIntervalMs ?? 250;
    const timeoutMs = input.timeoutMs ?? 120_000;
    const startedAt = Date.now();
    let lastOutput = "";
    const consumedAutoResponses = new Set<string>();
    let missingSessionChecks = 0;

    while (true) {
      let output = lastOutput;
      try {
        output = await this.capturePane(spawned.paneId);
        lastOutput = output;
        missingSessionChecks = 0;
      } catch {
        const stillExists = await this.hasSession(spawned.sessionName);
        if (!stillExists) {
          missingSessionChecks += 1;
          if (missingSessionChecks < 3) {
            await delay(pollIntervalMs);
            continue;
          }
          return {
            output: lastOutput,
            timedOut: false,
            completionDetected: false,
            sessionName: spawned.sessionName,
            paneId: spawned.paneId,
            promptSubmissionAttempted: promptSent,
          };
        }
      }
      if (output.includes(input.completionToken)) {
        if (!input.preserveSession) {
          await this.killSession(spawned.sessionName);
        }
        return {
          output,
          timedOut: false,
          completionDetected: true,
          sessionName: spawned.sessionName,
          paneId: spawned.paneId,
          promptSubmissionAttempted: promptSent,
        };
      }

      for (const interruptMatch of input.interruptOnMatches ?? []) {
        if (output.includes(interruptMatch)) {
          return {
            output,
            timedOut: false,
            completionDetected: false,
            sessionName: spawned.sessionName,
            paneId: spawned.paneId,
            interruptedReason: "approval_required",
            matchedText: interruptMatch,
            promptSubmissionAttempted: promptSent,
          };
        }
      }

      for (const autoResponse of input.autoResponses ?? []) {
        if (output.includes(autoResponse.match) && !consumedAutoResponses.has(autoResponse.match)) {
          await this.sendKeys(spawned.paneId, autoResponse.input);
          consumedAutoResponses.add(autoResponse.match);
        }
      }

      if (input.prompt && input.promptReadyWhen && output.includes(input.promptReadyWhen) && !promptSent) {
        if (input.promptReadyDelayMs && input.promptReadyDelayMs > 0) {
          await delay(input.promptReadyDelayMs);
        }
        await this.sendKeys(spawned.paneId, input.prompt);
        promptSent = true;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        if (!input.preserveSession) {
          await this.killSession(spawned.sessionName);
        }
        return {
          output,
          timedOut: true,
          completionDetected: false,
          sessionName: spawned.sessionName,
          paneId: spawned.paneId,
          promptSubmissionAttempted: promptSent,
        };
      }

      const stillExists = await this.hasSession(spawned.sessionName);
      if (!stillExists) {
        missingSessionChecks += 1;
        if (missingSessionChecks < 3) {
          await delay(pollIntervalMs);
          continue;
        }
        return {
          output,
          timedOut: false,
          completionDetected: false,
          sessionName: spawned.sessionName,
          paneId: spawned.paneId,
          promptSubmissionAttempted: promptSent,
        };
      }
      missingSessionChecks = 0;

      await delay(pollIntervalMs);
    }
  }
}

export function buildTaskCompletionToken(taskId: string): string {
  return `[[TASK_DONE:${taskId}]]`;
}

export function appendTaskCompletionInstruction(prompt: string, taskId: string): string {
  return `${prompt} When you are completely finished, print exactly this token on its own line: ${buildTaskCompletionToken(taskId)}`;
}
