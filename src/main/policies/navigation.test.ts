import { describe, expect, it } from "vitest";
import { isAllowedRemoteNavigation, normalizeHttpUrl } from "./navigation";

describe("navigation policy", () => {
  it("normalizes a hostname to HTTPS", () => {
    expect(normalizeHttpUrl("example.com")).toBe("https://example.com/");
  });

  it("allows HTTPS and the empty-page sentinel", () => {
    expect(isAllowedRemoteNavigation("https://example.com/path")).toBe(true);
    expect(isAllowedRemoteNavigation("about:blank")).toBe(true);
  });

  it.each([
    "http://example.com",
    "file:///C:/secret.txt",
    "javascript:alert(1)",
    "data:text/plain,hello",
    "obsidian://open",
  ])("blocks privileged or unsupported navigation: %s", (url) => {
    expect(isAllowedRemoteNavigation(url)).toBe(false);
    expect(() => normalizeHttpUrl(url)).toThrow();
  });
});
