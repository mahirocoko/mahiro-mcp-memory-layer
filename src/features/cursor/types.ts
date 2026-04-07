export type CursorMode = "ask" | "plan";

export interface CursorWorkerInput {
  readonly taskId: string;
  readonly prompt: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly cwd?: string;
  readonly binaryPath?: string;
  readonly mode?: CursorMode;
  readonly force?: boolean;
  readonly trust?: boolean;
}

export interface CursorCommandRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly spawnError?: string;
}

export interface CursorJsonResponse {
  readonly type?: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly result?: unknown;
  readonly session_id?: string;
  readonly request_id?: string;
  readonly duration_ms?: number;
  readonly model?: string;
  readonly [key: string]: unknown;
}

export interface CursorWorkerResult {
  readonly taskId?: string;
  readonly status:
    | "completed"
    | "command_failed"
    | "invalid_json"
    | "empty_output"
    | "timeout"
    | "spawn_error"
    | "invalid_input";
  readonly requestedModel?: string;
  readonly reportedModel?: string;
  readonly response?: string;
  readonly raw?: CursorJsonResponse;
  readonly stderr?: string;
  readonly stdout?: string;
  readonly exitCode?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly error?: string;
  readonly mode?: CursorMode;
}
