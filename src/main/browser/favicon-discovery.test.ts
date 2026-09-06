import { describe, expect, it } from "vitest";
import { discoverFaviconCandidates, mergeFaviconUrls, rankFaviconUrls } from "./favicon-discovery";

describe("favicon discovery", () => {
  it("prefers a declared 32px PNG over an ICO fallback", () => {
    const html = `
      <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon">
      <link rel="icon" href="/assets/favicon_48x48.png" sizes="48x48">
      <link rel="icon" href="/assets/favicon_32x32.png" sizes="32x32">
    `;

    expect(discoverFaviconCandidates(html, "https://www.youtube.com/watch?v=1")).toMatchObject([
      { url: "https://www.youtube.com/assets/favicon_32x32.png", size: 32 },
      { url: "https://www.youtube.com/assets/favicon_48x48.png", size: 48 },
      { url: "https://www.youtube.com/assets/favicon.ico" },
      { url: "https://www.youtube.com/favicon.ico" },
    ]);
  });

  it("resolves a document base URL and accepts touch icons", () => {
    const html = `
      <base href="https://static.example.com/app/">
      <link rel="apple-touch-icon" href="icons/touch.png" sizes="180x180">
    `;

    expect(discoverFaviconCandidates(html, "https://example.com/page")[0]?.url).toBe(
      "https://static.example.com/app/icons/touch.png",
    );
  });

  it("ranks PNG page-event candidates ahead of ICO candidates", () => {
    expect(
      rankFaviconUrls([
        "https://example.com/favicon.ico",
        "https://example.com/favicon_32.png",
      ]).map((candidate) => candidate.url),
    ).toEqual(["https://example.com/favicon_32.png", "https://example.com/favicon.ico"]);
  });

  it("keeps one deterministic candidate order as favicon events add alternatives", () => {
    const microsoft = "https://example.com/microsoft.png";
    const azure = "https://example.com/azure.png";

    expect(mergeFaviconUrls([microsoft], [azure, microsoft])).toEqual([microsoft, azure]);
    expect(mergeFaviconUrls([microsoft, azure], [azure])).toEqual([microsoft, azure]);
  });
});
