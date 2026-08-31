import { describe, expect, it } from "vitest";
import {
  resolveNavigationInput,
  resolveSearchIntent,
  SEARCH_PROVIDERS,
  TRUSTED_SITES,
} from "./lattice-search";

describe("Lattice search intent", () => {
  it("ships a broad, unique catalogue of trusted destinations", () => {
    expect(TRUSTED_SITES).toHaveLength(111);
    expect(new Set(TRUSTED_SITES.map((site) => site.id)).size).toBe(TRUSTED_SITES.length);
    expect(new Set(TRUSTED_SITES.map((site) => site.domain)).size).toBe(TRUSTED_SITES.length);
  });

  it("opens a trusted site by its familiar name", () => {
    expect(resolveSearchIntent("gmail")).toMatchObject({
      kind: "site",
      url: "https://mail.google.com/",
      label: "Open Gmail",
    });
  });

  it("routes a named-site query through that site's search", () => {
    expect(resolveSearchIntent("youtube how to bake bread")).toMatchObject({
      kind: "site",
      url: "https://www.youtube.com/results?search_query=how%20to%20bake%20bread",
      query: "how to bake bread",
    });
    expect(resolveSearchIntent("pinterest garden office")).toMatchObject({
      kind: "site",
      url: "https://www.pinterest.com/search/pins/?q=garden%20office",
    });
  });

  it("uses the selected web provider for ordinary language", () => {
    expect(SEARCH_PROVIDERS.map((provider) => provider.id)).toEqual([
      "google",
      "duckduckgo",
      "brave",
      "bing",
    ]);
    expect(resolveSearchIntent("test", "google")).toMatchObject({
      kind: "web",
      url: "https://www.google.com/search?q=test",
    });
    expect(resolveSearchIntent("quiet browser", "duckduckgo")).toMatchObject({
      kind: "web",
      url: "https://duckduckgo.com/?q=quiet%20browser",
    });
  });

  it("keeps real hosts and secure URLs as navigation", () => {
    expect(resolveSearchIntent("example.com/docs")).toMatchObject({
      kind: "url",
      url: "https://example.com/docs",
    });
    expect(resolveSearchIntent("https://example.com/path?q=1")).toMatchObject({
      kind: "url",
      url: "https://example.com/path?q=1",
    });
  });

  it("gives the browser runtime a Google fallback without weakening HTTPS policy", () => {
    expect(resolveNavigationInput("test")).toBe("https://www.google.com/search?q=test");
    expect(resolveNavigationInput("example.com")).toBe("https://example.com/");
    expect(() => resolveNavigationInput("http://example.com")).toThrow("Only HTTPS");
    expect(() => resolveNavigationInput("javascript:alert(1)")).toThrow("Only HTTPS");
  });
});
