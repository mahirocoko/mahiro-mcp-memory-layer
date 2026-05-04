import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveOpenCodeScope } from "../src/features/opencode-plugin/resolve-scope.js";

describe("resolveOpenCodeScope", () => {
  it("prefers stable project names over volatile project ids", () => {
    expect(
      resolveOpenCodeScope({
        context: {
          project: {
            id: "project-1",
            name: "project-name",
            directory: "/workspace/project",
          },
          directory: "/workspace/project",
          worktree: "/workspace/project/./",
        },
        event: {
          type: "message.updated",
          properties: {
            sessionID: "session-1",
            messageID: "message-1",
          },
        },
      }),
    ).toEqual({
      status: "complete",
      scope: {
        projectId: "project-name",
        containerId: `worktree:${path.resolve("/workspace/project/./")}`,
        sessionId: "session-1",
      },
      missing: [],
      resolvedFrom: {
        projectId: "context.project.name",
        containerId: "context.worktree",
        sessionId: "event.properties.sessionID",
      },
    });
  });

  it("falls back to project ids when project names are blank", () => {
    expect(
      resolveOpenCodeScope({
        context: {
          project: {
            id: "project-id-fallback",
            name: "   ",
            directory: "/workspace/project",
          },
          directory: "/workspace/project",
        },
        event: {
          type: "message.updated",
          properties: {
            sessionID: "session-1",
            messageID: "message-1",
          },
        },
      }),
    ).toEqual({
      status: "complete",
      scope: {
        projectId: "project-id-fallback",
        containerId: `directory:${path.resolve("/workspace/project")}`,
        sessionId: "session-1",
      },
      missing: [],
      resolvedFrom: {
        projectId: "context.project.id",
        containerId: "context.directory",
        sessionId: "event.properties.sessionID",
      },
    });
  });

  it("uses explicit fallbacks for project, container, and session", () => {
    expect(
      resolveOpenCodeScope({
        context: {
          project: {
            name: "project-name",
            directory: "./repo/project-name",
          },
        },
        event: {
          type: "session.created",
          properties: {
            info: {
              id: "session-2",
              title: "Scope resolution fallback",
            },
          },
        },
      }),
    ).toEqual({
      status: "complete",
      scope: {
        projectId: "project-name",
        containerId: `directory:${path.resolve("./repo/project-name")}`,
        sessionId: "session-2",
      },
      missing: [],
      resolvedFrom: {
        projectId: "context.project.name",
        containerId: "context.project.directory",
        sessionId: "event.properties.info.id",
      },
    });
  });

  it("returns all missing scope fields when hook inputs do not expose stable identifiers", () => {
    expect(
      resolveOpenCodeScope({
        context: {
          project: {
            id: "   ",
          },
          directory: "   ",
        },
        event: {
          type: "session.idle",
          properties: {
            idle: true,
          },
        },
      }),
    ).toEqual({
      status: "incomplete",
      reason: "incomplete_scope_ids",
      scope: {},
      missing: ["projectId", "containerId", "sessionId"],
      resolvedFrom: {},
    });
  });
});
