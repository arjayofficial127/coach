import { describe, expect, it } from "vitest";
import {
  archiveDesktop,
  DEFAULT_WORKSPACE,
  moveTabToDesktop,
  parseWorkspacePreferences,
  permanentlyDeleteArchivedDesktop,
  renameDesktop,
  restoreArchivedDesktop,
} from "./workspace-model";

describe("workspace preferences", () => {
  it("falls back when persisted state is malformed", () => {
    expect(parseWorkspacePreferences("not-json")).toEqual(DEFAULT_WORKSPACE);
  });

  it("keeps valid desktops and repairs a missing active desktop", () => {
    const result = parseWorkspacePreferences(
      JSON.stringify({
        version: 2,
        activeDesktopId: "missing",
        desktops: [{ id: "desk", name: "  Focus  ", color: "cyan" }],
      }),
    );
    expect(result).toEqual({
      version: 3,
      activeDesktopId: "desk",
      desktops: [{ id: "desk", name: "Focus", color: "cyan" }],
      archivedDesktops: [],
    });
  });

  it("renames a desktop without allowing an empty or duplicate name", () => {
    expect(renameDesktop(DEFAULT_WORKSPACE, "build", "  Making things  ").desktops[1]?.name).toBe(
      "Making things",
    );
    expect(renameDesktop(DEFAULT_WORKSPACE, "build", "Desk 1")).toBe(DEFAULT_WORKSPACE);
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

  it("archives a desktop and selects the adjacent survivor", () => {
    const result = archiveDesktop(
      { ...DEFAULT_WORKSPACE, activeDesktopId: "build" },
      "build",
      "2026-08-29T10:00:00.000Z",
    );
    expect(result).toEqual({
      archived: true,
      workspace: {
        ...DEFAULT_WORKSPACE,
        activeDesktopId: "inspiration",
        desktops: [DEFAULT_WORKSPACE.desktops[0], DEFAULT_WORKSPACE.desktops[2]],
        archivedDesktops: [
          {
            ...DEFAULT_WORKSPACE.desktops[1],
            archivedAt: "2026-08-29T10:00:00.000Z",
            previousIndex: 1,
          },
        ],
      },
    });
  });

  it("keeps at least one desktop", () => {
    const researchDesktop = DEFAULT_WORKSPACE.desktops[0];
    if (!researchDesktop) throw new Error("Expected the default first desktop");
    const single = {
      ...DEFAULT_WORKSPACE,
      activeDesktopId: "research",
      desktops: [researchDesktop],
    };
    expect(archiveDesktop(single, "research")).toEqual({
      archived: false,
      reason: "last-desktop",
    });
  });

  it("restores archived desktops in their previous position and only hard-deletes from archive", () => {
    const archived = archiveDesktop(
      { ...DEFAULT_WORKSPACE, activeDesktopId: "build" },
      "build",
      "2026-08-29T10:00:00.000Z",
    );
    if (!archived.archived) throw new Error("Expected the desktop to be archived");

    const restored = restoreArchivedDesktop(archived.workspace, "build");
    expect(restored).toEqual({
      restored: true,
      workspace: { ...DEFAULT_WORKSPACE, activeDesktopId: "build" },
    });
    expect(permanentlyDeleteArchivedDesktop(archived.workspace, "build")).toEqual({
      ...archived.workspace,
      archivedDesktops: [],
    });
  });

  it("migrates only untouched legacy desktop names to generic defaults", () => {
    const result = parseWorkspacePreferences(
      JSON.stringify({
        version: 1,
        activeDesktopId: "research",
        desktops: [
          { id: "research", name: "Research", color: "violet" },
          { id: "build", name: "My work", color: "cyan" },
          { id: "inspiration", name: "Inspiration", color: "amber" },
        ],
      }),
    );

    expect(result.version).toBe(3);
    expect(result.desktops.map((desktop) => desktop.name)).toEqual(["Desk 1", "My work", "Desk 3"]);
    expect(result.archivedDesktops).toEqual([]);
  });
});
