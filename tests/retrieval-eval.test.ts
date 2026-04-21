import { describe, expect, it } from "vitest";

import { parseRetrievalEvalCliArgs } from "../src/features/memory/eval/retrieval-eval-cli.js";
import {
  evaluateContextCase,
  evaluateSearchCase,
  retrievalEvalDegradedContextCases,
  retrievalEvalDegradedSearchCases,
  retrievalEvalContextCases,
  retrievalEvalSearchCases,
} from "../src/features/memory/eval/retrieval-eval.js";

describe("parseRetrievalEvalCliArgs", () => {
  it("defaults to json format", () => {
    expect(parseRetrievalEvalCliArgs([])).toEqual({ format: "json" });
  });

  it("parses --format text", () => {
    expect(parseRetrievalEvalCliArgs(["--format", "text"])).toEqual({ format: "text" });
  });

  it("rejects unknown flags", () => {
    expect(() => parseRetrievalEvalCliArgs(["--what"])).toThrowError("Unknown flag: --what");
  });

  it("rejects positional arguments", () => {
    expect(() => parseRetrievalEvalCliArgs(["nope"])).toThrowError("Unexpected argument: nope");
  });
});

describe("evaluateSearchCase", () => {
  it("requires top1 match", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-request-id-project")!;

    expect(evaluateSearchCase(["eval-proj-request-id", "x"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["other", "eval-proj-request-id"], spec).pass).toBe(false);
  });

  it("project probe case expects the project-scoped primary id", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-project-probe-beats-reqid-noise")!;

    expect(evaluateSearchCase(["eval-proj-reqid-probe", "eval-proj-reqid-probe-noise"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-reqid-probe-noise", "eval-proj-reqid-probe"], spec).pass).toBe(false);
  });

  it("requires expected ids inside top-k when provided", () => {
    const spec = {
      id: "fixture",
      query: "",
      mode: "full" as const,
      scope: "project" as const,
      limit: 8,
      expectedTop1: "a",
      expectedInTopK: { k: 2, ids: ["a", "b"] as const },
    };

    expect(evaluateSearchCase(["a", "b", "c"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["a", "c", "b"], spec).pass).toBe(false);
    expect(evaluateSearchCase(["a", "c", "b"], spec).topKMisses).toEqual(["b"]);
  });

  it("paraphrase store-distinction search pins result-store at top1 and requires trace-store in top-k", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-store-roles-paraphrase")!;

    expect(spec.expectedInTopK).toEqual({
      k: 6,
      ids: ["eval-proj-result-store", "eval-proj-trace-store"],
    });
    expect(
      evaluateSearchCase(
        [
          "eval-proj-result-store",
          "eval-proj-orchestration-store-tangle",
          "eval-proj-trace-store",
          "eval-proj-request-id",
        ],
        spec,
      ).pass,
    ).toBe(true);
    expect(evaluateSearchCase(["eval-proj-trace-store", "eval-proj-result-store"], spec).pass).toBe(false);
  });

  it("semantic replay gate search expects request-id policy at top1", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-semantic-replay-gate")!;

    expect(spec.expectedInTopK).toBeUndefined();
    expect(evaluateSearchCase(["eval-proj-request-id", "eval-proj-generic-hardening"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-generic-hardening", "eval-proj-request-id"], spec).pass).toBe(false);
  });

  it("adversarial requestId distractor does not outrank orchestration gating", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-reqid-gating-vs-webhook-dedup")!;

    expect(evaluateSearchCase(["eval-proj-request-id", "eval-proj-webhook-reqid-distractor"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-webhook-reqid-distractor", "eval-proj-request-id"], spec).pass).toBe(false);
  });

  it("adversarial result-store archive distractor does not outrank the live handoff contract", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-live-handoff-vs-archival-mirror")!;

    expect(evaluateSearchCase(["eval-proj-result-store", "eval-proj-result-archive-distractor"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-result-archive-distractor", "eval-proj-result-store"], spec).pass).toBe(false);
  });

  it("same-topic embedding cache invalidation outranks cache reuse policy for staleness query", () => {
    const spec = retrievalEvalSearchCases.find(
      (c) => c.id === "search-same-topic-embedding-cache-invalidation-beats-reuse",
    )!;

    expect(evaluateSearchCase(["eval-proj-embedding-cache-invalidation", "eval-proj-embedding-cache-hit"], spec).pass).toBe(
      true,
    );
    expect(evaluateSearchCase(["eval-proj-embedding-cache-hit", "eval-proj-embedding-cache-invalidation"], spec).pass).toBe(
      false,
    );
  });

  it("long noisy sandbox rehearsal doc does not outrank canonical result-store contract", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-long-noisy-sandbox-doc-vs-result-store-contract")!;

    expect(evaluateSearchCase(["eval-proj-result-store", "eval-proj-verbose-sandbox-rehearsal"], spec).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-verbose-sandbox-rehearsal", "eval-proj-result-store"], spec).pass).toBe(false);
  });

  it("expectEmpty passes only when no ids are returned", () => {
    const spec = retrievalEvalSearchCases.find((c) => c.id === "search-wrong-project-scope-empty")!;

    expect(spec.expectEmpty).toBe(true);
    expect(evaluateSearchCase([], spec).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-request-id"], spec).pass).toBe(false);
  });

  it("expectDegraded fails when the degraded flag does not match", () => {
    const spec = retrievalEvalDegradedSearchCases.find((c) => c.id === "search-degraded-keyword-only-request-id")!;

    expect(spec.expectDegraded).toBe(true);
    expect(evaluateSearchCase(["eval-proj-request-id"], spec, true).pass).toBe(true);
    expect(evaluateSearchCase(["eval-proj-request-id"], spec, false)).toEqual(
      expect.objectContaining({
        pass: false,
        degradedMismatch: true,
      }),
    );
  });
});

describe("evaluateContextCase", () => {
  it("checks first item, substrings, and optional item ids", () => {
    const spec = retrievalEvalContextCases.find((c) => c.id === "context-project-request-id-probe")!;

    expect(
      evaluateContextCase(
        {
          context: "Project probe: requestId x",
          items: ["eval-proj-reqid-probe", "eval-proj-request-id"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context: "missing",
          items: ["eval-proj-reqid-probe", "eval-proj-request-id"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(false);

    expect(
      evaluateContextCase(
        {
          context: "Project probe: requestId x",
          items: ["eval-proj-request-id"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(false);
  });

  it("project-fallback context requires the canonical result-store item and durable wording", () => {
    const spec = retrievalEvalContextCases.find((c) => c.id === "context-project-result-store")!;

    expect(
      evaluateContextCase(
        {
          context: "Task: …\n\nRelevant memories:\n- [decision] result-store keeps durable workflow outputs for downstream tools.",
          items: ["eval-proj-result-store"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context: "Task: …\n\nRelevant memories:\n- [fact] trace metadata only",
          items: ["eval-proj-trace-store"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(false);
  });

  it("adversarial sandbox context still requires the live result-store contract as first item", () => {
    const spec = retrievalEvalContextCases.find((c) => c.id === "context-adversarial-sandbox-noise-excluded")!;

    expect(
      evaluateContextCase(
        {
          context:
            "Task: …\n\nRelevant memories:\n- [decision] orchestration result-store persists durable workflow outputs for downstream tools and integrator handoffs.\n- [fact] sandbox rehearsal note with overlapping vocabulary.",
          items: ["eval-proj-result-store", "eval-proj-verbose-sandbox-rehearsal"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context:
            "Task: …\n\nRelevant memories:\n- [fact] sandbox rehearsal note repeats durable workflow outputs and downstream tools for drill purposes.",
          items: ["eval-proj-verbose-sandbox-rehearsal", "eval-proj-result-store"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(false);
  });

  it("enforces expectTruncated and excluded ids / substrings", () => {
    const tight = retrievalEvalContextCases.find((c) => c.id === "context-tight-maxchars-only-top-item")!;
    const maxCharsCase = retrievalEvalContextCases.find(
      (c) => c.id === "context-maxchars-drops-verbose-sandbox-distractor",
    )!;

    expect(
      evaluateContextCase(
        {
          context: "Project probe: requestId ok",
          items: ["eval-proj-reqid-probe"],
          truncated: true,
        },
        tight,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context: "Project probe: requestId ok",
          items: ["eval-proj-reqid-probe", "eval-proj-request-id"],
          truncated: true,
        },
        tight,
      ).pass,
    ).toBe(false);

    expect(
      evaluateContextCase(
        {
          context: "Project probe: requestId ok",
          items: ["eval-proj-reqid-probe"],
          truncated: false,
        },
        tight,
      ),
    ).toEqual(
      expect.objectContaining({
        pass: false,
        truncatedMismatch: true,
        forbiddenItemIdsPresent: [],
        forbiddenSubstringsPresent: [],
      }),
    );

    expect(
      evaluateContextCase(
        {
          context: "durable workflow outputs only",
          items: ["eval-proj-result-store"],
          truncated: true,
        },
        maxCharsCase,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context: "durable workflow outputs\nSandbox rehearsal note (non-production):",
          items: ["eval-proj-result-store"],
          truncated: true,
        },
        maxCharsCase,
      ),
    ).toEqual(
      expect.objectContaining({
        pass: false,
        forbiddenSubstringsPresent: ["Sandbox rehearsal note (non-production)"],
      }),
    );

    expect(
      evaluateContextCase(
        {
          context: "durable workflow outputs",
          items: ["eval-proj-result-store", "eval-proj-verbose-sandbox-rehearsal"],
          truncated: true,
        },
        maxCharsCase,
      ),
    ).toEqual(
      expect.objectContaining({
        pass: false,
        forbiddenItemIdsPresent: ["eval-proj-verbose-sandbox-rehearsal"],
      }),
    );
  });

  it("expectEmptyItems passes when there are no memory ids and required substrings match", () => {
    const spec = retrievalEvalContextCases.find((c) => c.id === "context-wrong-project-scope-no-items")!;

    expect(spec.expectEmptyItems).toBe(true);
    expect(
      evaluateContextCase(
        {
          context: "Task: x\n\nRelevant memories:\n",
          items: [],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context: "Task: x\n\nRelevant memories:\n",
          items: ["eval-proj-request-id"],
          truncated: false,
        },
        spec,
      ).pass,
    ).toBe(false);
  });

  it("expectDegraded on context requires the degraded flag to be true", () => {
    const spec = retrievalEvalDegradedContextCases[0]!;

    expect(spec.expectDegraded).toBe(true);
    expect(
      evaluateContextCase(
        {
          context: "Task: x\n\nRelevant memories:\n- [fact] requestId hardening",
          items: ["eval-proj-reqid-probe"],
          truncated: false,
          degraded: true,
        },
        spec,
      ).pass,
    ).toBe(true);

    expect(
      evaluateContextCase(
        {
          context: "Task: x\n\nRelevant memories:\n- [fact] requestId hardening",
          items: ["eval-proj-reqid-probe"],
          truncated: false,
          degraded: false,
        },
        spec,
      ),
    ).toEqual(
      expect.objectContaining({
        pass: false,
        degradedMismatch: true,
      }),
    );
  });
});
