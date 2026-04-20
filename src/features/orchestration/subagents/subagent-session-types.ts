export type SubagentWorkerKind = "gemini" | "cursor";
export type SubagentSessionStatus = "running" | "stopped" | "missing";

export interface SubagentSessionRecord {
  readonly subagentId: string;
  readonly workerKind: SubagentWorkerKind;
  readonly runtime: "tmux";
  readonly model: string;
  readonly sessionName: string;
  readonly paneId: string;
  readonly cwd?: string;
  readonly taskIds: string[];
  readonly status: SubagentSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastPromptAt?: string;
}
