export interface CursorCommandRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

export interface CursorWorkerInput {
  readonly taskId: string;
  readonly subagentId?: string;
  readonly prompt: string;
  readonly model: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly mode?: "plan" | "ask";
  readonly trust?: boolean;
  readonly force?: boolean;
  readonly worktree?: string;
}

export interface CursorWorkerRunResult {
  readonly status: "completed" | "failed" | "timeout" | "invalid_input";
  readonly requestedModel: string;
  readonly reportedModel?: string;
  readonly result?: string;
  readonly error?: string;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly subagentId?: string;
  readonly sessionName?: string;
  readonly paneId?: string;
}

export interface CursorWorkerRuntime {
  run(input: CursorWorkerInput): Promise<CursorCommandRunResult>;
}
