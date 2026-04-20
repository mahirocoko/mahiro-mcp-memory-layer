export interface GeminiCommandRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

export interface GeminiWorkerInput {
  readonly taskId: string;
  readonly subagentId?: string;
  readonly prompt: string;
  readonly model: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly taskKind?: string;
  readonly approvalMode?: "default" | "auto_edit" | "yolo" | "plan";
  readonly allowedMcpServerNames?: string[] | "none";
}

export interface GeminiWorkerRunResult {
  readonly status: "completed" | "failed" | "timeout" | "invalid_input" | "approval_required";
  readonly requestedModel: string;
  readonly reportedModel?: string;
  readonly response?: string;
  readonly error?: string;
  readonly approvalPrompt?: string;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly cached?: boolean;
  readonly cachedTokens?: number;
  readonly subagentId?: string;
  readonly sessionName?: string;
  readonly paneId?: string;
}

export interface GeminiWorkerRuntime {
  run(input: GeminiWorkerInput): Promise<GeminiCommandRunResult>;
}
