import { isCoachBoard, newCoachBoard, newCoachPlanner } from "../shared/coach-board";
import type {
  BrowserSnapshot,
  BrowserState,
  CanvasPageRecord,
  DesktopFolderArea,
  LatticeApi,
  LocalWorkspaceSnapshot,
  ProfileState,
  SavedLinkRecord,
  SaveNoteResult,
  VaultInfo,
  WorkspaceDirectoryListing,
  WorkspaceFileDocument,
} from "../shared/contracts";
import { applyRequestedTabOrder } from "../shared/tab-order";
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
let localWorkspace: LocalWorkspaceSnapshot = { connected: false, rootName: "", desktops: [] };
const previewWorkspaceFolders = new Set<string>();
const previewWorkspaceFiles = new Map<string, WorkspaceFileDocument>();
const previewWorkspaceAreas = new Map<string, Record<DesktopFolderArea, string>>();
function previewAreaFolders(desktopId: string): Record<DesktopFolderArea, string> {
  return (
    previewWorkspaceAreas.get(desktopId) ?? {
      Inbox: "Inbox",
      Notes: "Notes",
      Files: "Files",
      Planner: "Planner",
    }
  );
}
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

function previewWorkspaceKey(desktopId: string, relativePath: string): string {
  return `${desktopId}:${relativePath}`;
}

