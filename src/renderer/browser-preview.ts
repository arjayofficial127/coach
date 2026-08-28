import type {
  BrowserSnapshot,
  BrowserState,
  LatticeApi,
  SavedLinkRecord,
  SaveNoteResult,
  VaultInfo,
} from "../shared/contracts";

const now = Date.now();
let activeTabId = "11111111-1111-4111-8111-111111111111";
let tabs: BrowserState[] = [
  {
    id: activeTabId,
    url: "about:blank",
    title: "New tab",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
  },
];
let vault: VaultInfo | null = null;
let privacySummary = { cookieCount: 3, cacheBytes: 4_820_000 };
let links: SavedLinkRecord[] = [
  {
    id: "preview-design-systems",
    title: "Design systems for knowledge tools",
    url: "https://example.com/design-systems",
    description: "Thoughtful patterns for calm, information-dense personal software.",
    savedAt: new Date(now - 18 * 60_000).toISOString(),
    folder: "Research",
    desktopId: "research",
    readingStatus: "queued",
    queuedAt: new Date(now - 18 * 60_000).toISOString(),
    readAt: "",
    relativePath: "Saved Links/Research/design-systems.md",
  },
  {
    id: "preview-spatial-browsing",
    title: "Spatial browsing and memory",
    url: "https://example.com/spatial-browsing",
    description: "Why grouping research by place can reduce context switching.",
    savedAt: new Date(now - 26 * 60 * 60_000).toISOString(),
    folder: "Research",
    desktopId: "research",
    readingStatus: "saved",
    queuedAt: "",
    readAt: "",
    relativePath: "Saved Links/Research/spatial-browsing.md",
  },
];
const listeners = new Set<(state: BrowserState) => void>();

function snapshot(): BrowserSnapshot {
  return { activeTabId, tabs: tabs.map((tab) => ({ ...tab })) };
}

function normalizeAddress(input: string): string {
  const trimmed = input.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function updateActive(url: string): void {
  tabs = tabs.map((tab) =>
    tab.id === activeTabId
      ? {
          ...tab,
          url,
          title: new URL(url).hostname.replace(/^www\./, ""),
          loading: false,
          canGoBack: true,
        }
      : tab,
  );
  const active = tabs.find((tab) => tab.id === activeTabId);
  if (active) {
    listeners.forEach((listener) => {
      listener({ ...active });
    });
  }
}

export function installBrowserPreviewBridge(): void {
  const api: LatticeApi = {
    shell: {
      onCommand: () => () => undefined,
    },
    browser: {
      setBounds: async () => undefined,
      navigate: async (input) => updateActive(normalizeAddress(input)),
      back: async () => undefined,
      forward: async () => undefined,
      reload: async () => undefined,
      snapshot: async () => snapshot(),
      createTab: async (input) => {
        activeTabId = crypto.randomUUID();
        tabs.push({
          id: activeTabId,
          url: "about:blank",
          title: "New tab",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          error: null,
        });
        if (input) updateActive(normalizeAddress(input));
        return snapshot();
      },
      switchTab: async (tabId) => {
        if (tabs.some((tab) => tab.id === tabId)) activeTabId = tabId;
        return snapshot();
      },
      closeTab: async (tabId) => {
        tabs = tabs.filter((tab) => tab.id !== tabId);
        if (tabs.length === 0) {
          activeTabId = crypto.randomUUID();
          tabs = [
            {
              id: activeTabId,
              url: "about:blank",
              title: "New tab",
              loading: false,
              canGoBack: false,
              canGoForward: false,
              error: null,
            },
          ];
        } else if (activeTabId === tabId) {
          activeTabId = tabs[0]?.id ?? "";
        }
        return snapshot();
      },
      setVisible: async () => undefined,
      privacySummary: async () => ({ ...privacySummary }),
      clearWebsiteData: async () => {
        privacySummary = { cookieCount: 0, cacheBytes: 0 };
        return { ...privacySummary };
      },
      onState: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    vault: {
      createDisposable: async () => {
        vault = {
          id: crypto.randomUUID(),
          displayPath: "C:\\Temp\\Lattice preview vault",
          disposable: true,
        };
        return vault;
      },
      choose: async () => {
        vault = {
          id: crypto.randomUUID(),
          displayPath: "C:\\Users\\arvin\\Documents\\Obsidian\\Personal",
          disposable: false,
        };
        return vault;
      },
      current: async () => vault,
      saveProbeNote: async (input) => {
        if (!vault) throw new Error("Choose a vault before saving.");
        const savedAt = new Date().toISOString();
        const folder = input.folder ?? "";
        const id = crypto.randomUUID();
        const relativePath = `Saved Links/${folder}/${id}.md`;
        const readingStatus: SaveNoteResult["readingStatus"] =
          input.readingStatus === "queued" ? "queued" : "saved";
        const result: SaveNoteResult = {
          id,
          title: input.title,
          url: input.url,
          description: input.description,
          savedAt,
          folder,
          desktopId: input.desktopId ?? "",
          readingStatus,
          queuedAt: input.readingStatus === "queued" ? savedAt : "",
          readAt: "",
          relativePath,
          absolutePath: `${vault.displayPath}\\${relativePath.replaceAll("/", "\\")}`,
          bytesWritten: 512,
        };
        links = [result, ...links];
        return result;
      },
      listSavedLinks: async () => links.map((link) => ({ ...link })),
      setReadingStatus: async (input) => {
        const changedAt = new Date().toISOString();
        const existing = links.find((link) => link.id === input.id);
        if (!existing) throw new Error("The saved link could not be found.");
        const updated = {
          ...existing,
          readingStatus: input.status,
          queuedAt: input.status === "queued" ? changedAt : existing.queuedAt,
          readAt: input.status === "read" ? changedAt : "",
        };
        links = links.map((link) => (link.id === input.id ? updated : link));
        return { ...updated };
      },
      updateSavedLinkMetadata: async (input) => {
        const existing = links.find((link) => link.id === input.id);
        if (!existing) throw new Error("The saved link could not be found.");
        const updated = {
          ...existing,
          title: input.title.trim().replace(/\s+/g, " "),
          description: input.description,
        };
        links = links.map((link) => (link.id === input.id ? updated : link));
        return { ...updated };
      },
      disconnect: async () => {
        vault = null;
      },
    },
  };

  Object.defineProperty(window, "lattice", { value: api, configurable: true });
}
