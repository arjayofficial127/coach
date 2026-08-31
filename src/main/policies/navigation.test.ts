import { describe, expect, it } from "vitest";
import { isAllowedRemoteNavigation, normalizeHttpUrl } from "./navigation";

describe("navigation policy", () => {
  it("normalizes a hostname to HTTPS", () => {
    expect(normalizeHttpUrl("example.com")).toBe("https://example.com/");
  });

  it("sends plain words and phrases to web search", () => {
    expect(normalizeHttpUrl("test")).toBe("https://www.google.com/search?q=test");
    expect(normalizeHttpUrl("how to focus")).toBe(
      "https://www.google.com/search?q=how%20to%20focus",
    );
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