function previewWorkspaceListing(
  desktopId: string,
  relativePath: string,
): WorkspaceDirectoryListing {
  const desktop = localWorkspace.desktops.find((item) => item.desktopId === desktopId);
  const normalized = relativePath.replace(/^\/+|\/+$/g, "");
  const prefix = normalized ? `${normalized}/` : "";
  const folderEntries = [...previewWorkspaceFolders]
    .filter((key) => key.startsWith(`${desktopId}:`))
    .map((key) => key.slice(desktopId.length + 1))
    .filter((item) => item.startsWith(prefix) && !item.slice(prefix.length).includes("/"))
    .map((item) => ({
      id: previewWorkspaceKey(desktopId, item),
      name: item.slice(prefix.length),
      relativePath: item,
      kind: "folder" as const,
      fileType: "other" as const,
      size: 0,
      updatedAt: new Date().toISOString(),
    }));
  const fileEntries = [...previewWorkspaceFiles.values()]
    .filter(
      (item) =>
        item.desktopId === desktopId &&
        item.relativePath.startsWith(prefix) &&
        !item.relativePath.slice(prefix.length).includes("/"),
    )
    .map((item) => ({
      id: previewWorkspaceKey(desktopId, item.relativePath),
      name: item.name,
      relativePath: item.relativePath,
      kind: "file" as const,
      fileType: item.fileType,
      size: item.content.length,
      updatedAt: item.updatedAt,
    }));
  const segments = normalized ? normalized.split("/") : [];
  let current = "";
  return {
    desktopId,
    desktopName: desktop?.desktopName ?? "Desktop",
    folderName: desktop?.folderName ?? "Desktop",
    relativePath: normalized,
    breadcrumbs: [
      { name: desktop?.desktopName ?? "Desktop", relativePath: "" },
      ...segments.map((segment) => {
        current = current ? `${current}/${segment}` : segment;
        return { name: segment, relativePath: current };
      }),
    ],
    entries: [...folderEntries, ...fileEntries],
    areaFolders: previewAreaFolders(desktopId),
  };
}

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
      captureSelection: async (tabId) => {
        const tab = tabs.find((item) => item.id === tabId);
        if (!tab || !tab.url.startsWith("https://")) throw new Error("Open an HTTPS source first.");
        return { url: tab.url, title: tab.title, text: "" };
      },
      setBounds: async () => undefined,
      setLivePreviews: async () => undefined,
      navigate: async (input) => updateActive(normalizeAddress(input)),
      back: async () => undefined,
      forward: async () => undefined,
      reload: async () => undefined,
      snapshot: async () => snapshot(),
      captureTabPreview: async () => null,
      searchTabContents: async () => [],
      loadSiteIcons: async () => ({}),
      createTab: async (input) => {
        const url = typeof input === "string" ? input : input?.url;
        const activate = typeof input === "string" ? true : (input?.activate ?? true);
        const createdTabId = crypto.randomUUID();
        tabs.push({
          id: createdTabId,
          url: "about:blank",
          title: "New tab",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          error: null,
        });
        if (activate) activeTabId = createdTabId;
        if (url) {
          const normalized = normalizeAddress(url);
          tabs = tabs.map((tab) =>
            tab.id === createdTabId
              ? {
                  ...tab,
                  url: normalized,
                  title: new URL(normalized).hostname.replace(/^www\./, ""),
                  canGoBack: true,
                }
              : tab,
          );
        }
        return snapshot();
      },
      switchTab: async (tabId) => {
        if (tabs.some((tab) => tab.id === tabId)) activeTabId = tabId;
        return snapshot();
      },
      reorderTabs: async (tabIds) => {
        const order = applyRequestedTabOrder(
          tabs.map((tab) => tab.id),
          tabIds,
        );
        tabs = order.flatMap((tabId) => tabs.filter((tab) => tab.id === tabId));
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
      onLinkAction: () => () => undefined,
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
        localWorkspace = { connected: false, rootName: "", desktops: [] };
      },
    },
    localWorkspace: {
      syncDesktops: async (desktops) => {
        localWorkspace = {
          connected: Boolean(vault),
          rootName: vault ? "Coach Workspace" : "",
          desktops: desktops.map((desktop) => {
            const existing = localWorkspace.desktops.find(
              (candidate) => candidate.desktopId === desktop.id,
            );
            return (
              existing ?? {
                desktopId: desktop.id,
                desktopName: desktop.name,
                folderName: `${desktop.name}-${desktop.id.slice(0, 8)}`,
                inboxCount: 0,
                fileCount: 0,
                items: [],
              }
            );
          }),
        };
        for (const desktop of desktops) {
          for (const area of Object.values(previewAreaFolders(desktop.id))) {
            previewWorkspaceFolders.add(previewWorkspaceKey(desktop.id, area));
          }
        }
        return structuredClone(localWorkspace);
      },
      captureInbox: async (input) => {
        const updatedAt = new Date().toISOString();
        const name = `${input.title}-${crypto.randomUUID().slice(0, 8)}.md`;
        const relativePath = `${previewAreaFolders(input.desktopId).Inbox}/${name}`;
        previewWorkspaceFiles.set(previewWorkspaceKey(input.desktopId, relativePath), {
          desktopId: input.desktopId,
          name,
          relativePath,
          fileType: "markdown",
          content: `# ${input.title}\n\n${input.content}\n`,
          updatedAt,
        });
        localWorkspace = {
          ...localWorkspace,
          desktops: localWorkspace.desktops.map((desktop) =>
            desktop.desktopId === input.desktopId
              ? {
                  ...desktop,
                  inboxCount: desktop.inboxCount + 1,
                  fileCount: desktop.fileCount + 1,
                  items: [
                    {
                      id: crypto.randomUUID(),
                      name: `${input.title}.md`,
                      kind: "file",
                      area: "Inbox",
                      size: input.content.length,
                      updatedAt,
                    },
                    ...desktop.items,
                  ],
                }
              : desktop,
          ),
        };
        return structuredClone(localWorkspace);
      },
      revealDesktop: async () => undefined,
      listDirectory: async (input) =>
        structuredClone(previewWorkspaceListing(input.desktopId, input.relativePath)),
      readFile: async (input) => {
        const file = previewWorkspaceFiles.get(
          previewWorkspaceKey(input.desktopId, input.relativePath),
        );
        if (!file) throw new Error("That preview file is unavailable.");
        return structuredClone(file);
      },
      createEntry: async (input) => {
        const extension =
          input.fileType === "markdown" ? ".md" : input.fileType === "text" ? ".text" : ".coach";
        const name =
          input.kind === "folder" || input.name.endsWith(extension)
            ? input.name
            : `${input.name}${extension}`;
        const relativePath = input.parentPath ? `${input.parentPath}/${name}` : name;
        if (
          previewWorkspaceFolders.has(previewWorkspaceKey(input.desktopId, relativePath)) ||
          previewWorkspaceFiles.has(previewWorkspaceKey(input.desktopId, relativePath))
        )
          throw new Error("A file or folder with that name already exists here.");
        if (input.kind === "folder") {
          previewWorkspaceFolders.add(previewWorkspaceKey(input.desktopId, relativePath));
        } else {
          const content =
            input.fileType === "coach"
              ? `${JSON.stringify(input.coachKind === "planner" ? newCoachPlanner(input.name) : input.coachKind === "board" ? newCoachBoard(input.name) : { version: 1, kind: "document", title: input.name, content: "", data: {} }, null, 2)}\n`
              : input.fileType === "markdown"
                ? `# ${input.name}\n\n`
                : "";
          previewWorkspaceFiles.set(previewWorkspaceKey(input.desktopId, relativePath), {
            desktopId: input.desktopId,
            name,
            relativePath,
            fileType: input.fileType ?? "text",
            content,
            updatedAt: new Date().toISOString(),
          });
        }
        return structuredClone(previewWorkspaceListing(input.desktopId, input.parentPath));
      },
      renameEntry: async (input) => {
        const parent = input.relativePath.split("/").slice(0, -1).join("/");
        const name = input.newName.trim();
        if (!name || name.startsWith(".") || /[\\/:*?"<>|]/.test(name))
          throw new Error("Use a simple file or folder name without reserved characters.");
        const listing = previewWorkspaceListing(input.desktopId, parent);
        const original = listing.entries.find((entry) => entry.relativePath === input.relativePath);
        if (!original) throw new Error("Item unavailable");
        if (
          listing.entries.some(
            (entry) =>
              entry.relativePath !== input.relativePath &&
              entry.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw new Error("A file or folder with that name already exists here.");
        const toPath = parent ? `${parent}/${name}` : name;
        const remap = (value: string) =>
          value === input.relativePath
            ? toPath
            : value.startsWith(`${input.relativePath}/`)
              ? toPath + value.slice(input.relativePath.length)
              : value;
        for (const [key, file] of [...previewWorkspaceFiles]) {
          if (file.desktopId !== input.desktopId) continue;
          const relativePath = remap(file.relativePath);
          if (relativePath === file.relativePath) continue;
          previewWorkspaceFiles.delete(key);
          previewWorkspaceFiles.set(previewWorkspaceKey(input.desktopId, relativePath), {
            ...file,
            relativePath,
            name: relativePath.split("/").pop() ?? file.name,
          });
        }
        for (const key of [...previewWorkspaceFolders]) {
          if (!key.startsWith(`${input.desktopId}:`)) continue;
          const relativePath = key.slice(input.desktopId.length + 1);
          previewWorkspaceFolders.delete(key);
          previewWorkspaceFolders.add(previewWorkspaceKey(input.desktopId, remap(relativePath)));
        }
        const areas = previewAreaFolders(input.desktopId);
        previewWorkspaceAreas.set(
          input.desktopId,
          Object.fromEntries(
            Object.entries(areas).map(([area, value]) => [area, remap(value)]),
          ) as Record<DesktopFolderArea, string>,
        );
        return { fromPath: input.relativePath, toPath, name, kind: input.kind };
      },
      saveFile: async (input) => {
        const key = previewWorkspaceKey(input.desktopId, input.relativePath);
        const file = previewWorkspaceFiles.get(key);
        if (!file) throw new Error("That preview file is unavailable.");
        if (input.expectedUpdatedAt !== file.updatedAt)
          throw new Error("This file changed outside Coach. Reload before saving.");
        if (file.fileType === "coach") {
          const object = JSON.parse(input.content);
          if (object.kind === "board" && !isCoachBoard(object))
            throw new Error("Invalid board format.");
        }
        const saved = { ...file, content: input.content, updatedAt: new Date().toISOString() };
        previewWorkspaceFiles.set(key, saved);
        return structuredClone(saved);
      },
    },
  };

  Object.defineProperty(window, "lattice", { value: api, configurable: true });
}
