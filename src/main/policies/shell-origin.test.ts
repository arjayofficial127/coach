import { describe, expect, it } from "vitest";
import { isTrustedShellUrl } from "./shell-origin";

describe("trusted shell origin", () => {
  it("accepts only the packaged lattice host", () => {
    expect(isTrustedShellUrl("lattice://app/index.html", true)).toBe(true);
    expect(isTrustedShellUrl("lattice://app.evil/index.html", true)).toBe(false);
  });

  it("compares the development origin rather than a string prefix", () => {
    const dev = "http://127.0.0.1:5173";
    expect(isTrustedShellUrl("http://127.0.0.1:5173/src/index.tsx", false, dev)).toBe(true);
    expect(isTrustedShellUrl("http://127.0.0.1:5173@evil.example/", false, dev)).toBe(false);
  });
});
