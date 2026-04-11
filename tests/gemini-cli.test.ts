import { describe, expect, it } from "vitest";

import { parseGeminiCliArgs } from "../src/features/gemini/gemini-cli.js";

describe("parseGeminiCliArgs", () => {
  it("fails when model is omitted", () => {
    expect(() => parseGeminiCliArgs(["Summarize", "this", "repo"]))
      .toThrowError("--model is required.");
  });

  it("fails for unknown flags like hard", () => {
    expect(() => parseGeminiCliArgs(["--hard", "Review", "this", "architecture"]))
      .toThrowError("Unknown flag: --hard");
  });

  it("fails when model is only whitespace", () => {
    expect(() => parseGeminiCliArgs(["--model", "   ", "Summarize", "this", "repo"]))
      .toThrowError("--model is required.");
  });

  it("maps explicit flags into worker input", () => {
    const input = parseGeminiCliArgs([
      "--model",
      "gemini-3.1-pro-preview",
      "--cwd",
      "/tmp/project",
      "--timeout-ms",
      "30000",
      "--binary-path",
      "/usr/local/bin/gemini",
      "--approval-mode",
      "plan",
      "--allowed-mcp-server-names",
      "none",
      "Explain",
      "the",
      "diff",
    ]);

    expect(input.model).toBe("gemini-3.1-pro-preview");
    expect(input.cwd).toBe("/tmp/project");
    expect(input.timeoutMs).toBe(30000);
    expect(input.binaryPath).toBe("/usr/local/bin/gemini");
    expect(input.approvalMode).toBe("plan");
    expect(input.allowedMcpServerNames).toBe("none");
    expect(input.prompt).toBe("Explain the diff");
  });

  it("parses a comma-separated MCP server allowlist", () => {
    const input = parseGeminiCliArgs([
      "--model",
      "gemini-3-flash-preview",
      "--allowed-mcp-server-names",
      "docs, repo-tools ,design",
      "Review",
      "this",
      "prompt",
    ]);

    expect(input.allowedMcpServerNames).toEqual(["docs", "repo-tools", "design"]);
  });

  it("fails for unknown approval modes", () => {
    expect(() => parseGeminiCliArgs(["--model", "gemini-3-flash-preview", "--approval-mode", "mystery", "hello"]))
      .toThrowError("Unknown approval mode: mystery");
  });

  it("fails when allowed MCP server names is empty", () => {
    expect(() => parseGeminiCliArgs(["--model", "gemini-3-flash-preview", "--allowed-mcp-server-names", " , ", "hello"]))
      .toThrowError("--allowed-mcp-server-names must include at least one server name or 'none'.");
  });

  it("treats a trimmed none MCP sentinel as none", () => {
    const input = parseGeminiCliArgs([
      "--model",
      "gemini-3-flash-preview",
      "--allowed-mcp-server-names",
      "  none  ",
      "hello",
    ]);

    expect(input.allowedMcpServerNames).toBe("none");
  });

  it("fails when none is mixed with named MCP servers", () => {
    expect(() => parseGeminiCliArgs([
      "--model",
      "gemini-3-flash-preview",
      "--allowed-mcp-server-names",
      "none,docs",
      "hello",
    ])).toThrowError("--allowed-mcp-server-names cannot mix 'none' with named MCP servers.");
  });

  it("keeps explicit model values trimmed", () => {
    const input = parseGeminiCliArgs([
      "--model",
      " gemini-3.1-pro-preview ",
      "Explain",
      "the",
      "diff",
    ]);

    expect(input.model).toBe("gemini-3.1-pro-preview");
  });

  it("allows explicit prompt tail after double dash", () => {
    const input = parseGeminiCliArgs(["--model", "gemini-3-flash-preview", "--", "--not-a-flag", "prompt"]);

    expect(input.prompt).toBe("--not-a-flag prompt");
  });

  it("parses task routing flags", () => {
    const input = parseGeminiCliArgs(["--model", "gemini-3-flash-preview", "--task", "timeline", "Summarize", "the", "changes"]);

    expect(input.taskKind).toBe("timeline");
    expect(input.prompt).toBe("Summarize the changes");
  });

  it("fails when the prompt is missing", () => {
    expect(() => parseGeminiCliArgs(["--model", "gemini-3-flash-preview"]))
      .toThrowError("Prompt is required.");
  });

  it("fails when timeout is not a positive integer", () => {
    expect(() => parseGeminiCliArgs(["--timeout-ms", "0", "hello"]))
      .toThrowError("--timeout-ms must be a positive integer.");
  });

  it("fails for unknown task kinds", () => {
    expect(() => parseGeminiCliArgs(["--task", "mystery", "hello"]))
      .toThrowError("Unknown task kind: mystery");
  });
});
