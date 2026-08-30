import type {
  BrowserSnapshot,
  BrowserState,
  CanvasPageRecord,
  LatticeApi,
  ProfileState,
  SavedLinkRecord,
  SaveNoteResult,
  VaultInfo,
} from "../shared/contracts";
import { clampZoomPercent } from "../shared/zoom";

type PreviewTrashEntry =
  | { kind: "saved-link"; item: SavedLinkRecord }
  | { kind: "canvas-page"; item: CanvasPageRecord };

const now = Date.now();
let activeTabId = "11111111-1111-4111-8111-111111111111";
let shellZoomPercent = 100;
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
let profileState: ProfileState = {
  activeProfileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  profiles: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Personal",
      avatarDataUrl: null,
      primary: true,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    },
  ],
};
const previewTrash = new Map<string, PreviewTrashEntry>();
const profileTabs = new Map<string, { activeTabId: string; tabs: BrowserState[] }>();
let vault: VaultInfo | null = null;
let privacySummary = { cookieCount: 3, cacheBytes: 4_820_000 };
let canvasPages: CanvasPageRecord[] = [];
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

function activatePreviewProfile(profileId: string): BrowserSnapshot {
  profileTabs.set(profileState.activeProfileId, { activeTabId, tabs: structuredClone(tabs) });
  const saved = profileTabs.get(profileId);
  if (saved) {
    activeTabId = saved.activeTabId;
    tabs = structuredClone(saved.tabs);
  } else {
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
  }
  profileState = { ...profileState, activeProfileId: profileId };
  return snapshot();
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
      setAppearance: async (input) => input,
      getZoom: async () => shellZoomPercent,
      setZoom: async (percent) => {
        shellZoomPercent = clampZoomPercent(percent);
        return shellZoomPercent;
      },
      onCommand: () => () => undefined,
    },
    browser: {
      setBounds: async () => undefined,
      setLivePreviews: async () => undefined,
      navigate: async (input) => updateActive(normalizeAddress(input)),
      back: async () => undefined,
      forward: async () => undefined,
      reload: async () => undefined,
      snapshot: async () => snapshot(),
      captureTabPreview: async () => null,
      searchTabContents: async () => [],
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
    profiles: {
      state: async () => structuredClone(profileState),
      create: async (input) => {
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        profileState = {
          ...profileState,
          profiles: [
            ...profileState.profiles,
            {
              id,
              name: input.name.trim(),
              avatarDataUrl: null,
              primary: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        };
        const browser = activatePreviewProfile(id);
        return { state: structuredClone(profileState), browser };
      },
      update: async (input) => {
        profileState = {
          ...profileState,
          profiles: profileState.profiles.map((profile) =>
            profile.id === input.id
              ? { ...profile, name: input.name.trim(), updatedAt: new Date().toISOString() }
              : profile,
          ),
        };
        return structuredClone(profileState);
      },
      chooseAvatar: async () => structuredClone(profileState),
      clearAvatar: async (profileId) => {
        profileState = {
          ...profileState,
          profiles: profileState.profiles.map((profile) =>
            profile.id === profileId ? { ...profile, avatarDataUrl: null } : profile,
          ),
        };
        return structuredClone(profileState);
      },
      switch: async (profileId) => ({
        state: structuredClone({ ...profileState, activeProfileId: profileId }),
        browser: activatePreviewProfile(profileId),
      }),
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
      openSavedLinkInObsidian: async () => undefined,
      revealSavedLink: async () => undefined,
      listCanvasPages: async () =>
        canvasPages.map(({ nodes: _nodes, edges: _edges, ...page }) => page),
      createCanvasPage: async (input) => {
        if (!vault) throw new Error("Choose a vault before creating a canvas page.");
        const timestamp = new Date().toISOString();
        const page: CanvasPageRecord = {
          version: 1,
          id: crypto.randomUUID(),
          title: input.title,
          description: input.description,
          folder: input.folder,
          createdAt: timestamp,
          updatedAt: timestamp,
          nodeCount: 0,
          nodes: [],
          edges: [],
        };
        canvasPages = [page, ...canvasPages];
        return structuredClone(page);
      },
      getCanvasPage: async (id) => {
        const page = canvasPages.find((candidate) => candidate.id === id);
        if (!page) throw new Error("The canvas page could not be found.");
        return structuredClone(page);
      },
      saveCanvasPage: async (input) => {
        const existing = canvasPages.find((candidate) => candidate.id === input.id);
        if (!existing) throw new Error("The canvas page could not be found.");
        const updated: CanvasPageRecord = {
          ...existing,
          ...input,
          updatedAt: new Date().toISOString(),
          nodeCount: input.nodes.length,
        };
        canvasPages = canvasPages.map((candidate) =>
          candidate.id === input.id ? updated : candidate,
        );
        return structuredClone(updated);
      },
      trashSavedLink: async (id) => {
        const item = links.find((candidate) => candidate.id === id);
        if (!item) throw new Error("The saved link could not be found.");
        const token = crypto.randomUUID();
        previewTrash.set(token, { kind: "saved-link", item: structuredClone(item) });
        links = links.filter((candidate) => candidate.id !== id);
        return { token, kind: "saved-link", title: item.title };
      },
      trashCanvasPage: async (id) => {
        const item = canvasPages.find((candidate) => candidate.id === id);
        if (!item) throw new Error("The canvas page could not be found.");
        const token = crypto.randomUUID();
        previewTrash.set(token, { kind: "canvas-page", item: structuredClone(item) });
        canvasPages = canvasPages.filter((candidate) => candidate.id !== id);
        return { token, kind: "canvas-page", title: item.title };
      },
      restoreTrash: async (token) => {
        const entry = previewTrash.get(token);
        if (!entry) throw new Error("This recovery action has expired.");
        if (entry.kind === "saved-link") links = [entry.item, ...links];
        else canvasPages = [entry.item, ...canvasPages];
        previewTrash.delete(token);
      },
      revealCanvasReference: async () => undefined,
      referenceIndex: async () => ({
        generatedAt: new Date().toISOString(),
        entries: [],
        unresolvedCount: 0,
      }),
      disconnect: async () => {
        vault = null;
        canvasPages = [];
      },
    },
  };

  Object.defineProperty(window, "lattice", { value: api, configurable: true });
}
