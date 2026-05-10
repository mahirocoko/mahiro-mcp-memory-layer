import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalContainerIdPrefix,
  canonicalizeContainerId,
  canonicalizeStoredContainerId,
  containerIdMatchesFilter,
  containerIdReadAliases,
  resolveCanonicalProjectScopeIdentity,
} from "../src/features/memory/lib/scope-identity.js";

describe("scope identity policy", () => {
  it("canonicalizes container ids to a workspace prefix", () => {
    expect(canonicalizeContainerId("./repo/alpha")).toBe(`${canonicalContainerIdPrefix}:${path.resolve("./repo/alpha")}`);
  });

  it("canonicalizes stored legacy and path-like container ids", () => {
    expect(canonicalizeStoredContainerId(`worktree:${path.resolve("/repo/alpha")}`)).toBe(`${canonicalContainerIdPrefix}:${path.resolve("/repo/alpha")}`);
    expect(canonicalizeStoredContainerId(path.resolve("/repo/alpha"))).toBe(`${canonicalContainerIdPrefix}:${path.resolve("/repo/alpha")}`);
    expect(canonicalizeStoredContainerId("default")).toBe("default");
  });

  it("expands canonical and legacy container ids for read compatibility", () => {
    const workspace = `workspace:${path.resolve("/repo/alpha")}`;

    expect(containerIdReadAliases(workspace)).toEqual([
      workspace,
      `worktree:${path.resolve("/repo/alpha")}`,
      `directory:${path.resolve("/repo/alpha")}`,
    ]);
    expect(containerIdMatchesFilter(`worktree:${path.resolve("/repo/alpha")}`, workspace)).toBe(true);
    expect(containerIdMatchesFilter(`directory:${path.resolve("/repo/alpha")}`, workspace)).toBe(true);
    expect(containerIdMatchesFilter(`workspace:${path.resolve("/repo/beta")}`, workspace)).toBe(false);
  });

  it("prefers worktree, then directory, then project directory", () => {
    expect(resolveCanonicalProjectScopeIdentity({
      projectName: "project-alpha",
      projectId: "project-id",
      worktreePath: "/workspace/project-alpha/.",
      directoryPath: "/workspace/project-alpha",
      projectDirectoryPath: "/workspace/project-alpha",
    })).toEqual({
      projectId: "project-alpha",
      containerId: `${canonicalContainerIdPrefix}:${path.resolve("/workspace/project-alpha/.")}`,
    });

    expect(resolveCanonicalProjectScopeIdentity({
      projectName: "  ",
      projectId: "project-id",
      directoryPath: "/workspace/project-alpha",
    })).toEqual({
      projectId: "project-id",
      containerId: `${canonicalContainerIdPrefix}:${path.resolve("/workspace/project-alpha")}`,
    });
  });
});
