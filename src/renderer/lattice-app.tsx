import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
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
import {
  createDesktop,
  DEFAULT_WORKSPACE,
  parseWorkspacePreferences,
  renameDesktop,
  type WorkspacePreferences,
} from "./workspace-model";

type Surface = "home" | "browser" | "library";

const WORKSPACE_STORAGE_KEY = "lattice.workspace.v1";
const SESSION_STORAGE_KEY = "lattice.session.v1";
const emptySnapshot: BrowserSnapshot = { activeTabId: "", tabs: [] };

type CommandItem =
  | { kind: "web"; id: string; label: string; detail: string; query: string }
  | { kind: "tab"; id: string; label: string; detail: string; tab: BrowserState }
  | { kind: "link"; id: string; label: string; detail: string; link: SavedLinkRecord }
  | { kind: "desktop"; id: string; label: string; detail: string; desktopId: string }
  | { kind: "action"; id: string; label: string; detail: string; action: "new-tab" | "library" };

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

const railItems: Array<{ id: Surface | "settings"; label: string; icon: IconName }> = [
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

export function LatticeApp() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const omniboxRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const restorePromiseRef = useRef<Promise<RestoredBrowserState> | null>(null);
  const commandHandlerRef = useRef<(command: ShellCommand) => void>(() => undefined);
  const [workspace, setWorkspace] = useState<WorkspacePreferences>(() =>
    parseWorkspacePreferences(localStorage.getItem(WORKSPACE_STORAGE_KEY)),
  );
  const initialWorkspaceRef = useRef(workspace);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>(emptySnapshot);
  const [tabDesktops, setTabDesktops] = useState<Record<string, string>>({});
  const [surface, setSurface] = useState<Surface>("home");
  const [address, setAddress] = useState("");
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [links, setLinks] = useState<SavedLinkRecord[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureDescription, setCaptureDescription] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [status, setStatus] = useState("Ready");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingDesktop, setAddingDesktop] = useState(false);
  const [desktopName, setDesktopName] = useState("");
  const [editingDesktopId, setEditingDesktopId] = useState<string | null>(null);
  const [editingDesktopName, setEditingDesktopName] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

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
  }, [commandQuery, links, snapshot.tabs, tabDesktops, workspace]);

  useEffect(() => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace]);

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
        const saved = parseRestorableSession(
          localStorage.getItem(SESSION_STORAGE_KEY),
          new Set(initialWorkspace.desktops.map((desktop) => desktop.id)),
        );
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
    if (!sessionReady) return;
    const timeout = window.setTimeout(() => {
      const session = buildRestorableSession(snapshot, tabDesktops, workspace.activeDesktopId);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [sessionReady, snapshot, tabDesktops, workspace.activeDesktopId]);

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
            return window.lattice.browser.setVisible(surface === "browser" && !commandOpen);
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
  }, [commandOpen, surface]);

  useEffect(() => {
    if (!commandOpen) return;
    commandInputRef.current?.focus();
  }, [commandOpen]);

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
      });
      setLinks(await window.lattice.vault.listSavedLinks());
      setSaved(true);
      setStatus("Saved to Obsidian");
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
    else await showLibrary();
  };

  const activeRailItem =
    surface === "library" ? "library" : surface === "home" ? "home" : "browser";

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
                } else setStatus("Settings arrive in a later phase");
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
            onClick={() => setWorkspaceMenuOpen((open) => !open)}
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
              <span>Sessions restore automatically</span>
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
        <button
          type="button"
          className="library-row"
          onClick={() => setStatus("Reading queue arrives next")}
        >
          <Icon name="folder" />
          <span>Reading queue</span>
          <b>0</b>
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
                  tab.id === snapshot.activeTabId && surface !== "library"
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
          <button className="icon-button" type="button" aria-label="More browser actions">
            <Icon name="more" />
          </button>
        </form>

        <div className="content-stage">
          <main className="web-stage">
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

            {surface === "library" && (
              <div className="trusted-surface library-surface">
                <header className="library-header">
                  <div>
                    <span className="eyebrow">Obsidian library</span>
                    <h1>Saved links</h1>
                    <p>
                      {activeDesktop?.name} · {filteredLinks.length} items
                    </p>
                  </div>
                  <div className="library-actions">
                    <label>
                      <Icon name="search" />
                      <input
                        value={libraryQuery}
                        onChange={(event) => setLibraryQuery(event.target.value)}
                        placeholder="Filter saved links"
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
                ) : filteredLinks.length === 0 ? (
                  <div className="empty-library compact">
                    <span className="empty-icon">
                      <Icon name="bookmark" />
                    </span>
                    <h2>No saved links in this desktop</h2>
                    <p>Browse to a useful page and press Save.</p>
                  </div>
                ) : (
                  <div className="link-grid">
                    {filteredLinks.map((link) => (
                      <article className="link-card" key={`${link.id}-${link.relativePath}`}>
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
                          <time>{relativeDate(link.savedAt)}</time>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
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
                        Saved to Obsidian
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
