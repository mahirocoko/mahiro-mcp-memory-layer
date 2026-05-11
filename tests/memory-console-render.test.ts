import { describe, expect, it } from "vitest";

import { renderPurgeRejectedResultPage } from "../src/features/memory-console/render.js";
import type { ConsoleFilterState, ConsolePurgeRejectedActionResult } from "../src/features/memory-console/types.js";

const rejectedFilters = {
  view: "firehose",
  scope: "project",
  kind: "all",
  verificationStatus: "all",
  reviewStatus: "rejected",
  projectId: "project-a",
  containerId: "container-a",
  limit: 50,
} satisfies ConsoleFilterState;

describe("memory console legacy action rendering", () => {
  it("renders purge preview with escaped per-id statuses and final typed confirmation", () => {
    const result = {
      status: "accepted",
      dryRun: true,
      outcomes: [
        { id: "mem-<rejected>", status: "dry_run" },
        { id: "mem-pending", status: "skipped_not_rejected" },
      ],
      deletedRecords: [],
      missingIds: [],
    } satisfies ConsolePurgeRejectedActionResult;

    const html = renderPurgeRejectedResultPage(rejectedFilters, {
      ids: ["mem-<rejected>", "mem-pending"],
      scope: "project",
      projectId: "project-a",
      containerId: "container-a",
      confirmation: "DELETE REJECTED",
      dryRun: true,
    }, result);

    expect(html).toContain("Dry-run preview only. No records were deleted.");
    expect(html).toContain("Only rows marked <strong>dry_run</strong> are eligible for the final delete step. Skipped rows stay untouched.");
    expect(html).toContain("mem-&lt;rejected&gt;");
    expect(html).toContain("dry_run");
    expect(html).toContain("skipped_not_rejected");
    expect(html).toContain('method="post" action="/actions/purge-rejected"');
    expect(html).toContain('placeholder="DELETE REJECTED"');
    expect(html).toContain('name="ids" value="mem-&lt;rejected&gt;"');
    expect(html).toContain('name="scope" value="project"');
    expect(html).toContain('name="projectId" value="project-a"');
    expect(html).toContain('name="containerId" value="container-a"');
    expect(html).not.toContain("mem-<rejected>");
  });

  it("renders final purge outcomes without another confirmation form", () => {
    const result = {
      status: "accepted",
      dryRun: false,
      outcomes: [
        { id: "mem-<deleted>", status: "deleted" },
        { id: "mem-missing", status: "missing" },
      ],
      deletedRecords: [{ id: "mem-<deleted>", status: "deleted" }],
      missingIds: ["mem-missing"],
    } satisfies ConsolePurgeRejectedActionResult;

    const html = renderPurgeRejectedResultPage(rejectedFilters, {
      ids: ["mem-<deleted>", "mem-missing"],
      scope: "global",
      confirmation: "DELETE REJECTED",
      dryRun: false,
    }, result);

    expect(html).toContain("Final purge completed with per-record outcomes.");
    expect(html).toContain("2 ids checked · 1 deleted · 1 missing.");
    expect(html).toContain("mem-&lt;deleted&gt;");
    expect(html).toContain("deleted");
    expect(html).toContain("missing");
    expect(html).not.toContain("mem-<deleted>");
    expect(html).not.toContain('placeholder="DELETE REJECTED"');
    expect(html).not.toContain('method="post" action="/actions/purge-rejected"');
  });
});
