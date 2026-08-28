import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE,
  deleteDesktop,
  moveTabToDesktop,
  parseWorkspacePreferences,
  renameDesktop,
} from "./workspace-model";

describe("workspace preferences", () => {
  it("falls back when persisted state is malformed", () => {
    expect(parseWorkspacePreferences("not-json")).toEqual(DEFAULT_WORKSPACE);
  });

  it("keeps valid desktops and repairs a missing active desktop", () => {
    const result = parseWorkspacePreferences(
      JSON.stringify({
        version: 1,
        activeDesktopId: "missing",
        desktops: [{ id: "desk", name: "  Focus  ", color: "cyan" }],
      }),
    );
    expect(result).toEqual({
      version: 1,
      activeDesktopId: "desk",
      desktops: [{ id: "desk", name: "Focus", color: "cyan" }],
    });
  });

  it("renames a desktop without allowing an empty or duplicate name", () => {
    expect(renameDesktop(DEFAULT_WORKSPACE, "build", "  Making things  ").desktops[1]?.name).toBe(
      "Making things",
    );
    expect(renameDesktop(DEFAULT_WORKSPACE, "build", "Research")).toBe(DEFAULT_WORKSPACE);
    expect(renameDesktop(DEFAULT_WORKSPACE, "build", "   ")).toBe(DEFAULT_WORKSPACE);
  });

  it("moves only known tab assignments to a known desktop", () => {
    const assignments = { tab1: "research" };
    expect(moveTabToDesktop(assignments, DEFAULT_WORKSPACE, "tab1", "build")).toEqual({
      tab1: "build",
    });
    expect(moveTabToDesktop(assignments, DEFAULT_WORKSPACE, "missing", "build")).toBe(assignments);
    expect(moveTabToDesktop(assignments, DEFAULT_WORKSPACE, "tab1", "missing")).toBe(assignments);
  });

  it("deletes only an unused desktop and selects the adjacent survivor", () => {
    expect(
      deleteDesktop(DEFAULT_WORKSPACE, "build", { openTabCount: 1, savedLinkCount: 0 }),
    ).toEqual({ deleted: false, reason: "has-open-tabs" });
    expect(
      deleteDesktop(DEFAULT_WORKSPACE, "build", { openTabCount: 0, savedLinkCount: 1 }),
    ).toEqual({ deleted: false, reason: "has-saved-links" });

    const result = deleteDesktop({ ...DEFAULT_WORKSPACE, activeDesktopId: "build" }, "build", {
      openTabCount: 0,
      savedLinkCount: 0,
    });
    expect(result).toEqual({
      deleted: true,
      workspace: {
        ...DEFAULT_WORKSPACE,
        activeDesktopId: "inspiration",
        desktops: [DEFAULT_WORKSPACE.desktops[0], DEFAULT_WORKSPACE.desktops[2]],
      },
    });
  });

  it("keeps at least one desktop", () => {
    const researchDesktop = DEFAULT_WORKSPACE.desktops[0];
    if (!researchDesktop) throw new Error("Expected the default Research desktop");
    const single = {
      ...DEFAULT_WORKSPACE,
      activeDesktopId: "research",
      desktops: [researchDesktop],
    };
    expect(deleteDesktop(single, "research", { openTabCount: 0, savedLinkCount: 0 })).toEqual({
      deleted: false,
      reason: "last-desktop",
    });
  });
});
