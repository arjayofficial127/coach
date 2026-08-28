import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrowserPrivacySummary,
  BrowserSnapshot,
  BrowserState,
  SavedLinkRecord,
  ShellCommand,
  VaultInfo,
} from "../shared/contracts";
import { Icon, type IconName } from "./icon";
import {
  buildRestorableSession,
  parseRestorableSession,
  type RestorableTab,
  reconcileRestoredSession,
} from "./session-model";
import { parseSettingsPreferences, type SettingsPreferences } from "./settings-model";
import {
  createDesktop,
  DEFAULT_WORKSPACE,
  deleteDesktop,
  moveTabToDesktop,
  parseWorkspacePreferences,
  renameDesktop,
  type WorkspacePreferences,
} from "./workspace-model";

type Surface = "home" | "browser" | "library" | "queue" | "settings";

const WORKSPACE_STORAGE_KEY = "lattice.workspace.v1";
const SESSION_STORAGE_KEY = "lattice.session.v1";
const SETTINGS_STORAGE_KEY = "lattice.settings.v1";
const emptySnapshot: BrowserSnapshot = { activeTabId: "", tabs: [] };

type CommandItem =
  | { kind: "web"; id: string; label: string; detail: string; query: string }
  | { kind: "tab"; id: string; label: string; detail: string; tab: BrowserState }
  | { kind: "link"; id: string; label: string; detail: string; link: SavedLinkRecord }
  | { kind: "desktop"; id: string; label: string; detail: string; desktopId: string }
  | {
      kind: "action";
      id: string;
      label: string;
      detail: string;
      action: "new-tab" | "library" | "queue";
    };

interface RestoredBrowserState {
  snapshot: BrowserSnapshot;
  assignments: Record<string, string>;
  restoredCount: number;
  restoredActive: RestorableTab | null;
}

const quickStarts = [
  { title: "Search the web", url: "https://www.google.com", tone: "violet", glyph: "G" },
  { title: "Open Wikipedia", url: "https://www.wikipedia.org", tone: "cyan", glyph: "W" },
  { title: "Read Hacker News", url: "https://news.ycombinator.com", tone: "amber", glyph: "Y" },
  { title: "Explore GitHub", url: "https://github.com", tone: "rose", glyph: "⌘" },
];

const railItems: Array<{ id: Surface; label: string; icon: IconName }> = [
  { id: "home", label: "Home", icon: "home" },
  { id: "browser", label: "Browser", icon: "globe" },
  { id: "library", label: "Library", icon: "library" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "New tab";
  }
}

function displayTitle(tab: BrowserState): string {
  if (tab.title && tab.title !== tab.url) return tab.title;
  return tab.url === "about:blank" ? "New tab" : displayHost(tab.url);
}

