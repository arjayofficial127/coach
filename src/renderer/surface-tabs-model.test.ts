import { describe, expect, it } from "vitest";
import {
  closeSurfaceTab,
  createDefaultSurfaceTabs,
  openSurfaceTab,
  surfaceTabForSurface,
} from "./surface-tabs-model";

describe("surface tab model", () => {
  it("seeds existing desktops with the established three selectors", () => {
    expect(createDefaultSurfaceTabs(["one"])).toEqual({
      one: ["dashboard", "files", "libraries"],
    });
  });

  it("opens and closes app selectors without duplicates", () => {
    const opened = openSurfaceTab({}, "one", "apps");
    expect(openSurfaceTab(opened, "one", "apps")).toBe(opened);
    expect(closeSurfaceTab(opened, "one", "apps")).toEqual({ one: [] });
  });

  it("groups every library view under one selector", () => {
    expect(surfaceTabForSurface("library")).toBe("libraries");
    expect(surfaceTabForSurface("queue")).toBe("libraries");
    expect(surfaceTabForSurface("pages")).toBe("libraries");
    expect(surfaceTabForSurface("blank")).toBeNull();
  });
});
