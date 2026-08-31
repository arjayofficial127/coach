import { describe, expect, it } from "vitest";
import {
  buildRestorableSession,
  parseRestorableSession,
  reconcileRestoredSession,
} from "./session-model";

describe("restorable browser sessions", () => {
  const desktopIds = new Set(["research", "build"]);

  it("rejects unsafe URLs and unknown desktops", () => {
    const parsed = parseRestorableSession(
      JSON.stringify({
        version: 1,
        tabs: [
          { url: "https://example.com", desktopId: "research", active: true },
          { url: "http://insecure.example", desktopId: "research", active: false },
          { url: "https://example.com/other", desktopId: "missing", active: false },
        ],
      }),
      desktopIds,
    );

    expect(parsed.tabs).toEqual([
      { url: "https://example.com", desktopId: "research", active: true },
    ]);
  });

  it("builds a bounded session with desktop assignments", () => {
    const session = buildRestorableSession(
      {
        activeTabId: "tab-2",
        tabs: [
          {
            id: "tab-1",
            url: "about:blank",
            title: "New tab",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            error: null,
          },
          {
            id: "tab-2",
            url: "https://example.com",
            title: "Example",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            error: null,
          },
        ],
      },
      { "tab-1": "research", "tab-2": "build" },
      "research",
    );

    expect(session).toEqual({
      version: 1,
      tabs: [
        { url: "about:blank", desktopId: "research", active: false },
        { url: "https://example.com", desktopId: "build", active: true },
      ],
    });
  });

  it("falls back cleanly for malformed state", () => {
    expect(parseRestorableSession("not-json", desktopIds)).toEqual({ version: 1, tabs: [] });
  });

  it("collapses legacy duplicate blank tabs while preserving real pages and desktops", () => {
    const parsed = parseRestorableSession(
      JSON.stringify({
        version: 1,
        tabs: [
          ...Array.from({ length: 24 }, (_, index) => ({
            url: "about:blank",
            desktopId: "research",
            active: index === 23,
          })),
          { url: "about:blank", desktopId: "build", active: false },
          { url: "https://example.com/build", desktopId: "build", active: false },
        ],
      }),
      desktopIds,
    );

    expect(parsed.tabs).toEqual([
      { url: "about:blank", desktopId: "research", active: true },
      { url: "about:blank", desktopId: "build", active: false },
      { url: "https://example.com/build", desktopId: "build", active: false },
    ]);
  });

  it("persists at most one blank tab per desktop", () => {
    const blankTab = (id: string) => ({
      id,
      url: "about:blank",
      title: "New tab",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null,
    });
    const session = buildRestorableSession(
      {
        activeTabId: "research-2",
        tabs: [blankTab("research-1"), blankTab("research-2"), blankTab("build-1")],
      },
      { "research-1": "research", "research-2": "research", "build-1": "build" },
      "research",
    );

    expect(session.tabs).toEqual([
      { url: "about:blank", desktopId: "research", active: true },
      { url: "about:blank", desktopId: "build", active: false },
    ]);
  });

  it("collapses duplicate website tabs from a legacy restore storm", () => {
    const parsed = parseRestorableSession(
      JSON.stringify({
        version: 1,
        tabs: [
          ...Array.from({ length: 24 }, (_, index) => ({
            url: "https://test/",
            desktopId: "research",
            active: index === 23,
          })),
          { url: "https://test/", desktopId: "build", active: false },
          { url: "https://example.com", desktopId: "research", active: false },
        ],
      }),
      desktopIds,
    );

    expect(parsed.tabs).toEqual([
      { url: "https://test/", desktopId: "research", active: true },
      { url: "https://test/", desktopId: "build", active: false },
      { url: "https://example.com", desktopId: "research", active: false },
    ]);
  });

  it("does not persist failed pages for another automatic retry", () => {
    const session = buildRestorableSession(
      {
        activeTabId: "failed",
        tabs: [
          {
            id: "blank",
            url: "about:blank",
            title: "New tab",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            error: null,
          },
          {
            id: "failed",
            url: "https://test/",
            title: "test",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            error: "ERR_NAME_NOT_RESOLVED",
          },
        ],
      },
      { blank: "research", failed: "research" },
      "research",
    );

    expect(session.tabs).toEqual([{ url: "about:blank", desktopId: "research", active: true }]);
  });

  it("reconnects a reloaded shell to existing native tabs without duplicating them", () => {
    const snapshot = {
      activeTabId: "native-build",
      tabs: [
        {
          id: "native-research",
          url: "about:blank",
          title: "New tab",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          error: null,
        },
        {
          id: "native-build",
          url: "https://example.com/build",
          title: "Build",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          error: null,
        },
      ],
    };
    const reconciled = reconcileRestoredSession(
      snapshot,
      {
        version: 1,
        tabs: [
          { url: "about:blank", desktopId: "research", active: false },
          { url: "https://example.com/build", desktopId: "build", active: true },
        ],
      },
      "research",
    );

    expect(reconciled.assignments).toEqual({
      "native-research": "research",
      "native-build": "build",
    });
    expect(reconciled.active?.desktopId).toBe("build");
    expect(reconciled.matchedCount).toBe(2);
  });
});
