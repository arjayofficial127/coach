import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCUS_PREFERENCES,
  MAX_FOCUS_INTENTION_LENGTH,
  navigationShortcut,
  normalizeFocusIntention,
  parseFocusPreferences,
  surfaceDetails,
} from "./focus-model";

describe("focus preferences", () => {
  it("falls back safely for missing, malformed, and future values", () => {
    expect(parseFocusPreferences(null)).toEqual(DEFAULT_FOCUS_PREFERENCES);
    expect(parseFocusPreferences("{")).toEqual(DEFAULT_FOCUS_PREFERENCES);
    expect(parseFocusPreferences('{"version":2,"intention":"later"}')).toEqual(
      DEFAULT_FOCUS_PREFERENCES,
    );
  });

  it("normalizes a deliberately small local intention", () => {
    expect(normalizeFocusIntention("  finish   the   navigation  ")).toBe("finish the navigation");
    expect(normalizeFocusIntention("x".repeat(200))).toHaveLength(MAX_FOCUS_INTENTION_LENGTH);
    expect(parseFocusPreferences('{"version":1,"intention":"  one   thing "}')).toEqual({
      version: 1,
      intention: "one thing",
    });
  });
});

describe("focus-first navigation shortcuts", () => {
  const base = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  it("maps Alt+1 through Alt+7 to stable destinations", () => {
    expect(navigationShortcut({ ...base, altKey: true, key: "1" })).toEqual({
      kind: "surface",
      surface: "home",
    });
    expect(navigationShortcut({ ...base, altKey: true, key: "3" })).toEqual({
      kind: "surface",
      surface: "pages",
    });
    expect(navigationShortcut({ ...base, altKey: true, key: "6" })).toEqual({
      kind: "surface",
      surface: "settings",
    });
    expect(navigationShortcut({ ...base, altKey: true, key: "7" })).toEqual({
      kind: "surface",
      surface: "apps",
    });
  });

  it("maps the cross-platform focus-view shortcut", () => {
    expect(navigationShortcut({ ...base, ctrlKey: true, shiftKey: true, key: "F" })).toEqual({
      kind: "toggle-focus",
    });
    expect(navigationShortcut({ ...base, metaKey: true, shiftKey: true, key: "f" })).toEqual({
      kind: "toggle-focus",
    });
  });

  it("does not steal modified or unrelated shortcuts", () => {
    expect(navigationShortcut({ ...base, altKey: true, shiftKey: true, key: "1" })).toBeNull();
    expect(navigationShortcut({ ...base, ctrlKey: true, key: "f" })).toBeNull();
    expect(navigationShortcut({ ...base, altKey: true, key: "9" })).toBeNull();
  });

  it("keeps every destination label and shortcut explicit", () => {
    expect(Object.values(surfaceDetails)).toHaveLength(7);
    expect(new Set(Object.values(surfaceDetails).map((item) => item.shortcut)).size).toBe(7);
    expect(surfaceDetails.home.label).toBe("Focus");
  });
});
