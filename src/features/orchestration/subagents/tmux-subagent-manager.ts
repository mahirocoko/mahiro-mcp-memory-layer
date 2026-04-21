import { newId } from "../../../lib/ids.js";
import { inspectGeminiPane } from "../../gemini/runtime/tmux/gemini-pane-state.js";
import { appendTaskCompletionInstruction, buildTaskCompletionToken, TmuxRuntimeOwner } from "../runtime/tmux-runtime-owner.js";
import { SubagentSessionStore } from "./subagent-session-store.js";
import type { SubagentSessionRecord, SubagentWorkerKind } from "./subagent-session-types.js";

export class TmuxSubagentManager {
  public constructor(
    private readonly tmuxRuntimeOwner: TmuxRuntimeOwner,
    private readonly store: SubagentSessionStore,
  ) {}

  public async ensureSession(input: {
    readonly subagentId?: string;
    readonly workerKind: SubagentWorkerKind;
    readonly model: string;
    readonly executable: string;
    readonly args: string[];
    readonly cwd?: string;
  }): Promise<SubagentSessionRecord> {
    const subagentId = input.subagentId ?? newId("subagent");
    const existing = await this.store.read(subagentId);
    const lineageMatches = existing
      ? existing.workerKind === input.workerKind && existing.runtime === "tmux"
      : false;
    if (existing && lineageMatches) {
      const stillExists = await this.tmuxRuntimeOwner.hasSession(existing.sessionName);
      if (stillExists) {
        return existing;
      }
    }
    const spawned = await this.tmuxRuntimeOwner.createDetachedTask({
      sessionName: lineageMatches && existing?.sessionName ? existing.sessionName : `subagent-${input.workerKind}-${subagentId}`,
      executable: input.executable,
      args: input.args,
      cwd: input.cwd,
    });
    return await this.store.upsert({
      subagentId,
      workerKind: input.workerKind,
      runtime: "tmux",
      model: input.model,
      sessionName: spawned.sessionName,
      paneId: spawned.paneId,
      cwd: input.cwd,
      taskIds: lineageMatches && existing?.taskIds ? existing.taskIds : [],
      status: "running",
    });
  }

  public async recordTask(subagentId: string, taskId: string): Promise<SubagentSessionRecord | null> {
    const existing = await this.store.read(subagentId);
    if (!existing) {
      return null;
    }
    return await this.store.upsert({
      ...existing,
      taskIds: [...existing.taskIds, taskId],
      lastPromptAt: new Date().toISOString(),
    });
  }

  public async inspectSession(subagentId: string): Promise<SubagentSessionRecord | null> {
    const existing = await this.store.read(subagentId);
    if (!existing) {
      return null;
    }
    const stillExists = await this.tmuxRuntimeOwner.hasSession(existing.sessionName);
    if (stillExists) {
      if (existing.workerKind !== "gemini") {
        return existing;
      }

      const output = await this.tmuxRuntimeOwner.capturePane(existing.paneId);
      const paneSnapshot = inspectGeminiPane(output);
      return await this.store.upsert({
        ...existing,
        paneState: paneSnapshot.paneState,
        paneStateReason: paneSnapshot.paneStateReason,
        approvalPrompt: paneSnapshot.approvalPrompt,
        lastVisiblePaneExcerpt: paneSnapshot.lastVisiblePaneExcerpt,
      });
    }
    return await this.store.upsert({
      ...existing,
      status: "missing",
    });
  }

  public async stopSession(subagentId: string): Promise<SubagentSessionRecord | null> {
    const existing = await this.store.read(subagentId);
    if (!existing) {
      return null;
    }
    await this.tmuxRuntimeOwner.killSession(existing.sessionName);
    return await this.store.upsert({
      ...existing,
      status: "stopped",
    });
  }

  public async attachCommand(subagentId: string): Promise<{ subagentId: string; sessionName: string; command: string } | null> {
    const existing = await this.inspectSession(subagentId);
    if (!existing) {
      return null;
    }
    return {
      subagentId,
      sessionName: existing.sessionName,
      command: `tmux attach-session -t ${existing.sessionName}`,
    };
  }

  public async resumeSession(input: { subagentId: string; taskId: string; prompt: string; timeoutMs?: number }): Promise<{
    subagentId: string;
    sessionName: string;
    paneId: string;
    output: string;
    timedOut: boolean;
    completionDetected: boolean;
  } | null> {
    const existing = await this.inspectSession(input.subagentId);
    if (!existing || existing.status !== "running") {
      return null;
    }
    await this.recordTask(existing.subagentId, input.taskId);
    const prompt = appendTaskCompletionInstruction(input.prompt, input.taskId);
    const completionToken = buildTaskCompletionToken(input.taskId);
    const result = await this.tmuxRuntimeOwner.runInteractiveTask({
      sessionName: existing.sessionName,
      paneId: existing.paneId,
      executable: existing.workerKind === "gemini" ? "gemini" : "agent",
      args: [],
      prompt,
      completionToken,
      timeoutMs: input.timeoutMs,
    });
    return {
      subagentId: existing.subagentId,
      sessionName: existing.sessionName,
      paneId: existing.paneId,
      output: result.output,
      timedOut: result.timedOut,
      completionDetected: result.completionDetected,
    };
  }
}
