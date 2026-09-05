import { describe, expect, it } from "vitest";
import { actionPopoverIntersectsSurface } from "./action-popover";

describe("action popover native-surface avoidance", () => {
  const nativeSurface = {
    left: 316,
    top: 116,
    right: 1536,
    bottom: 900,
  };
  const popover = { width: 180, height: 52 };

  it("rejects a toolbar tooltip that would descend behind the native webpage", () => {
    expect(actionPopoverIntersectsSurface({ left: 1080, top: 109 }, popover, nativeSurface)).toBe(
      true,
    );
  });

  it("allows the tooltip when it remains inside browser chrome", () => {
    expect(actionPopoverIntersectsSurface({ left: 1080, top: 22 }, popover, nativeSurface)).toBe(
      false,
    );
  });
});
