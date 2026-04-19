import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { ZodError } from "zod";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import {
  buildGeminiInteractiveShellArgs,
  buildGeminiShellArgs,
  shellGeminiRuntime,
} from "../src/features/gemini/runtime/shell/shell-gemini-runtime.js";
import { extractInteractiveGeminiResponse } from "../src/features/gemini/runtime/shell/interactive-gemini-response.js";
import { geminiWorkerInputSchema } from "../src/features/gemini/schemas.js";

function createSpawnedProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const process = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };

  process.stdout = stdout;
  process.stderr = stderr;
  process.kill = vi.fn();
  return process;
}

describe("shellGeminiRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds shell args with typed Gemini CLI flags", () => {
    expect(buildGeminiShellArgs({
      taskId: "task-1",
      prompt: "Reply with OK",
      model: "gemini-3.1-pro-preview",
      approvalMode: "plan",
      allowedMcpServerNames: ["docs", "repo-tools"],
    })).toEqual([
      "-m",
      "gemini-3.1-pro-preview",
      "--approval-mode",
      "plan",
      "--allowed-mcp-server-names",
      "docs,repo-tools",
      "-p",
      "Reply with OK",
      "--output-format",
      "json",
    ]);
  });

  it("passes repo-local none MCP sentinel through to the Gemini CLI", async () => {
    const child = createSpawnedProcess();
    spawnMock.mockReturnValue(child);

    const promise = shellGeminiRuntime.run({
      taskId: "task-2",
      prompt: "Reply with OK",
      model: "gemini-3-flash-preview",
      approvalMode: "plan",
      allowedMcpServerNames: "none",
    });

    child.emit("close", 0, null);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      "gemini",
      [
        "-m",
        "gemini-3-flash-preview",
        "--approval-mode",
        "plan",
        "--allowed-mcp-server-names",
        "none",
        "-p",
        "Reply with OK",
        "--output-format",
        "json",
      ],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  it("builds interactive shell args for Gemini normal mode in tmux", () => {
    expect(buildGeminiInteractiveShellArgs({
      taskId: "task-2b",
      prompt: "Reply with OK",
      model: "gemini-3.1-pro-preview",
      approvalMode: "plan",
      allowedMcpServerNames: ["docs", "repo-tools"],
    })).toEqual([
      "-m",
      "gemini-3.1-pro-preview",
      "--approval-mode",
      "plan",
      "--allowed-mcp-server-names",
      "docs,repo-tools",
      "--screen-reader",
      "-i",
      "Reply with OK",
    ]);
  });

  it("rejects MCP server names that cannot round-trip through shell serialization", () => {
    expect(() => geminiWorkerInputSchema.parse({
      taskId: "task-3",
      prompt: "Reply with OK",
      model: "gemini-3-flash-preview",
      allowedMcpServerNames: ["none"],
    })).toThrowError(ZodError);

    expect(() => geminiWorkerInputSchema.parse({
      taskId: "task-4",
      prompt: "Reply with OK",
      model: "gemini-3-flash-preview",
      allowedMcpServerNames: ["docs,repo-tools"],
    })).toThrowError(ZodError);
  });

  it("extracts a Gemini response from screen-reader pane output", () => {
    expect(extractInteractiveGeminiResponse([
      "Some setup line",
      "Model: PONG",
      "",
      "~/repo · main",
    ].join("\n"))).toBe("PONG");
  });
});
