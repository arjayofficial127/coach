import { describe, expect, it } from "vitest";
import { previewInteractionScript, shouldShowTabView } from "./preview-interaction";

describe("live preview interaction", () => {
  it("enables a three-pixel scrollbar without blocking page interaction", () => {
    const script = previewInteractionScript(true);

    expect(script).toContain("width: 3px");
    expect(script).toContain("height: 3px");
    expect(script).not.toContain("preventDefault");
    expect(script).not.toContain("scrollTo");
    expect(script).not.toContain('addEventListener("wheel"');
  });

  it("cleans up the legacy scroll lock and injected preview style", () => {
    const script = previewInteractionScript(false);

    expect(script).toContain('removeEventListener("wheel"');
    expect(script).toContain('removeEventListener("touchmove"');
    expect(script).toContain('removeEventListener("scroll"');
    expect(script).toContain("document.getElementById(styleId)?.remove()");
  });

  it("keeps an active live preview visible while the full browser surface is hidden", () => {
    expect(shouldShowTabView({ browserVisible: false, isActive: true, isLivePreview: true })).toBe(
      true,
    );
    expect(shouldShowTabView({ browserVisible: false, isActive: true, isLivePreview: false })).toBe(
      false,
    );
  });
});
