import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, parseWorkspacePreferences, renameDesktop } from "./workspace-model";

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
});