function relativeDate(input: string): string {
  const elapsed = Date.now() - Date.parse(input);
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function LatticeApp() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const webStageRef = useRef<HTMLElement>(null);
  const omniboxRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const restorePromiseRef = useRef<Promise<RestoredBrowserState> | null>(null);
  const commandHandlerRef = useRef<(command: ShellCommand) => void>(() => undefined);
  const [workspace, setWorkspace] = useState<WorkspacePreferences>(() =>
    parseWorkspacePreferences(localStorage.getItem(WORKSPACE_STORAGE_KEY)),
  );
  const [settings, setSettings] = useState<SettingsPreferences>(() =>
    parseSettingsPreferences(localStorage.getItem(SETTINGS_STORAGE_KEY)),
  );
  const initialWorkspaceRef = useRef(workspace);
  const initialSettingsRef = useRef(settings);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>(emptySnapshot);
  const [tabDesktops, setTabDesktops] = useState<Record<string, string>>({});
  const [surface, setSurface] = useState<Surface>("home");
  const [address, setAddress] = useState("");
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [links, setLinks] = useState<SavedLinkRecord[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureDescription, setCaptureDescription] = useState("");
  const [queueCapture, setQueueCapture] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [status, setStatus] = useState("Ready");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingDesktop, setAddingDesktop] = useState(false);
  const [desktopName, setDesktopName] = useState("");
  const [editingDesktopId, setEditingDesktopId] = useState<string | null>(null);
  const [editingDesktopName, setEditingDesktopName] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const [confirmDeleteDesktopId, setConfirmDeleteDesktopId] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [updatingLinkId, setUpdatingLinkId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<BrowserPrivacySummary>({
    cookieCount: 0,
    cacheBytes: 0,
  });
  const [confirmClearData, setConfirmClearData] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null;
  const activeDesktop =
    workspace.desktops.find((desktop) => desktop.id === workspace.activeDesktopId) ??
    DEFAULT_WORKSPACE.desktops[0];
  const desktopTabs = snapshot.tabs.filter(
    (tab) => tabDesktops[tab.id] === workspace.activeDesktopId,
  );
  const contextualTab =
    activeTab && tabDesktops[activeTab.id] === workspace.activeDesktopId ? activeTab : null;
  const filteredLinks = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return links.filter((link) => {
      const inDesktop =
        !activeDesktop ||
        (link.desktopId ? link.desktopId === activeDesktop.id : link.folder === activeDesktop.name);
      const matches =
        !query ||
        `${link.title} ${link.description} ${link.url} ${link.folder}`
          .toLowerCase()
          .includes(query);
      return inDesktop && matches;
    });
  }, [activeDesktop, libraryQuery, links]);
  const queuedLinks = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return links
      .filter(
        (link) =>
          link.readingStatus === "queued" &&
          (!query ||
            `${link.title} ${link.description} ${link.url} ${link.folder}`
              .toLowerCase()
              .includes(query)),
      )
      .sort((left, right) =>
        (right.queuedAt || right.savedAt).localeCompare(left.queuedAt || left.savedAt),
      );
  }, [libraryQuery, links]);
  const visibleLinks = surface === "queue" ? queuedLinks : filteredLinks;
  const queueCount = links.filter((link) => link.readingStatus === "queued").length;
  const commandItems = useMemo(() => {
    const query = commandQuery.trim();
    const normalizedQuery = query.toLowerCase();
    const desktopName = (desktopId: string) =>
      workspace.desktops.find((desktop) => desktop.id === desktopId)?.name ?? "Workspace";
    const items: CommandItem[] = [
      {
        kind: "action",
        id: "action-new-tab",
        label: "New tab",
        detail: "Browser action",
        action: "new-tab",
      },
      {
        kind: "action",
        id: "action-library",
        label: "Open saved links",
        detail: "Obsidian library",
        action: "library",
      },
      {
        kind: "action",
        id: "action-queue",
        label: "Open reading queue",
        detail: `${queueCount} unread`,
        action: "queue",
      },
      ...workspace.desktops.map<CommandItem>((desktop) => ({
        kind: "desktop",
        id: `desktop-${desktop.id}`,
        label: desktop.name,
        detail: "Desktop",
        desktopId: desktop.id,
      })),
      ...snapshot.tabs.map<CommandItem>((tab) => ({
        kind: "tab",
        id: `tab-${tab.id}`,
        label: displayTitle(tab),
        detail: `${desktopName(tabDesktops[tab.id] ?? workspace.activeDesktopId)} · ${displayHost(tab.url)}`,
        tab,
      })),
      ...links.map<CommandItem>((link) => ({
        kind: "link",
        id: `link-${link.id}-${link.relativePath}`,
        label: link.title,
        detail: `${link.folder || "Saved Links"} · ${displayHost(link.url)}`,
        link,
      })),
    ];
    const filtered = normalizedQuery
      ? items.filter((item) =>
          `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery),
        )
      : items;
    if (query) {
      filtered.push({
        kind: "web",
        id: "search-web",
        label: `Search the web for “${query.slice(0, 80)}”`,
        detail: "Open in this desktop",
        query,
      });
    }
    return filtered.slice(0, 12);
  }, [commandQuery, links, queueCount, snapshot.tabs, tabDesktops, workspace]);

  useEffect(() => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (!settings.restoreTabs) localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    void window.lattice.vault.current().then(async (selected) => {
      if (cancelled || !selected) return;
      const savedLinks = await window.lattice.vault.listSavedLinks();
      if (cancelled) return;
      setVault(selected);
      setLinks(savedLinks);
      setStatus("Obsidian vault restored");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialWorkspace = initialWorkspaceRef.current;
    const initialSettings = initialSettingsRef.current;
    const unsubscribe = window.lattice.browser.onState((state) => {
      setSnapshot((current) => {
        const exists = current.tabs.some((tab) => tab.id === state.id);
        return {
          activeTabId: current.activeTabId || state.id,
          tabs: exists
            ? current.tabs.map((tab) => (tab.id === state.id ? state : tab))
            : [...current.tabs, state],
        };
      });
    });
    if (!restorePromiseRef.current) {
      restorePromiseRef.current = (async () => {
        const initial = await window.lattice.browser.snapshot();
        const saved = initialSettings.restoreTabs
          ? parseRestorableSession(
              localStorage.getItem(SESSION_STORAGE_KEY),
              new Set(initialWorkspace.desktops.map((desktop) => desktop.id)),
            )
          : { version: 1 as const, tabs: [] };
        if (saved.tabs.length === 0) {
          return {
            snapshot: initial,
            assignments: { [initial.activeTabId]: initialWorkspace.activeDesktopId },
            restoredCount: 0,
            restoredActive: null,
          };
        }

        const pristineRuntime = initial.tabs.length === 1 && initial.tabs[0]?.url === "about:blank";
        if (!pristineRuntime) {
          const reconciled = reconcileRestoredSession(
            initial,
            saved,
            initialWorkspace.activeDesktopId,
          );
          return {
            snapshot: initial,
            assignments: reconciled.assignments,
            restoredCount: reconciled.matchedCount,
            restoredActive: reconciled.active,
          };
        }

        const assignments: Record<string, string> = {};
        const restored: Array<{ nativeId: string; saved: RestorableTab }> = [];
        let next = initial;
        for (const savedTab of saved.tabs) {
          next = await window.lattice.browser.createTab(
            savedTab.url === "about:blank" ? undefined : savedTab.url,
          );
          assignments[next.activeTabId] = savedTab.desktopId;
          restored.push({ nativeId: next.activeTabId, saved: savedTab });
        }
        next = await window.lattice.browser.closeTab(initial.activeTabId);
        const target = restored.find((entry) => entry.saved.active) ?? restored[0];
        if (target) next = await window.lattice.browser.switchTab(target.nativeId);
        return {
          snapshot: next,
          assignments,
          restoredCount: restored.length,
          restoredActive: target?.saved ?? null,
        };
      })();
    }
    void restorePromiseRef.current
      .then((restored) => {
        if (cancelled) return;
        setSnapshot(restored.snapshot);
        setTabDesktops(restored.assignments);
        if (restored.restoredActive) {
          setWorkspace((current) => ({
            ...current,
            activeDesktopId: restored.restoredActive?.desktopId ?? current.activeDesktopId,
          }));
          setSurface(restored.restoredActive.url === "about:blank" ? "home" : "browser");
        }
        setSessionReady(true);
        if (restored.restoredCount > 0) {
          setStatus(`Restored ${restored.restoredCount} tabs`);
        }
      })
      .catch(async (error) => {
        if (cancelled) return;
        const fallback = await window.lattice.browser.snapshot();
        setSnapshot(fallback);
        setTabDesktops({ [fallback.activeTabId]: initialWorkspace.activeDesktopId });
        setSessionReady(true);
        setStatus(
          error instanceof Error
            ? `Session restore skipped: ${error.message}`
            : "Session restore skipped",
        );
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !settings.restoreTabs) return;
    const timeout = window.setTimeout(() => {
      const session = buildRestorableSession(snapshot, tabDesktops, workspace.activeDesktopId);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [sessionReady, settings.restoreTabs, snapshot, tabDesktops, workspace.activeDesktopId]);

  useEffect(() => {
    if (!contextualTab || contextualTab.url === "about:blank") {
      setAddress("");
      return;
    }
    setAddress(contextualTab.url);
  }, [contextualTab]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let disposed = false;
    const updateBounds = () => {
      const bounds = viewport.getBoundingClientRect();
      void window.lattice.browser
        .setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
        .then(() => {
          if (!disposed)
            return window.lattice.browser.setVisible(
              surface === "browser" && !browserMenuOpen && !commandOpen,
            );
        });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(viewport);
    window.addEventListener("resize", updateBounds);
    updateBounds();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      void window.lattice.browser.setVisible(false);
    };
  }, [browserMenuOpen, commandOpen, surface]);

  useEffect(() => {
    if (!commandOpen) return;
    commandInputRef.current?.focus();
  }, [commandOpen]);

  useEffect(() => {
    if (surface !== "browser") webStageRef.current?.scrollTo({ top: 0 });
  }, [surface]);

  const setBrowserSnapshot = (next: BrowserSnapshot, desktopId = workspace.activeDesktopId) => {
    setSnapshot(next);
    setTabDesktops((current) => ({
      ...current,
      [next.activeTabId]: current[next.activeTabId] ?? desktopId,
    }));
  };

  const openUrl = async (
    url: string,
    forceNewTab = false,
    desktopId = workspace.activeDesktopId,
  ) => {
    try {
      const reusable =
        !forceNewTab &&
        activeTab &&
        tabDesktops[activeTab.id] === desktopId &&
        activeTab.url === "about:blank";
      if (reusable) {
        await window.lattice.browser.navigate(url);
      } else {
        setBrowserSnapshot(await window.lattice.browser.createTab(url), desktopId);
      }
      setSurface("browser");
      setCaptureOpen(false);
      setStatus(`Opened ${displayHost(url)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const navigate = async (event: FormEvent) => {
    event.preventDefault();
    if (!address.trim()) return;
    await openUrl(address);
  };

  const createTab = async (desktopId = workspace.activeDesktopId) => {
    try {
      const next = await window.lattice.browser.createTab();
      setBrowserSnapshot(next, desktopId);
      setAddress("");
      setSurface("home");
      setCaptureOpen(false);
      setStatus("New tab ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const switchTab = async (tab: BrowserState) => {
    try {
      setSnapshot(await window.lattice.browser.switchTab(tab.id));
      setSurface(tab.url === "about:blank" ? "home" : "browser");
      setCaptureOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const closeTab = async (tabId: string) => {
    try {
      const next = await window.lattice.browser.closeTab(tabId);
      setSnapshot(next);
      const remaining = { ...tabDesktops };
      delete remaining[tabId];
      remaining[next.activeTabId] ??= workspace.activeDesktopId;
      setTabDesktops(remaining);
      const nextActive = next.tabs.find((tab) => tab.id === next.activeTabId);
      setSurface(
        remaining[next.activeTabId] === workspace.activeDesktopId &&
          nextActive?.url !== "about:blank"
          ? "browser"
          : "home",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const selectDesktop = async (desktopId: string) => {
    setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
    const firstTab = snapshot.tabs.find((tab) => tabDesktops[tab.id] === desktopId);
    if (firstTab) {
      setSnapshot(await window.lattice.browser.switchTab(firstTab.id));
      setSurface(firstTab.url === "about:blank" ? "home" : "browser");
    } else {
      setAddress("");
      setSurface("home");
    }
    setCaptureOpen(false);
  };

  const addDesktop = (event: FormEvent) => {
    event.preventDefault();
    if (!desktopName.trim()) return;
    const desktop = createDesktop(desktopName, workspace.desktops.length);
    setWorkspace((current) => ({
      ...current,
      activeDesktopId: desktop.id,
      desktops: [...current.desktops, desktop],
    }));
    setDesktopName("");
    setAddingDesktop(false);
    setSurface("home");
  };

  const beginRenameDesktop = () => {
    if (!activeDesktop) return;
    setEditingDesktopId(activeDesktop.id);
    setEditingDesktopName(activeDesktop.name);
    setWorkspaceMenuOpen(false);
  };

  const submitDesktopRename = (event: FormEvent) => {
    event.preventDefault();
    if (!editingDesktopId) return;
    const next = renameDesktop(workspace, editingDesktopId, editingDesktopName);
    if (next === workspace) {
      setStatus("Choose a unique desktop name");
      return;
    }
    setWorkspace(next);
    setEditingDesktopId(null);
    setEditingDesktopName("");
    setStatus("Desktop renamed; existing Obsidian folders were left untouched");
  };

  const closeAllTabs = async () => {
    try {
      let next = snapshot;
      for (const tab of snapshot.tabs) next = await window.lattice.browser.closeTab(tab.id);
      setSnapshot(next);
      setTabDesktops({ [next.activeTabId]: workspace.activeDesktopId });
      setSurface("home");
      setAddress("");
      setCaptureOpen(false);
      setWorkspaceMenuOpen(false);
      setStatus("Started a fresh browser session");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const moveActiveTab = (targetDesktopId: string) => {
    if (!contextualTab) return;
    const target = workspace.desktops.find((desktop) => desktop.id === targetDesktopId);
    if (!target) return;
    setTabDesktops((current) =>
      moveTabToDesktop(current, workspace, contextualTab.id, targetDesktopId),
    );
    setWorkspace((current) => ({ ...current, activeDesktopId: targetDesktopId }));
    setBrowserMenuOpen(false);
    setCaptureOpen(false);
    setStatus(`Moved tab to ${target.name}`);
  };

  const requestDeleteActiveDesktop = async () => {
    if (!activeDesktop) return;
    const openTabCount = snapshot.tabs.filter(
      (tab) => tabDesktops[tab.id] === activeDesktop.id,
    ).length;
    const savedLinkCount = links.filter((link) =>
      link.desktopId ? link.desktopId === activeDesktop.id : link.folder === activeDesktop.name,
    ).length;
    const result = deleteDesktop(workspace, activeDesktop.id, { openTabCount, savedLinkCount });

    if (!result.deleted) {
      const messages = {
        "not-found": "Desktop no longer exists",
        "last-desktop": "Keep at least one desktop",
        "has-open-tabs": "Move or close this desktop's tabs first",
        "has-saved-links": "This desktop has saved links; its Obsidian folder was left untouched",
      };
      setConfirmDeleteDesktopId(null);
      setStatus(messages[result.reason]);
      return;
    }

    if (confirmDeleteDesktopId !== activeDesktop.id) {
      setConfirmDeleteDesktopId(activeDesktop.id);
      setStatus("Delete this empty desktop? Press delete again to confirm");
      return;
    }

    const nextDesktopId = result.workspace.activeDesktopId;
    setWorkspace(result.workspace);
    setConfirmDeleteDesktopId(null);
    setWorkspaceMenuOpen(false);
    setCaptureOpen(false);

    const firstTab = snapshot.tabs.find((tab) => tabDesktops[tab.id] === nextDesktopId);
    if (firstTab) {
      setSnapshot(await window.lattice.browser.switchTab(firstTab.id));
      setSurface(firstTab.url === "about:blank" ? "home" : "browser");
    } else {
      setAddress("");
      setSurface("home");
    }
    setStatus("Deleted empty desktop; Obsidian folders were untouched");
  };

  const connectVault = async (disposable = false) => {
    try {
      const selected = disposable
        ? await window.lattice.vault.createDisposable()
        : await window.lattice.vault.choose();
      if (!selected) return;
      setVault(selected);
      setLinks(await window.lattice.vault.listSavedLinks());
      setStatus(disposable ? "Disposable vault connected" : "Obsidian vault connected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const openCapture = () => {
    if (!contextualTab || contextualTab.url === "about:blank") return;
    setCaptureDescription("");
    setQueueCapture(false);
    setSaved(false);
    setCaptureOpen(true);
    setSurface("browser");
  };

  const saveLink = async () => {
    if (!contextualTab || !vault || contextualTab.url === "about:blank") return;
    setSaving(true);
    try {
      await window.lattice.vault.saveProbeNote({
        title: displayTitle(contextualTab),
        url: contextualTab.url,
        description: captureDescription.trim(),
        folder: activeDesktop?.name ?? "Research",
        desktopId: activeDesktop?.id ?? "research",
        readingStatus: queueCapture ? "queued" : "saved",
      });
      setLinks(await window.lattice.vault.listSavedLinks());
      setSaved(true);
      setStatus(queueCapture ? "Saved to your reading queue" : "Saved to Obsidian");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const showLibrary = async () => {
    setSurface("library");
    setCaptureOpen(false);
    if (vault) setLinks(await window.lattice.vault.listSavedLinks());
  };

  const showReadingQueue = async () => {
    setSurface("queue");
    setCaptureOpen(false);
    if (vault) setLinks(await window.lattice.vault.listSavedLinks());
  };

  const showSettings = async () => {
    setSurface("settings");
    setCaptureOpen(false);
    setCommandOpen(false);
    setConfirmClearData(false);
    try {
      setPrivacy(await window.lattice.browser.privacySummary());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleRestoreTabs = () => {
    setSettings((current) => ({ ...current, restoreTabs: !current.restoreTabs }));
    setStatus(settings.restoreTabs ? "Tab restoration disabled" : "Tab restoration enabled");
  };

  const clearWebsiteData = async () => {
    if (!confirmClearData) {
      setConfirmClearData(true);
      setStatus("Confirm clearing website cookies, cache, and local storage");
      return;
    }
    setClearingData(true);
    try {
      setPrivacy(await window.lattice.browser.clearWebsiteData());
      setConfirmClearData(false);
      setStatus("Website data cleared; open sites may ask you to sign in again");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setClearingData(false);
    }
  };

  const disconnectVault = async () => {
    try {
      await window.lattice.vault.disconnect();
      setVault(null);
      setLinks([]);
      setStatus("Vault disconnected; no Markdown files were deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const updateReadingStatus = async (
    link: SavedLinkRecord,
    readingStatus: SavedLinkRecord["readingStatus"],
  ) => {
    setUpdatingLinkId(link.id);
    try {
      const updated = await window.lattice.vault.setReadingStatus({
        id: link.id,
        status: readingStatus,
      });
      setLinks((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setStatus(
        readingStatus === "queued"
          ? "Added to reading queue"
          : readingStatus === "read"
            ? "Marked as read"
            : "Removed from reading queue",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const openCommandPalette = () => {
    setCommandQuery("");
    setCommandOpen(true);
    setCaptureOpen(false);
    setWorkspaceMenuOpen(false);
  };

  const runCommand = async (item: CommandItem) => {
    setCommandOpen(false);
    if (item.kind === "web") {
      await openUrl(item.query);
      return;
    }
    if (item.kind === "desktop") {
      await selectDesktop(item.desktopId);
      return;
    }
    if (item.kind === "tab") {
      const desktopId = tabDesktops[item.tab.id] ?? workspace.activeDesktopId;
      setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
      await switchTab(item.tab);
      return;
    }
    if (item.kind === "link") {
      const desktopId =
        (item.link.desktopId &&
          workspace.desktops.some((desktop) => desktop.id === item.link.desktopId) &&
          item.link.desktopId) ||
        workspace.desktops.find((desktop) => desktop.name === item.link.folder)?.id ||
        workspace.activeDesktopId;
      setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
      await openUrl(item.link.url, true, desktopId);
      return;
    }
    if (item.action === "new-tab") await createTab();
    else if (item.action === "queue") await showReadingQueue();
    else await showLibrary();
  };

  const activeRailItem =
    surface === "library" || surface === "queue"
      ? "library"
      : surface === "home"
        ? "home"
        : surface === "settings"
          ? "settings"
          : "browser";

  commandHandlerRef.current = (command) => {
    if (command === "search") {
      openCommandPalette();
      return;
    }
    if (command === "focus-location") {
      setCommandOpen(false);
      setCaptureOpen(false);
      window.requestAnimationFrame(() => {
        omniboxRef.current?.focus();
        omniboxRef.current?.select();
      });
      return;
    }
    if (command === "new-tab") {
      void createTab();
      return;
    }
    if (contextualTab) void closeTab(contextualTab.id);
  };

  useEffect(() => {
    const unsubscribe = window.lattice.shell.onCommand((command) =>
      commandHandlerRef.current(command),
    );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCaptureOpen(false);
        setWorkspaceMenuOpen(false);
        return;
      }
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const command =
        event.key.toLowerCase() === "k"
          ? "search"
          : event.key.toLowerCase() === "l"
            ? "focus-location"
            : event.key.toLowerCase() === "t"
              ? "new-tab"
              : event.key.toLowerCase() === "w"
                ? "close-tab"
                : null;
      if (!command) return;
      event.preventDefault();
      commandHandlerRef.current(command);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribe();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="lattice-shell">
      <nav className="activity-rail" aria-label="Primary navigation">
        <button
          className="brand-mark"
          type="button"
          onClick={() => setSurface("home")}
          aria-label="Lattice home"
        >
          <span>L</span>
        </button>
        <div className="rail-actions">
          {railItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeRailItem === item.id ? "rail-button active" : "rail-button"}
              aria-label={item.label}
              title={item.label}
              onClick={() => {
                if (item.id === "library") void showLibrary();
                else if (item.id === "home") {
                  setSurface("home");
                  setCaptureOpen(false);
                } else if (item.id === "browser") {
                  setSurface(activeTab?.url === "about:blank" ? "home" : "browser");
                } else void showSettings();
              }}
            >
              <Icon name={item.icon} />
            </button>
          ))}
        </div>
        <div className="rail-spacer" />
        <button
          className="profile-button"
          type="button"
          title="Personal profile"
          aria-label="Personal profile"
        >
          A
        </button>
      </nav>

      <aside className="workspace-panel">
        <div className="workspace-heading">
          <div className="workspace-title">
            <span className="eyebrow">Workspace</span>
            <strong>Personal research</strong>
          </div>
          <button
            className="icon-button subtle"
            type="button"
            aria-label="Workspace menu"
            aria-expanded={workspaceMenuOpen}
            onClick={() => {
              setConfirmDeleteDesktopId(null);
              setWorkspaceMenuOpen((open) => !open);
            }}
          >
            <Icon name="more" />
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu">
              <button type="button" onClick={beginRenameDesktop}>
                <Icon name="desktop" />
                Rename {activeDesktop?.name}
              </button>
              <button type="button" onClick={() => void closeAllTabs()}>
                <Icon name="close" />
                Close all tabs
              </button>
              <button
                type="button"
                className="danger-action"
                data-delete-desktop={activeDesktop?.id}
                onClick={() => void requestDeleteActiveDesktop()}
              >
                <Icon name="close" />
                {confirmDeleteDesktopId === activeDesktop?.id
                  ? "Confirm delete empty desktop"
                  : `Delete ${activeDesktop?.name ?? "desktop"}`}
              </button>
              <span>Markdown folders are never deleted</span>
            </div>
          )}
        </div>

        <button type="button" className="panel-search" onClick={openCommandPalette}>
          <Icon name="search" />
          <span>Search everything</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="section-label">
          <span>Desktops</span>
          <button type="button" onClick={() => setAddingDesktop(true)} aria-label="Add desktop">
            <Icon name="plus" />
          </button>
        </div>
        <div className="desktop-list">
          {workspace.desktops.map((desktop) => {
            const tabCount = snapshot.tabs.filter(
              (tab) => tabDesktops[tab.id] === desktop.id,
            ).length;
            const linkCount = links.filter((link) =>
              link.desktopId ? link.desktopId === desktop.id : link.folder === desktop.name,
            ).length;
            return (
              <button
                type="button"
                key={desktop.id}
                className={
                  desktop.id === workspace.activeDesktopId ? "desktop-item active" : "desktop-item"
                }
                onClick={() => void selectDesktop(desktop.id)}
              >
                <span className={`desktop-glyph ${desktop.color}`}>
                  <Icon name="desktop" />
                </span>
                <span className="desktop-copy">
                  <strong>{desktop.name}</strong>
                  <small>
                    {tabCount} tabs · {linkCount} saved
                  </small>
                </span>
                {desktop.id === workspace.activeDesktopId && <span className="active-dot" />}
              </button>
            );
          })}
        </div>
        {addingDesktop && (
          <form className="add-desktop-form" onSubmit={addDesktop}>
            <input
              value={desktopName}
              onChange={(event) => setDesktopName(event.target.value)}
              placeholder="Desktop name"
              maxLength={40}
            />
            <button type="submit" aria-label="Create desktop">
              <Icon name="check" />
            </button>
            <button type="button" aria-label="Cancel" onClick={() => setAddingDesktop(false)}>
              <Icon name="close" />
            </button>
          </form>
        )}
        {editingDesktopId && (
          <form className="add-desktop-form rename-desktop-form" onSubmit={submitDesktopRename}>
            <input
              value={editingDesktopName}
              onChange={(event) => setEditingDesktopName(event.target.value)}
              placeholder="Desktop name"
              maxLength={40}
              aria-label="Rename desktop"
            />
            <button type="submit" aria-label="Save desktop name">
              <Icon name="check" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              onClick={() => setEditingDesktopId(null)}
            >
              <Icon name="close" />
            </button>
          </form>
        )}

        <div className="section-label library-label">
          <span>Library</span>
        </div>
        <button type="button" className="library-row" onClick={() => void showLibrary()}>
          <Icon name="bookmark" />
          <span>Saved links</span>
          <b>{links.length}</b>
        </button>
        <button type="button" className="library-row" onClick={() => void showReadingQueue()}>
          <Icon name="folder" />
          <span>Reading queue</span>
          <b>{queueCount}</b>
        </button>

        <div className="workspace-spacer" />
        <div className={vault ? "vault-card connected" : "vault-card"}>
          <div className="vault-card-icon">
            <Icon name={vault ? "check" : "sparkle"} />
          </div>
          <div className="vault-card-copy">
            <strong>{vault ? "Vault connected" : "Connect Obsidian"}</strong>
            <span>
              {vault ? vault.displayPath.split(/[\\/]/).pop() : "Save pages as local Markdown"}
            </span>
          </div>
          {!vault && (
            <button type="button" onClick={() => void connectVault(false)}>
              Connect
            </button>
          )}
        </div>
      </aside>

      <section className={captureOpen ? "content-shell drawer-open" : "content-shell"}>
        <header className="tab-strip">
          <div className="desktop-context">
            <span className={`context-dot ${activeDesktop?.color ?? "violet"}`} />
            {activeDesktop?.name ?? "Research"}
          </div>
          <div className="tabs-viewport">
            {desktopTabs.map((tab) => (
              <div
                key={tab.id}
                className={
                  tab.id === snapshot.activeTabId &&
                  surface !== "library" &&
                  surface !== "queue" &&
                  surface !== "settings"
                    ? "browser-tab active"
                    : "browser-tab"
                }
              >
                <button className="tab-select" type="button" onClick={() => void switchTab(tab)}>
                  <span className="favicon">
                    {tab.url === "about:blank" ? (
                      <Icon name="sparkle" />
                    ) : (
                      displayHost(tab.url).slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="tab-title">{displayTitle(tab)}</span>
                </button>
                {tab.loading ? (
                  <span className="tab-spinner" />
                ) : (
                  <button
                    type="button"
                    className="tab-close"
                    aria-label={`Close ${displayTitle(tab)}`}
                    onClick={() => void closeTab(tab.id)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
            ))}
            <button
              className="new-tab-button"
              type="button"
              onClick={() => void createTab()}
              aria-label="New tab"
            >
              <Icon name="plus" />
            </button>
          </div>
          <div className="window-drag-space" />
        </header>

        <form className="browser-toolbar" onSubmit={navigate}>
          <div className="navigation-actions">
            <button
              type="button"
              disabled={!contextualTab?.canGoBack}
              onClick={() => window.lattice.browser.back()}
              aria-label="Back"
            >
              <Icon name="arrow-left" />
            </button>
            <button
              type="button"
              disabled={!contextualTab?.canGoForward}
              onClick={() => window.lattice.browser.forward()}
              aria-label="Forward"
            >
              <Icon name="arrow-right" />
            </button>
            <button
              type="button"
              onClick={() => window.lattice.browser.reload()}
              aria-label="Reload"
            >
              <Icon name="reload" />
            </button>
          </div>
          <label className="omnibox">
            <Icon name={contextualTab?.url.startsWith("https://") ? "lock" : "search"} />
            <span className="sr-only">Web address</span>
            <input
              ref={omniboxRef}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Search or enter an address"
              spellCheck={false}
            />
            {address && (
              <button type="button" onClick={() => setAddress("")} aria-label="Clear address">
                <Icon name="close" />
              </button>
            )}
          </label>
          <button
            className={captureOpen ? "save-page-button active" : "save-page-button"}
            type="button"
            onClick={openCapture}
            disabled={!contextualTab || contextualTab.url === "about:blank"}
          >
            <Icon name="bookmark" />
            <span>Save</span>
          </button>
          <div className="browser-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="More browser actions"
              aria-expanded={browserMenuOpen}
              disabled={!contextualTab}
              onClick={() => setBrowserMenuOpen((open) => !open)}
            >
              <Icon name="more" />
            </button>
            {browserMenuOpen && contextualTab && (
              <div className="browser-actions-menu">
                <span>Move tab to</span>
                {workspace.desktops
                  .filter((desktop) => desktop.id !== workspace.activeDesktopId)
                  .map((desktop) => (
                    <button
                      type="button"
                      key={desktop.id}
                      data-move-tab-to={desktop.id}
                      onClick={() => moveActiveTab(desktop.id)}
                    >
                      <span className={`context-dot ${desktop.color}`} />
                      <span>
                        <strong>{desktop.name}</strong>
                        <small>Keep page open</small>
                      </span>
                    </button>
                  ))}
                {workspace.desktops.length <= 1 && <p>Create another desktop first</p>}
              </div>
            )}
          </div>
        </form>

        <div className="content-stage">
          <main ref={webStageRef} className="web-stage">
            <div ref={viewportRef} className="native-view-slot">
              Native WebContentsView surface
            </div>
            {surface === "home" && (
              <div className="trusted-surface home-surface">
                <div className="home-hero">
                  <span className="hero-kicker">
                    <Icon name="sparkle" /> {activeDesktop?.name ?? "Research"} desktop
                  </span>
                  <h1>Where will your curiosity take you?</h1>
                  <p>Browse freely. Keep what matters. Your notes stay local.</p>
                  <form className="hero-search" onSubmit={navigate}>
                    <Icon name="search" />
                    <input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Search the web or paste a link"
                    />
                    <button type="submit">
                      Go <span>↗</span>
                    </button>
                  </form>
                </div>
                <div className="quick-grid">
                  {quickStarts.map((item) => (
                    <button
                      type="button"
                      key={item.url}
                      className="quick-card"
                      onClick={() => void openUrl(item.url)}
                    >
                      <span className={`quick-glyph ${item.tone}`}>{item.glyph}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{displayHost(item.url)}</small>
                      </span>
                      <Icon name="arrow-right" />
                    </button>
                  ))}
                </div>
                <div className="privacy-note">
                  <Icon name="lock" />
                  <span>
                    <strong>Private by design</strong>Your workspace and Markdown stay on this
                    computer.
                  </span>
                </div>
              </div>
            )}

            {(surface === "library" || surface === "queue") && (
              <div className="trusted-surface library-surface">
                <header className="library-header">
                  <div>
                    <span className="eyebrow">
                      {surface === "queue" ? "Read with intention" : "Obsidian library"}
                    </span>
                    <h1>{surface === "queue" ? "Reading queue" : "Saved links"}</h1>
                    <p>
                      {surface === "queue"
                        ? `${visibleLinks.length} unread across all desktops`
                        : `${activeDesktop?.name} · ${visibleLinks.length} items`}
                    </p>
                  </div>
                  <div className="library-actions">
                    <label>
                      <Icon name="search" />
                      <input
                        value={libraryQuery}
                        onChange={(event) => setLibraryQuery(event.target.value)}
                        placeholder={
                          surface === "queue" ? "Filter reading queue" : "Filter saved links"
                        }
                      />
                    </label>
                    {!vault && (
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void connectVault(false)}
                      >
                        Connect vault
                      </button>
                    )}
                  </div>
                </header>
                {!vault ? (
                  <div className="empty-library">
                    <span className="empty-icon">
                      <Icon name="library" />
                    </span>
                    <h2>Your local library begins here</h2>
                    <p>Connect an Obsidian folder, then save any page with your own description.</p>
                    <div>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void connectVault(false)}
                      >
                        Choose Obsidian vault
                      </button>
                      <button type="button" onClick={() => void connectVault(true)}>
                        Try disposable vault
                      </button>
                    </div>
                  </div>
                ) : visibleLinks.length === 0 ? (
                  <div className="empty-library compact">
                    <span className="empty-icon">
                      <Icon name={surface === "queue" ? "check" : "bookmark"} />
                    </span>
                    <h2>
                      {surface === "queue"
                        ? "Your reading queue is clear"
                        : "No saved links in this desktop"}
                    </h2>
                    <p>
                      {surface === "queue"
                        ? "Queue a saved page when you want to return to it with focus."
                        : "Browse to a useful page and press Save."}
                    </p>
                  </div>
                ) : (
                  <div className="link-grid">
                    {visibleLinks.map((link) => (
                      <article
                        className={
                          link.readingStatus === "queued" ? "link-card queued" : "link-card"
                        }
                        key={`${link.id}-${link.relativePath}`}
                      >
                        <button
                          type="button"
                          className="link-main"
                          onClick={() => void openUrl(link.url, true)}
                        >
                          <span className="link-domain">
                            <span>{displayHost(link.url).slice(0, 1).toUpperCase()}</span>
                            {displayHost(link.url)}
                          </span>
                          <h2>{link.title}</h2>
                          <p>{link.description || "No description added."}</p>
                        </button>
                        <footer>
                          <span>
                            <Icon name="folder" />
                            {link.folder || "Saved Links"}
                          </span>
                          <div className="link-card-actions">
                            {link.readingStatus === "queued" ? (
                              <button
                                type="button"
                                onClick={() => void updateReadingStatus(link, "read")}
                                disabled={updatingLinkId === link.id}
                              >
                                <Icon name="check" />
                                Mark read
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void updateReadingStatus(link, "queued")}
                                disabled={updatingLinkId === link.id}
                              >
                                <Icon name="bookmark" />
                                {link.readingStatus === "read" ? "Read again" : "Read later"}
                              </button>
                            )}
                            <time>{relativeDate(link.queuedAt || link.savedAt)}</time>
                          </div>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {surface === "settings" && (
              <div className="trusted-surface settings-surface">
                <header className="settings-header">
                  <span className="eyebrow">Local control</span>
                  <h1>Settings</h1>
                  <p>Control continuity and private data without changing website permissions.</p>
                </header>
                <div className="settings-grid">
                  <section className="settings-card">
                    <div className="settings-card-icon violet">
                      <Icon name="reload" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Browsing continuity</span>
                      <h2>Restore tabs on launch</h2>
                      <p>
                        Remember HTTPS URLs and desktop membership. History, forms, and page content
                        are never serialized by Lattice.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={
                        settings.restoreTabs ? "settings-switch active" : "settings-switch"
                      }
                      role="switch"
                      aria-checked={settings.restoreTabs}
                      aria-label="Restore tabs on launch"
                      onClick={toggleRestoreTabs}
                    >
                      <span />
                    </button>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-icon cyan">
                      <Icon name="globe" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Isolated website profile</span>
                      <h2>Cookies and cache</h2>
                      <p>
                        {privacy.cookieCount} cookies · {formatBytes(privacy.cacheBytes)} cached.
                        Clearing signs you out of websites but does not touch Obsidian notes.
                      </p>
                    </div>
                    <div className="settings-card-actions">
                      <button
                        type="button"
                        className={confirmClearData ? "settings-action warning" : "settings-action"}
                        disabled={clearingData}
                        onClick={() => void clearWebsiteData()}
                      >
                        {clearingData
                          ? "Clearing…"
                          : confirmClearData
                            ? "Confirm clear"
                            : "Clear website data"}
                      </button>
                      {confirmClearData && (
                        <button
                          type="button"
                          className="settings-cancel"
                          onClick={() => setConfirmClearData(false)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-icon green">
                      <Icon name="folder" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Obsidian</span>
                      <h2>{vault ? "Vault connected" : "No vault connected"}</h2>
                      <p>
                        {vault
                          ? `${vault.displayPath}. Disconnecting forgets this location and never deletes Markdown.`
                          : "Choose a local Obsidian vault to capture pages and manage your reading queue."}
                      </p>
                    </div>
                    {vault ? (
                      <button
                        type="button"
                        className="settings-action"
                        onClick={() => void disconnectVault()}
                      >
                        Disconnect vault
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-action primary"
                        onClick={() => void connectVault(false)}
                      >
                        Connect vault
                      </button>
                    )}
                  </section>

                  <section className="settings-card about-card">
                    <div className="settings-card-icon amber">
                      <Icon name="lock" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">About</span>
                      <h2>Lattice 0.6.0</h2>
                      <p>
                        Current privacy controls. Remote Node access, downloads, popups, device
                        permissions, and unsafe protocols remain disabled.
                      </p>
                    </div>
                    <span className="settings-badge">Local-first</span>
                  </section>
                </div>
              </div>
            )}
          </main>

          {captureOpen && (
            <aside className="capture-panel">
              <header>
                <div>
                  <span className="eyebrow">Save to Obsidian</span>
                  <h2>Capture this page</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCaptureOpen(false)}
                  aria-label="Close capture panel"
                >
                  <Icon name="close" />
                </button>
              </header>
              <div className="capture-preview">
                <span className="capture-favicon">
                  {displayHost(activeTab?.url ?? "")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{activeTab ? displayTitle(activeTab) : "Untitled page"}</strong>
                  <span>{displayHost(activeTab?.url ?? "")}</span>
                </div>
              </div>
              {!vault ? (
                <div className="capture-connect">
                  <span>
                    <Icon name="sparkle" />
                  </span>
                  <h3>Connect your vault first</h3>
                  <p>Lattice writes plain Markdown. Nothing is locked inside the app.</p>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void connectVault(false)}
                  >
                    Choose Obsidian vault
                  </button>
                  <button type="button" onClick={() => void connectVault(true)}>
                    Use a disposable vault
                  </button>
                </div>
              ) : (
                <div className="capture-form">
                  <label>
                    <span>
                      Description <small>optional</small>
                    </span>
                    <textarea
                      value={captureDescription}
                      onChange={(event) => setCaptureDescription(event.target.value)}
                      placeholder="Why is this worth keeping?"
                      maxLength={4000}
                    />
                  </label>
                  <div className="capture-field">
                    <span>Folder</span>
                    <div className="folder-select">
                      <Icon name="folder" />
                      <strong>Saved Links / {activeDesktop?.name}</strong>
                      <Icon name="chevron-down" />
                    </div>
                  </div>
                  <button
                    type="button"
                    className={queueCapture ? "queue-toggle active" : "queue-toggle"}
                    aria-pressed={queueCapture}
                    onClick={() => setQueueCapture((queued) => !queued)}
                  >
                    <span className="queue-toggle-check">
                      <Icon name={queueCapture ? "check" : "plus"} />
                    </span>
                    <span>
                      <strong>Add to reading queue</strong>
                      <small>Keep this page ready for focused reading</small>
                    </span>
                  </button>
                  <div className="local-note">
                    <Icon name="lock" />
                    <span>
                      Saved locally as Markdown in{" "}
                      <strong>{vault.displayPath.split(/[\\/]/).pop()}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className={saved ? "capture-submit saved" : "capture-submit"}
                    onClick={() => void saveLink()}
                    disabled={saving || saved}
                  >
                    {saved ? (
                      <>
                        <Icon name="check" />
                        {queueCapture ? "Saved to reading queue" : "Saved to Obsidian"}
                      </>
                    ) : saving ? (
                      "Saving…"
                    ) : (
                      <>
                        <Icon name="bookmark" />
                        Save page
                      </>
                    )}
                  </button>
                </div>
              )}
            </aside>
          )}
          <div className="vault-probe smoke-vault-boundary" aria-hidden="true" />
        </div>

        <footer className="status-bar" aria-live="polite">
          <span>
            <i className={activeTab?.loading ? "status-pulse active" : "status-pulse"} />
            {activeTab?.loading ? "Loading" : status}
          </span>
          <span>
            <Icon name="lock" />
            Remote Node access disabled
          </span>
        </footer>
      </section>
      {commandOpen && (
        <div className="command-layer">
          <button
            type="button"
            className="command-backdrop"
            aria-label="Close search"
            onClick={() => setCommandOpen(false)}
          />
          <form
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search everything"
            onSubmit={(event) => {
              event.preventDefault();
              const first = commandItems[0];
              if (first) void runCommand(first);
            }}
          >
            <label className="command-input">
              <Icon name="search" />
              <span className="sr-only">Search tabs, desktops, and saved links</span>
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const first = commandItems[0];
                  if (first) void runCommand(first);
                }}
                placeholder="Search tabs, desktops, saved links, or the web"
              />
              <kbd>ESC</kbd>
            </label>
            <button type="submit" className="sr-only">
              Run first result
            </button>
            <div className="command-results">
              {commandItems.length === 0 ? (
                <div className="command-empty">
                  No local matches. Keep typing to search the web.
                </div>
              ) : (
                commandItems.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={index === 0 ? "command-result selected" : "command-result"}
                    onClick={() => void runCommand(item)}
                  >
                    <span className={`command-result-icon ${item.kind}`}>
                      <Icon
                        name={
                          item.kind === "desktop"
                            ? "desktop"
                            : item.kind === "link"
                              ? "bookmark"
                              : item.kind === "action" && item.action === "library"
                                ? "library"
                                : item.kind === "action" && item.action === "queue"
                                  ? "folder"
                                  : item.kind === "action"
                                    ? "plus"
                                    : item.kind === "web"
                                      ? "search"
                                      : "globe"
                        }
                      />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    {index === 0 && <kbd>↵</kbd>}
                  </button>
                ))
              )}
            </div>
            <footer className="command-footer">
              <span>Local-first search</span>
              <span>
                <kbd>Ctrl L</kbd> address <kbd>Ctrl T</kbd> new tab <kbd>Ctrl W</kbd> close
              </span>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
