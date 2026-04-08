import { describe, expect, it } from "vitest";

import { shouldTrustCursorWorkspace } from "../src/features/cursor/core/resolve-cursor-trust.js";

describe("shouldTrustCursorWorkspace", () => {
  it("trusts the current workspace by default", () => {
    expect(
      shouldTrustCursorWorkspace(
        { cwd: "/repo/project" },
        { currentWorkspace: "/repo/project" },
      ),
    ).toBe(true);
  });

  it("trusts nested workspaces under the current workspace", () => {
    expect(
      shouldTrustCursorWorkspace(
        { cwd: "/repo/project/packages/core" },
        { currentWorkspace: "/repo/project" },
      ),
    ).toBe(true);
  });

  it("does not trust unrelated workspaces by default", () => {
    expect(
      shouldTrustCursorWorkspace(
        { cwd: "/repo/other-project" },
        { currentWorkspace: "/repo/project" },
      ),
    ).toBe(false);
  });

  it("honors explicit trust overrides", () => {
    expect(
      shouldTrustCursorWorkspace(
        { cwd: "/repo/other-project", trust: true },
        { currentWorkspace: "/repo/project" },
      ),
    ).toBe(true);

    expect(
      shouldTrustCursorWorkspace(
        { cwd: "/repo/project", trust: false },
        { currentWorkspace: "/repo/project" },
      ),
    ).toBe(false);
  });

  it("trusts configured trusted roots", () => {
    expect(
      shouldTrustCursorWorkspace(
        { cwd: "/trusted/external-repo" },
        {
          currentWorkspace: "/repo/project",
          trustedRoots: ["/trusted"],
        },
      ),
    ).toBe(true);
  });
});
