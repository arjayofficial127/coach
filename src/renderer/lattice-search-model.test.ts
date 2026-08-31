import { describe, expect, it } from "vitest";
import { TRUSTED_SITES } from "../shared/lattice-search";
import {
  learnSitesFromHistory,
  parseStoredHistory,
  rankLatticeDocuments,
  type StoredHistoryVisit,
  serializeStoredHistory,
} from "./lattice-search-model";

const history = (overrides: Partial<StoredHistoryVisit>): StoredHistoryVisit => ({
  id: crypto.randomUUID(),
  desktopId: "research",
  title: "Example",
  url: "https://example.test/path",
  visitedAt: "2026-08-31T08:00:00.000Z",
  siteIconDataUrl: null,
  ...overrides,
});

describe("Lattice search model", () => {
  it("ranks exact and current-desk results before weaker matches", () => {
    const results = rankLatticeDocuments(
      "test",
      [
        {
          id: "other",
          kind: "history",
          label: "Testing notes",
          detail: "Other desk",
          keywords: "test",
          desktopId: "build",
        },
        {
          id: "current",
          kind: "tab",
          label: "Test",
          detail: "Current tab",
          keywords: "test current",
          desktopId: "research",
        },
        {
          id: "content",
          kind: "tab",
          label: "Project brief",
          detail: "Open tab",
          keywords: "project brief",
          desktopId: "research",
          contentMatch: true,
        },
      ],
      "research",
      { everywhere: true },
    );
    expect(results.map((item) => item.id)).toEqual(["current", "other"]);
  });

  it("keeps current-desk scope by default and expands on request", () => {
    const items = [
      {
        id: "one",
        kind: "tab" as const,
        label: "Roadmap",
        detail: "",
        keywords: "roadmap",
        desktopId: "research",
      },
      {
        id: "two",
        kind: "tab" as const,
        label: "Roadmap",
        detail: "",
        keywords: "roadmap",
        desktopId: "build",
      },
    ];
    expect(rankLatticeDocuments("roadmap", items, "research").map((item) => item.id)).toEqual([
      "one",
    ]);
    expect(
      rankLatticeDocuments("roadmap", items, "research", { everywhere: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["one", "two"]);
  });

  it("round-trips safe, deduplicated profile history and drops malformed entries", () => {
    const older = history({ id: "old", visitedAt: "2026-08-30T08:00:00.000Z" });
    const newer = history({ id: "new", visitedAt: "2026-08-31T08:00:00.000Z" });
    const parsed = parseStoredHistory(
      JSON.stringify({ version: 1, items: [older, { nope: true }, newer] }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("new");
    expect(parseStoredHistory(serializeStoredHistory(parsed))).toEqual(parsed);
  });

  it("learns private history domains without overriding the trusted catalogue", () => {
    const learned = learnSitesFromHistory(
      [
        history({ id: "one", url: "https://studio.example.test/a", title: "Studio" }),
        history({ id: "two", url: "https://studio.example.test/b", title: "Studio home" }),
        history({ id: "google", url: "https://www.google.com/search?q=test", title: "Google" }),
      ],
      TRUSTED_SITES,
    );
    expect(learned).toHaveLength(1);
    expect(learned[0]).toMatchObject({
      domain: "studio.example.test",
      visitCount: 2,
      description: "2 visits · studio.example.test",
    });
  });
});
