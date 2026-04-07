import { describe, expect, it } from "vitest";

import { parseCursorCliArgs } from "../src/features/cursor/cursor-cli.js";

describe("parseCursorCliArgs", () => {
  it("fails when model is omitted", () => {
    expect(() => parseCursorCliArgs(["Review", "this", "diff"]))
      .toThrowError("--model is required.");
  });

  it("fails when plan mode is present without an explicit model", () => {
    expect(() => parseCursorCliArgs(["--mode", "plan", "Plan", "this", "refactor"]))
      .toThrowError("--model is required.");
  });

  it("fails when model is only whitespace", () => {
    expect(() => parseCursorCliArgs(["--model", "   ", "Review", "this", "diff"]))
      .toThrowError("--model is required.");
  });

  it("maps explicit flags into worker input", () => {
    const input = parseCursorCliArgs([
      "--model",
      "claude-4.6-sonnet-medium",
      "--cwd",
      "/tmp/project",
      "--timeout-ms",
      "30000",
      "--binary-path",
      "/usr/local/bin/agent",
      "--mode",
      "plan",
      "--force",
      "--trust",
      "Review",
      "this",
      "architecture",
    ]);

    expect(input.model).toBe("claude-4.6-sonnet-medium");
    expect(input.cwd).toBe("/tmp/project");
    expect(input.timeoutMs).toBe(30000);
    expect(input.binaryPath).toBe("/usr/local/bin/agent");
    expect(input.mode).toBe("plan");
    expect(input.force).toBe(true);
    expect(input.trust).toBe(true);
  });

  it("keeps explicit model values even in plan mode", () => {
    const input = parseCursorCliArgs([
      "--mode",
      "plan",
      "--model",
      "claude-4.6-sonnet-medium",
      "Plan",
      "this",
      "refactor",
    ]);

    expect(input.model).toBe("claude-4.6-sonnet-medium");
  });

  it("allows explicit prompt tail after double dash", () => {
    const input = parseCursorCliArgs(["--model", "composer-2", "--", "--not-a-flag", "prompt"]);

    expect(input.prompt).toBe("--not-a-flag prompt");
  });

  it("fails when prompt is missing", () => {
    expect(() => parseCursorCliArgs(["--mode", "ask"])).toThrowError("Prompt is required.");
  });

  it("fails when timeout is not a positive integer", () => {
    expect(() => parseCursorCliArgs(["--timeout-ms", "0", "hello"]))
      .toThrowError("--timeout-ms must be a positive integer.");
  });

  it("fails for unknown modes", () => {
    expect(() => parseCursorCliArgs(["--mode", "mystery", "hello"]))
      .toThrowError("Unknown mode: mystery");
  });
});
