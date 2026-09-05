import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAVIGATION_WIDTH,
  MAX_NAVIGATION_WIDTH,
  navigationResizeResult,
  normalizeNavigationWidth,
} from "./navigation-width";

describe("navigation width", () => {
  it("uses the default width when a stored value is invalid", () => {
    expect(normalizeNavigationWidth(Number.NaN)).toBe(DEFAULT_NAVIGATION_WIDTH);
  });

  it("caps the expanded sidebar at 369px", () => {
    expect(normalizeNavigationWidth(500)).toBe(MAX_NAVIGATION_WIDTH);
  });

  it("switches to compact mode at 139px", () => {
    expect(navigationResizeResult(139)).toEqual({ mode: "compact" });
  });

  it("remains expanded immediately above the compact threshold", () => {
    expect(navigationResizeResult(140)).toEqual({ mode: "expanded", width: 140 });
  });
});
