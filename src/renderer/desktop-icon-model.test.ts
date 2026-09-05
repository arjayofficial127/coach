import { describe, expect, it } from "vitest";
import {
  DESKTOP_ICON_CATALOG,
  desktopIconFileIsSupported,
  MAX_DESKTOP_ICON_FILE_BYTES,
  normalizeDesktopIcon,
} from "./desktop-icon-model";

describe("desktop icon model", () => {
  it("offers exactly 100 unique built-in line icons", () => {
    expect(DESKTOP_ICON_CATALOG).toHaveLength(100);
    expect(new Set(DESKTOP_ICON_CATALOG.map((icon) => icon.id)).size).toBe(100);
  });

  it("accepts valid built-ins and rejects unknown identifiers", () => {
    expect(normalizeDesktopIcon({ type: "builtin", id: "orbit-dot" })).toEqual({
      type: "builtin",
      id: "orbit-dot",
    });
    expect(normalizeDesktopIcon({ type: "builtin", id: "not-real" })).toBeUndefined();
  });

  it("accepts SVG, PNG, and JPEG uploads within the size limit", () => {
    const supportedFiles: Array<[string, string]> = [
      ["mark.svg", "image/svg+xml"],
      ["mark.png", "image/png"],
      ["mark.jpg", "image/jpeg"],
    ];
    for (const [name, type] of supportedFiles) {
      expect(desktopIconFileIsSupported({ name, type, size: 100 })).toBe(true);
    }
    expect(
      desktopIconFileIsSupported({
        name: "huge.png",
        type: "image/png",
        size: MAX_DESKTOP_ICON_FILE_BYTES + 1,
      }),
    ).toBe(false);
  });
});
