import { describe, expect, it } from "vitest";
import { clampZoomPercent, nextZoomPercent, zoomCommandForShortcut } from "./zoom";

describe("zoom shortcuts", () => {
  it.each([
    [{ key: "+", code: "Equal", control: true, meta: false, alt: false }, "zoom-in"],
    [{ key: "=", code: "Equal", control: true, meta: false, alt: false }, "zoom-in"],
    [{ key: "+", code: "NumpadAdd", control: true, meta: false, alt: false }, "zoom-in"],
    [{ key: "-", code: "Minus", control: true, meta: false, alt: false }, "zoom-out"],
    [{ key: "0", code: "Digit0", control: true, meta: false, alt: false }, "zoom-reset"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(zoomCommandForShortcut(input)).toBe(expected);
  });

  it("supports Command on macOS and rejects Alt-modified shortcuts", () => {
    expect(zoomCommandForShortcut({ key: "=", control: false, meta: true, alt: false })).toBe(
      "zoom-in",
    );
    expect(zoomCommandForShortcut({ key: "=", control: true, meta: false, alt: true })).toBeNull();
  });
});

describe("zoom values", () => {
  it("steps and resets from the current percentage", () => {
    expect(nextZoomPercent(100, "zoom-in")).toBe(110);
    expect(nextZoomPercent(100, "zoom-out")).toBe(90);
    expect(nextZoomPercent(165, "zoom-reset")).toBe(100);
    expect(nextZoomPercent(100, "zoom-in", 5)).toBe(105);
  });

  it("clamps invalid and out-of-range values", () => {
    expect(clampZoomPercent(220)).toBe(200);
    expect(clampZoomPercent(20)).toBe(50);
    expect(clampZoomPercent(Number.NaN)).toBe(100);
  });
});
