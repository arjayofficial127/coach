import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isCoachBoard, parseCoachObject, writeCoachObject } from "../shared/coach-board";
import type {
  BrowserSourceCapture,
  BrowserState,
  WorkspaceDirectoryEntry,
  WorkspaceEditableFileType,
} from "../shared/contracts";
import { sourceMarkdown } from "../shared/source-capture";
import { Icon } from "./icon";
import {
  acceptSavedDocument,
  loadWorkspaceIndex,
  noteReferences,
  renamedWorkspacePath,
  renameWorkspaceTabs,
  resolveNoteReference,
  type WorkspaceIndex,
  type WorkspaceTab,
  workspaceDisplayName,
  workspaceDocumentTitle,
  workspaceEntryTitle,
  workspaceErrorMessage,
  workspaceFolderCounts,
  workspaceTitle,
} from "./local-workspace-model";
import { WorkspaceDocument } from "./workspace-document";
import { WorkspaceFileRows, WorkspaceHome } from "./workspace-home";
import { WorkspacePortal } from "./workspace-portal";
import { WorkspaceSource } from "./workspace-source";
import "./workspace-studio.css";
import "./workspace-vision.css";
import "./workspace-calm.css";

type NewEntryKind = "folder" | "board" | "planner" | WorkspaceEditableFileType;
type View = "home" | "files" | "recent";
// Session-only copies partitioned by website profile, vault identity, and desktop.
const sessions = new Map<string, WorkspaceTab[]>();
const sessionListeners = new Set<() => void>();
const pendingSaves = new Map<string, Set<string>>();
const pendingRenames = new Set<string>();
const protectSessionDrafts = (event: BeforeUnloadEvent) => {
  if (
    [...sessions.values()].some((tabs) => tabs.some((tab) => tab.draft !== tab.document.content))
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
};
if (typeof window !== "undefined") window.addEventListener("beforeunload", protectSessionDrafts);
if (import.meta.hot)
  import.meta.hot.dispose(() => window.removeEventListener("beforeunload", protectSessionDrafts));
interface Props {
  tabsTarget?: HTMLElement | null;
  browserTabs?: BrowserState[];
  sourceTab?: BrowserState | null;
  onSourceTab?: (id: string) => Promise<void>;
  onResearchUrl?: (url: string) => Promise<void>;
  onSourceViewport?: (node: HTMLDivElement | null) => void;
  onFocus?: () => void;
  onOpenApp?: (id: "pomodoro") => void;
  desktopId: string;
  desktopName: string;
  workspaceName: string;
  sessionKey: string;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onReveal: () => void;
  onSettings: () => void;
  onOpenUrl: (url: string) => void;
}
export function WorkspaceStudio(props: Props) {
  return <WorkspaceSession key={`${props.sessionKey}:${props.desktopId}`} {...props} />;
}

function WorkspaceSession({
  desktopId,
  desktopName,
  workspaceName,
  sessionKey,
  connected,
  onConnect,
  onRefresh,
  onReveal,
  onSettings,
  onOpenUrl,
  tabsTarget = null,
  browserTabs = [],
  sourceTab = null,
  onSourceTab,
  onResearchUrl,
  onSourceViewport,
  onOpenApp,
}: Props) {
  const cacheKey = `${sessionKey}:${desktopId}`;
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("home");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [openTools, setOpenTools] = useState<Set<string>>(new Set());
  const handleToolsOpen = useCallback((path: string, open: boolean) => {
    setOpenTools((current) => {
      if (current.has(path) === open) return current;
      const next = new Set(current);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);
  const [researchOpen, setResearchOpen] = useState(false);
  const [folder, setFolder] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [query, setQuery] = useState("");
  const [newMenu, setNewMenu] = useState(false);
  const [folderMenuPath, setFolderMenuPath] = useState<string | null>(null);
  const [folderDetailsPath, setFolderDetailsPath] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<NewEntryKind | null>(null);
  const [newName, setNewName] = useState("");
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => sessions.get(cacheKey) ?? []);
  const tabsRef = useRef(tabs);
  const [activePath, setActivePath] = useState<string | null>(
    tabs[0]?.document.relativePath ?? null,
  );
  const [besidePath, setBesidePath] = useState<string | null>(null);
  const [chooseBeside, setChooseBeside] = useState(false);
  const [savingPaths, setSavingPaths] = useState<Set<string>>(
    pendingSaves.get(cacheKey) ?? new Set(),
  );
  const savingRef = useRef(pendingSaves.get(cacheKey) ?? new Set<string>());
  pendingSaves.set(cacheKey, savingRef.current);
  const openingRef = useRef(new Set<string>());
  const mounted = useRef(true);
  const indexing = useRef<AbortController | null>(null);
  const [creating, setCreating] = useState(false);
  const [capture, setCapture] = useState("");
  const [captureBusy, setCaptureBusy] = useState(false);
  const [reloadPath, setReloadPath] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<WorkspaceDirectoryEntry | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(pendingRenames.has(cacheKey));
  const renameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renameTarget) {
      renameInput.current?.focus();
      renameInput.current?.select();
      renameInput.current?.scrollIntoView({ block: "nearest" });
    }
  }, [renameTarget]);
  useEffect(() => {
    const closeFolderPopovers = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFolderMenuPath(null);
      setFolderDetailsPath(null);
    };
    window.addEventListener("keydown", closeFolderPopovers);
    return () => window.removeEventListener("keydown", closeFolderPopovers);
  }, []);

  const updateTabs = useCallback(
    (update: (current: WorkspaceTab[]) => WorkspaceTab[]) => {
      const next = update(sessions.get(cacheKey) ?? tabsRef.current);
      tabsRef.current = next;
      sessions.set(cacheKey, next);
      for (const listener of sessionListeners) listener();
      if (mounted.current) setTabs(next);
    },
    [cacheKey],
  );
  const refresh = useCallback(async () => {
    if (!connected) return;
    indexing.current?.abort();
    const controller = new AbortController();
    indexing.current = controller;
    setLoading(true);
    try {
      const result = await loadWorkspaceIndex(
        window.lattice.localWorkspace,
        desktopId,
        controller.signal,
      );
      if (!controller.signal.aborted && mounted.current) setIndex(result);
    } catch (error) {
      if (!controller.signal.aborted && mounted.current)
        setMessage(
          workspaceErrorMessage(
            error,
            "Unable to read the workspace. Check the local folder connection in Settings.",
          ),
        );
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }, [connected, desktopId]);
  useEffect(() => {
    mounted.current = true;
    const synchronize = () => {
      const current = sessions.get(cacheKey);
      if (current) {
        tabsRef.current = current;
        setTabs(current);
      }
      setSavingPaths(new Set(savingRef.current));
      setRenaming(pendingRenames.has(cacheKey));
    };
    sessionListeners.add(synchronize);
    void refresh();
    const protectDrafts = (event: BeforeUnloadEvent) => {
      if (tabsRef.current.some((tab) => tab.draft !== tab.document.content)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protectDrafts);
    return () => {
      sessionListeners.delete(synchronize);
      mounted.current = false;
      indexing.current?.abort();
      window.removeEventListener("beforeunload", protectDrafts);
    };
  }, [refresh, cacheKey]);
  useEffect(() => {
    if (!renaming) void refresh();
  }, [renaming, refresh]);

  const entries = index?.entries ?? [];
  const rootFolderRoles = index?.directories[""]?.areaFolders;
  const preferredRootFolders = (["Files", "Inbox", "Notes", "Planner"] as const)
    .map((role) => rootFolderRoles?.[role])
    .filter((name): name is string => Boolean(name));
  const rootFolderRank = (entry: WorkspaceDirectoryEntry) => {
    const rank = preferredRootFolders.indexOf(entry.name);
    return rank < 0 ? preferredRootFolders.length : rank;
  };
  const rootFolders = [...(index?.directories[""]?.entries ?? [])]
    .filter((entry) => entry.kind === "folder")
    .sort((a, b) => rootFolderRank(a) - rootFolderRank(b));
  const directoryEntries = (relativePath: string) => {
    const current = index?.directories[relativePath]?.entries ?? [];
    return relativePath
      ? current
      : [...current].sort((a, b) => rootFolderRank(a) - rootFolderRank(b));
  };
  const inboxFolder = index?.directories[""]?.areaFolders?.Inbox ?? "Inbox";
  const files = entries
    .filter((entry) => entry.kind === "file")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeTab = tabs.find((tab) => tab.document.relativePath === activePath) ?? null;
  const besideTab = tabs.find((tab) => tab.document.relativePath === besidePath) ?? null;
  const calmNote = view === "files" && Boolean(activeTab);
  const currentFolder = calmNote ? (activePath?.split("/").slice(0, -1).join("/") ?? "") : folder;
  const documents = useMemo(
    () => ({
      ...index?.documents,
      ...Object.fromEntries(
        tabs.map((tab) => [tab.document.relativePath, { ...tab.document, content: tab.draft }]),
      ),
    }),
    [index, tabs],
  );

  const openFilesDashboard = () => {
    setView("home");
    setFolder("");
    setActivePath(null);
    setQuery("");
    setFolderMenuPath(null);
    setFolderDetailsPath(null);
  };

  const openFolder = async (relativePath: string, navigate = true) => {
    if (navigate) {
      setFolder(relativePath);
      setActivePath(null);
      setView("files");
    }
    setExpanded((current) => new Set([...current, relativePath]));
    if (index?.directories[relativePath]) return;
    try {
      const listing = await window.lattice.localWorkspace.listDirectory({
        desktopId,
        relativePath,
      });
      if (!mounted.current) return;
      setIndex((current) =>
        current
          ? {
              ...current,
              directories: { ...current.directories, [relativePath]: listing },
              entries: [
                ...current.entries.filter(
                  (entry) =>
                    !listing.entries.some((item) => item.relativePath === entry.relativePath),
                ),
                ...listing.entries,
              ],
            }
          : {
              directories: { [relativePath]: listing },
              entries: listing.entries,
              documents: {},
              partial: true,
            },
      );
    } catch {
      if (mounted.current)
        setMessage("This folder could not be opened. Refresh to check for external changes.");
    }
  };
  const openEntry = async (entry: WorkspaceDirectoryEntry, beside = false) => {
    if (entry.kind === "folder") {
      await openFolder(entry.relativePath);
      return;
    }
    if (entry.fileType === "other") {
      setMessage(
        "Coach currently edits .md, .text, and .coach. This file stays in your folder; use Explorer for other formats.",
      );
      return;
    }
    if (openingRef.current.has(entry.relativePath)) return;
    setMessage("");
    try {
      if (!tabsRef.current.some((tab) => tab.document.relativePath === entry.relativePath)) {
        if (tabsRef.current.length + openingRef.current.size >= 12) {
          setMessage("Close a saved tab before opening more than 12 files.");
          return;
        }
        openingRef.current.add(entry.relativePath);
        const document = await window.lattice.localWorkspace.readFile({
          desktopId,
          relativePath: entry.relativePath,
        });
        if (!mounted.current) return;
        updateTabs((current) =>
          current.some((tab) => tab.document.relativePath === entry.relativePath)
            ? current
            : [...current, { document, draft: document.content, history: [] }],
        );
      }
      if (beside && entry.relativePath !== activePath) setBesidePath(entry.relativePath);
      else {
        setActivePath(entry.relativePath);
        setConnectionsOpen(false);
        if (view !== "files") {
          setBesidePath(null);
          setResearchOpen(false);
        }
        if (entry.relativePath === besidePath) setBesidePath(null);
      }
      setChooseBeside(false);
      setView("files");
    } catch (error) {
      if (mounted.current)
        setMessage(
          workspaceErrorMessage(
            error,
            "Unable to open this file. Refresh to check whether it is still available.",
          ),
        );
    } finally {
      openingRef.current.delete(entry.relativePath);
    }
  };
  const handleLink = (target: string, source: string) => {
    const resolved = resolveNoteReference(target, source, entries);
    if (resolved.kind === "file") void openEntry(resolved.entry);
    else if (resolved.kind === "url") {
      if (onResearchUrl) {
        setResearchOpen(true);
        void onResearchUrl(resolved.url).catch(() =>
          setMessage("This source could not be opened."),
        );
      } else onOpenUrl(resolved.url);
    } else
      setMessage(
        resolved.kind === "blocked"
          ? "Blocked reference: only desktop-relative files and HTTPS sources can be opened."
          : resolved.kind === "anchor"
            ? "This is an in-document heading reference. Find the heading in the note preview."
            : resolved.kind === "ambiguous"
              ? "More than one file matches. Edit the link to include its folder."
              : "Target not found in the indexed files. Refresh, then check the spelling and folder. Edit the source explicitly to repair it; Coach has changed nothing.",
      );
  };
  const save = useCallback(
    async (relativePath: string) => {
      const tab = tabsRef.current.find((item) => item.document.relativePath === relativePath);
      if (
        !tab ||
        tab.draft === tab.document.content ||
        savingRef.current.has(relativePath) ||
        pendingRenames.has(cacheKey)
      )
        return;
      savingRef.current.add(relativePath);
      for (const listener of sessionListeners) listener();
      setSavingPaths(new Set(savingRef.current));
      const submitted = tab.draft;
      try {
        const saved = await window.lattice.localWorkspace.saveFile({
          desktopId,
          relativePath,
          content: submitted,
          expectedUpdatedAt: tab.document.updatedAt,
        });
        updateTabs((current) =>
          current.map((item) =>
            item.document.relativePath === relativePath
              ? acceptSavedDocument(item, saved, submitted)
              : item,
          ),
        );
        if (mounted.current) {
          // The document toolbar already announces saved/dirty state. Keep notices
          // for actionable errors and explicit operations, not a second success banner.
          setMessage("");
          onRefresh();
          void refresh();
        }
      } catch (error) {
        if (mounted.current)
          setMessage(
            workspaceErrorMessage(
              error,
              "Save failed. Your draft is still open. Check the folder connection and file permissions before retrying.",
            ),
          );
      } finally {
        savingRef.current.delete(relativePath);
        for (const listener of sessionListeners) listener();
        if (mounted.current) setSavingPaths(new Set(savingRef.current));
      }
    },
    [desktopId, onRefresh, refresh, updateTabs, cacheKey],
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && activePath) {
        event.preventDefault();
        const focusedFile =
          event.target instanceof Element
            ? event.target.closest("[data-workspace-file]")?.getAttribute("data-workspace-file")
            : null;
        void save(focusedFile ?? activePath);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [activePath, save]);
  useEffect(() => {
    if (renaming) return;
    const timers = tabs
      .filter(
        (tab) =>
          tab.draft !== tab.document.content && !savingRef.current.has(tab.document.relativePath),
      )
      .map((tab) => window.setTimeout(() => void save(tab.document.relativePath), 600));
    return () =>
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
  }, [tabs, renaming, save]);
  const createEntry = async (
    requestedKind: NewEntryKind | null = newKind,
    requestedName = newName,
    allocateAvailableName = false,
  ) => {
    if (!requestedKind || !requestedName.trim() || creating || pendingRenames.has(cacheKey)) return;
    setCreating(true);
    const name = requestedName.trim();
    const kind = requestedKind;
    const existingIds = new Set(index?.directories[folder]?.entries.map((entry) => entry.id) ?? []);
    try {
      const result = await window.lattice.localWorkspace.createEntry({
        desktopId,
        parentPath: folder,
        name,
        kind: kind === "folder" ? "folder" : "file",
        fileType:
          kind === "folder" ? undefined : kind === "board" || kind === "planner" ? "coach" : kind,
        coachKind: kind === "board" || kind === "planner" ? kind : undefined,
        allocateAvailableName,
      });
      if (!mounted.current) return;
      const extension =
        kind === "board" || kind === "planner" || kind === "coach"
          ? ".coach"
          : kind === "markdown"
            ? ".md"
            : ".text";
      const exact =
        kind === "folder" || name.toLowerCase().endsWith(extension) ? name : name + extension;
      const created = allocateAvailableName
        ? result.entries.find((entry) => !existingIds.has(entry.id))
        : result.entries.find((entry) => entry.name.toLowerCase() === exact.toLowerCase());
      setNewKind(null);
      setNewName("");
      onRefresh();
      await refresh();
      if (created && mounted.current) await openEntry(created);
    } catch (error) {
      if (mounted.current)
        setMessage(
          workspaceErrorMessage(
            error,
            "Could not create the item. Check the destination folder and file permissions.",
          ),
        );
    } finally {
      if (mounted.current) setCreating(false);
    }
  };
  const captureNote = async (fromBrowser = false) => {
    if (captureBusy || pendingRenames.has(cacheKey)) return;
    setCaptureBusy(true);
    try {
      let title = capture.trim().slice(0, 120);
      let content = capture.trim();
      if (fromBrowser) {
        const snapshot = await window.lattice.browser.snapshot();
        const tab = snapshot.tabs.find((item) => item.id === snapshot.activeTabId);
        if (!tab?.url.startsWith("https://"))
          throw new Error("Open an HTTPS website first, then capture its source here.");
        title = (tab.title || "Browser source").slice(0, 120);
        content = `[${title.replace(/[[\]]/g, "")}](${tab.url})\n\nCaptured from the active browser tab. Add your own notes here.`;
      }
      if (!content) return;
      await window.lattice.localWorkspace.captureInbox({ desktopId, title, content, kind: "note" });
      if (mounted.current) {
        setCapture("");
        setMessage("Captured in this desktop’s Inbox.");
        onRefresh();
        await refresh();
      }
    } catch (error) {
      if (mounted.current)
        setMessage(
          workspaceErrorMessage(
            error,
            "Capture failed. Check the local folder connection in Settings.",
          ),
        );
    } finally {
      if (mounted.current) setCaptureBusy(false);
    }
  };
  const closeTab = (relativePath: string) => {
    const tab = tabsRef.current.find((item) => item.document.relativePath === relativePath);
    if (tab && (tab.draft !== tab.document.content || savingRef.current.has(relativePath))) {
      if (tab.draft !== tab.document.content) void save(relativePath);
      setMessage(
        "Saving this note before it closes. Try closing it again when Saved locally appears.",
      );
      return;
    }
    updateTabs((current) => current.filter((item) => item.document.relativePath !== relativePath));
    if (activePath === relativePath)
      setActivePath(tabsRef.current[0]?.document.relativePath ?? null);
    if (besidePath === relativePath) setBesidePath(null);
  };
  const startRename = (entry: WorkspaceDirectoryEntry) => {
    if (entry.kind !== "folder") return;
    setFolderMenuPath(null);
    setFolderDetailsPath(null);
    setRenameTarget(entry);
    setRenameTitle(workspaceTitle(entry.name, entry.kind));
    setRenameError("");
    setNewMenu(false);
  };
  const renameEntryTo = async (
    source: WorkspaceDirectoryEntry,
    nextTitle: string,
  ): Promise<string | null> => {
    if (!nextTitle.trim() || pendingRenames.has(cacheKey)) return "Wait for the current rename.";
    const sessionSuffix = cacheKey.slice(cacheKey.indexOf(":"));
    const related = [...new Set([cacheKey, ...sessions.keys()])].filter((key) =>
      key.endsWith(sessionSuffix),
    );
    if (
      creating ||
      captureBusy ||
      openingRef.current.size ||
      related.some((key) => pendingSaves.get(key)?.size)
    ) {
      return "Wait for the current file operation to finish, then rename.";
    }
    const suffix =
      source.kind === "file" ? source.name.slice(workspaceTitle(source.name).length) : "";
    for (const key of related) pendingRenames.add(key);
    setRenaming(true);
    setRenameError("");
    try {
      const result = await window.lattice.localWorkspace.renameEntry({
        desktopId,
        relativePath: source.relativePath,
        kind: source.kind,
        newName: nextTitle.trim() + suffix,
        expectedUpdatedAt:
          source.kind === "file"
            ? (tabsRef.current.find((tab) => tab.document.relativePath === source.relativePath)
                ?.document.updatedAt ?? source.updatedAt)
            : source.updatedAt,
      });
      for (const key of related)
        sessions.set(
          key,
          renameWorkspaceTabs(sessions.get(key) ?? [], result.fromPath, result.toPath),
        );
      updateTabs((current) => renameWorkspaceTabs(current, result.fromPath, result.toPath));
      if (mounted.current) {
        const remap = (value: string) =>
          renamedWorkspacePath(value, result.fromPath, result.toPath);
        setActivePath((value) => (value ? remap(value) : value));
        setBesidePath((value) => (value ? remap(value) : value));
        setFolder(remap);
        setExpanded((current) => new Set([...current].map(remap)));
        setRenameTarget(null);
        setReloadPath(null);
        setMessage("");
        onRefresh();
      }
      return null;
    } catch (error) {
      return workspaceErrorMessage(
        error,
        "Could not rename this item. Refresh and check the folder connection. Your draft is still retained.",
      );
    } finally {
      for (const key of related) pendingRenames.delete(key);
      for (const listener of sessionListeners) listener();
      if (mounted.current) setRenaming(false);
    }
  };
  const renameEntry = async () => {
    if (!renameTarget) return;
    setRenameError("");
    const error = await renameEntryTo(renameTarget, renameTitle);
    if (error && mounted.current) setRenameError(error);
  };
  const reload = async () => {
    if (!reloadPath) return;
    try {
      const document = await window.lattice.localWorkspace.readFile({
        desktopId,
        relativePath: reloadPath,
      });
      updateTabs((current) =>
        current.map((tab) =>
          tab.document.relativePath === reloadPath
            ? { ...tab, document, draft: document.content }
            : tab,
        ),
      );
      if (mounted.current) {
        setReloadPath(null);
        setMessage("Reloaded the saved file. The discarded draft was not written to disk.");
      }
    } catch {
      if (mounted.current) setMessage("Could not reload. Your draft is unchanged.");
    }
  };
  const handleTreeNavigation = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    entry: WorkspaceDirectoryEntry,
    canExpand: boolean,
  ) => {
    const visibleEntries = [
      ...document.querySelectorAll<HTMLButtonElement>(".ws-tree [data-workspace-entry]"),
    ].filter((button) => button.getClientRects().length > 0);
    const currentIndex = visibleEntries.indexOf(event.currentTarget);
    const focusAt = (index: number) => visibleEntries.at(index)?.focus();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(Math.min(visibleEntries.length - 1, currentIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(Math.max(0, currentIndex - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(visibleEntries.length - 1);
    } else if (event.key === "ArrowRight" && entry.kind === "folder" && canExpand) {
      event.preventDefault();
      if (expanded.has(entry.relativePath)) focusAt(currentIndex + 1);
      else void openFolder(entry.relativePath, false);
    } else if (event.key === "ArrowLeft") {
      const isExpanded = entry.kind === "folder" && expanded.has(entry.relativePath);
      const parentPath = entry.relativePath.split("/").slice(0, -1).join("/");
      const parent = parentPath
        ? document.querySelector<HTMLButtonElement>(
            `.ws-tree [data-workspace-path="${CSS.escape(parentPath)}"]`,
          )
        : null;
      if (!isExpanded && !parent) return;
      event.preventDefault();
      if (isExpanded)
        setExpanded(
          (current) => new Set([...current].filter((value) => value !== entry.relativePath)),
        );
      else parent?.focus();
    }
  };
  const tree = (relativePath: string, depth = 0): ReactNode =>
    depth > 24 ? null : (
      <ul className="ws-tree-list">
        {directoryEntries(relativePath).map((entry) => {
          const counts =
            entry.kind === "folder" && index
              ? workspaceFolderCounts(index, entry.relativePath)
              : null;
          const displayCount = (value: number, complete: boolean) =>
            `${value}${complete ? "" : "+"}`;
          const hasKnownChildren = Boolean(counts && counts.directFiles + counts.directFolders > 0);
          const canExpand = Boolean(counts && (!counts.directComplete || hasKnownChildren));
          const summary = counts
            ? [
                counts.directFiles
                  ? `${displayCount(counts.directFiles, counts.directComplete)} ${counts.directFiles === 1 ? "file" : "files"}`
                  : "",
                counts.directFolders
                  ? `${displayCount(counts.directFolders, counts.directComplete)} ${counts.directFolders === 1 ? "folder" : "folders"}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : "";
          return (
            <li
              key={entry.id}
              className="ws-tree-item"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFolderMenuPath(null);
              }}
            >
              <div
                className={`ws-tree-row ${activePath === entry.relativePath ? "is-active" : ""} ${folder === entry.relativePath ? "is-folder" : ""}`}
              >
                {entry.kind === "folder" && canExpand ? (
                  <button
                    type="button"
                    className="ws-tree-toggle"
                    tabIndex={-1}
                    aria-label={`${expanded.has(entry.relativePath) ? "Collapse" : "Expand"} ${entry.name}`}
                    aria-expanded={expanded.has(entry.relativePath)}
                    onClick={() => {
                      if (expanded.has(entry.relativePath))
                        setExpanded(
                          (current) =>
                            new Set([...current].filter((value) => value !== entry.relativePath)),
                        );
                      else void openFolder(entry.relativePath, false);
                    }}
                  >
                    <Icon
                      name={expanded.has(entry.relativePath) ? "chevron-down" : "arrow-right"}
                    />
                  </button>
                ) : (
                  <span className="ws-tree-spacer" />
                )}
                <span className="ws-tree-entry-block">
                  <button
                    type="button"
                    data-workspace-entry={entry.kind}
                    data-workspace-path={entry.relativePath}
                    onClick={() => void openEntry(entry)}
                    onKeyDown={(event) => handleTreeNavigation(event, entry, canExpand)}
                    aria-label={`Open ${workspaceEntryTitle(entry)}`}
                    aria-expanded={
                      entry.kind === "folder" && canExpand
                        ? expanded.has(entry.relativePath)
                        : undefined
                    }
                    title={entry.name}
                  >
                    <Icon name={entry.kind === "folder" ? "folder" : "file"} />
                    <span className="ws-tree-entry-title">{workspaceEntryTitle(entry)}</span>
                  </button>
                  {counts && summary && (
                    <button
                      type="button"
                      className="ws-tree-summary"
                      aria-label={`Show contents details for ${workspaceEntryTitle(entry)}: ${summary} directly inside`}
                      aria-expanded={folderDetailsPath === entry.relativePath}
                      onClick={() => {
                        setFolderMenuPath(null);
                        setFolderDetailsPath(
                          folderDetailsPath === entry.relativePath ? null : entry.relativePath,
                        );
                      }}
                    >
                      {summary}
                    </button>
                  )}
                </span>
                {entry.kind === "folder" && (
                  <button
                    type="button"
                    className="ws-folder-more"
                    aria-label={`More actions for folder ${workspaceDisplayName(entry.name, entry.kind)}`}
                    aria-expanded={folderMenuPath === entry.relativePath}
                    onClick={() => {
                      setFolderDetailsPath(null);
                      setFolderMenuPath(
                        folderMenuPath === entry.relativePath ? null : entry.relativePath,
                      );
                    }}
                  >
                    <Icon name="more" />
                  </button>
                )}
              </div>
              {entry.kind === "folder" && folderMenuPath === entry.relativePath && (
                <fieldset className="ws-folder-menu">
                  <legend className="sr-only">Actions for {entry.name}</legend>
                  <button type="button" onClick={() => startRename(entry)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFolderMenuPath(null);
                      setFolderDetailsPath(entry.relativePath);
                    }}
                  >
                    Folder details
                  </button>
                </fieldset>
              )}
              {entry.kind === "folder" && counts && folderDetailsPath === entry.relativePath && (
                <section className="ws-folder-details" aria-label={`${entry.name} contents`}>
                  <header>
                    <strong>{workspaceEntryTitle(entry)} — Contents</strong>
                    <button
                      type="button"
                      aria-label="Close folder details"
                      onClick={() => setFolderDetailsPath(null)}
                    >
                      <Icon name="close" />
                    </button>
                  </header>
                  {counts.totalComplete && counts.totalFiles + counts.totalFolders === 0 ? (
                    <p>Empty</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th>Files</th>
                          <th>Folders</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Directly inside</td>
                          <td>{displayCount(counts.directFiles, counts.directComplete)}</td>
                          <td>{displayCount(counts.directFolders, counts.directComplete)}</td>
                        </tr>
                        <tr>
                          <td>Deeper in subfolders</td>
                          <td>
                            {displayCount(
                              Math.max(0, counts.totalFiles - counts.directFiles),
                              counts.totalComplete,
                            )}
                          </td>
                          <td>
                            {displayCount(
                              Math.max(0, counts.totalFolders - counts.directFolders),
                              counts.totalComplete,
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <strong>Total</strong>
                          </td>
                          <td>
                            <strong>{displayCount(counts.totalFiles, counts.totalComplete)}</strong>
                          </td>
                          <td>
                            <strong>
                              {displayCount(counts.totalFolders, counts.totalComplete)}
                            </strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </section>
              )}
              {entry.kind === "folder" &&
                canExpand &&
                expanded.has(entry.relativePath) &&
                tree(entry.relativePath, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  const contentReferences = (content: string, fileType: string) => {
    if (fileType !== "coach") return noteReferences(content);
    const object = parseCoachObject(content);
    return [
      ...noteReferences(String(object?.content ?? "")),
      ...(isCoachBoard(object)
        ? object.cards
            .filter((card) => card.note)
            .map((card) => ({ target: card.note ?? "", label: card.title }))
        : []),
    ];
  };
  const references = activeTab
    ? contentReferences(activeTab.draft, activeTab.document.fileType)
    : [];
  const incoming = activePath
    ? Object.values(documents).filter(
        (document) =>
          document.relativePath !== activePath &&
          contentReferences(document.content, document.fileType).some((reference) => {
            const resolved = resolveNoteReference(reference.target, document.relativePath, entries);
            return resolved.kind === "file" && resolved.entry.relativePath === activePath;
          }),
      )
    : [];
  const renderEmbed = (target: string, source: string) => {
    const resolved = resolveNoteReference(target, source, entries);
    const object =
      resolved.kind === "file"
        ? parseCoachObject(documents[resolved.entry.relativePath]?.content ?? "")
        : null;
    if (resolved.kind !== "file" || !isCoachBoard(object))
      return (
        <p className="ws-embed-missing">
          Board preview unavailable.{" "}
          <button type="button" onClick={() => handleLink(target, source)}>
            Review reference
          </button>
        </p>
      );
    return (
      <section className="ws-board-embed" aria-label={`Embedded board ${object.title}`}>
        <header>
          <strong>
            <Icon name="grid" /> {object.title}
          </strong>
          <button type="button" onClick={() => void openEntry(resolved.entry, true)}>
            Edit board beside <Icon name="arrow-right" />
          </button>
        </header>
        <div className="ws-mini-board">
          {object.columns.slice(0, 3).map((column) => (
            <div key={column.id}>
              <b>{column.title}</b>
              {object.cards
                .filter((card) => card.columnId === column.id)
                .slice(0, 3)
                .map((card) => (
                  <span key={card.id}>{card.title}</span>
                ))}
            </div>
          ))}
        </div>
        <small>Linked local file · edits are saved in its own editor</small>
      </section>
    );
  };
  const documentPane = (tab: WorkspaceTab) => (
    <WorkspaceDocument
      key={tab.document.relativePath}
      tab={tab}
      saving={savingPaths.has(tab.document.relativePath)}
      toolbarTarget={tab.document.relativePath === activePath ? toolbarTarget : null}
      disabled={renaming}
      onToolsOpen={handleToolsOpen}
      onRefresh={() => {
        onRefresh();
        void refresh();
      }}
      onReveal={onReveal}
      onConnections={
        tab.document.relativePath === activePath
          ? () => setConnectionsOpen((current) => !current)
          : undefined
      }
      onEmbed={(target) => renderEmbed(target, tab.document.relativePath)}
      onResearch={() => setResearchOpen((current) => !current)}
      onChange={(draft) =>
        updateTabs((current) =>
          current.map((item) =>
            item.document.relativePath === tab.document.relativePath ? { ...item, draft } : item,
          ),
        )
      }
      onLink={(target) => handleLink(target, tab.document.relativePath)}
      onSplit={() => setChooseBeside(true)}
      onReload={() => setReloadPath(tab.document.relativePath)}
      onRenameTitle={(title) =>
        renameEntryTo(
          {
            ...tab.document,
            id: tab.document.relativePath,
            kind: "file",
            size: tab.draft.length,
          },
          title,
        )
      }
    />
  );

  const canInsertSource = Boolean(
    activeTab &&
      (activeTab.document.fileType === "markdown" ||
        activeTab.document.fileType === "text" ||
        (parseCoachObject(activeTab.draft)?.kind === "document" &&
          typeof parseCoachObject(activeTab.draft)?.content === "string")),
  );
  const insertSource = (source: BrowserSourceCapture) => {
    if (!activeTab || !canInsertSource || pendingRenames.has(cacheKey)) return;
    const selectedPath = activeTab.document.relativePath;
    updateTabs((current) =>
      current.map((tab) => {
        if (tab.document.relativePath !== selectedPath) return tab;
        const object = parseCoachObject(tab.draft);
        const snippet = sourceMarkdown(source);
        const draft =
          tab.document.fileType === "coach" && object?.kind === "document"
            ? writeCoachObject({ ...object, content: `${object.content}\n\n${snippet}` })
            : `${tab.draft}\n\n${tab.document.fileType === "text" ? `${source.text}\nSource: ${source.url}\n` : snippet}`;
        return { ...tab, draft };
      }),
    );
    setMessage("Source added to your draft with its URL. Choose Save to keep it on disk.");
  };
  const fileTabs = (
    <nav className="ws-tabs" aria-label="Open workspace files">
      {tabs.map((tab) => (
        <div
          className={view === "files" && activePath === tab.document.relativePath ? "active" : ""}
          key={tab.document.relativePath}
        >
          <button
            type="button"
            disabled={renaming}
            onClick={() => {
              setView("files");
              setActivePath(tab.document.relativePath);
              if (besidePath === tab.document.relativePath) setBesidePath(null);
            }}
          >
            <Icon name={tab.document.fileType === "coach" ? "grid" : "file"} />
            {workspaceDocumentTitle(tab.document, tab.draft)}
            {tab.draft !== tab.document.content && <b title="Unsaved changes">•</b>}
          </button>
          <button
            type="button"
            aria-label={`Close ${workspaceDocumentTitle(tab.document, tab.draft)}`}
            disabled={renaming}
            onClick={() => closeTab(tab.document.relativePath)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </nav>
  );
  if (!connected)
    return (
      <div className="trusted-surface ws-disconnected">
        <Icon name="folder" />
        <h1>Give {desktopName} a local home</h1>
        <p>Your folders, notes, and Coach objects stay on your computer.</p>
        <button type="button" className="primary-action" onClick={onConnect}>
          Connect local folder
        </button>
        <small>Existing files are never moved or deleted.</small>
      </div>
    );
  return (
    <div
      className="trusted-surface ws-studio ws-vision"
      data-workspace-browser
      data-desktop-id={desktopId}
      data-view={view}
      data-calm-note={calmNote}
    >
      {tabsTarget && <WorkspacePortal target={tabsTarget}>{fileTabs}</WorkspacePortal>}
      <header className="ws-header">
        {calmNote ? (
          <nav className="ws-calm-location" aria-label="Current folder">
            <button type="button" onClick={() => setView("home")}>
              {desktopName}
            </button>
            {currentFolder
              .split("/")
              .filter(Boolean)
              .map((part, i, parts) => (
                <span key={parts.slice(0, i + 1).join("/")}>
                  {" "}
                  /{" "}
                  <button
                    type="button"
                    onClick={() => void openFolder(parts.slice(0, i + 1).join("/"))}
                  >
                    {part}
                  </button>
                </span>
              ))}
          </nav>
        ) : (
          <div>
            <h1>Files &amp; Inbox: {desktopName}</h1>
            <span className="ws-local-badge">
              <span />
              Local only
            </span>
          </div>
        )}
        <div className="ws-header-actions">
          {calmNote && <div className="ws-toolbar-slot" ref={setToolbarTarget} />}
          {!calmNote && (
            <>
              <button type="button" onClick={onReveal}>
                <Icon name="folder" />
                Open in Explorer
              </button>
              <label className="ws-search ws-header-search">
                <Icon name="search" />
                <input
                  aria-label="Find a file or folder"
                  value={query}
                  placeholder="Find a file or folder…"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (event.target.value) setView("recent");
                  }}
                />
              </label>
              <button
                type="button"
                className="primary-action"
                aria-expanded={newMenu}
                disabled={renaming}
                onClick={() => setNewMenu(!newMenu)}
              >
                <Icon name="plus" />
                New
                <Icon name="chevron-down" />
              </button>
            </>
          )}
        </div>
      </header>
      {newMenu && (
        <div className="ws-new-menu">
          <small>Create in {folder || desktopName}</small>
          {(
            [
              ["folder", "Folder"],
              ["markdown", "Markdown note"],
              ["text", "Text file"],
              ["coach", "Coach document"],
              ["board", "Coach board"],
              ["planner", "Planner"],
            ] as const
          ).map(([kind, label]) => (
            <button
              type="button"
              key={kind}
              onClick={() => {
                if (kind === "markdown") {
                  setNewMenu(false);
                  void createEntry("markdown", "Untitled", true);
                  return;
                }
                setNewKind(kind);
                setNewName("");
                setNewMenu(false);
              }}
            >
              <Icon
                name={
                  kind === "folder"
                    ? "folder"
                    : kind === "markdown" || kind === "text"
                      ? "file"
                      : "grid"
                }
              />
              {label}
            </button>
          ))}
        </div>
      )}
      {message && (
        <div className="ws-notice" role="status">
          {message}
          <button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {newKind && (
        <form
          className="ws-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createEntry();
          }}
        >
          <label>
            New {newKind} in <strong>{folder || desktopName}</strong>
            <input
              aria-label="New item name"
              value={newName}
              maxLength={120}
              placeholder={newKind === "board" ? "Launch board" : "Untitled"}
              onChange={(event) => setNewName(event.target.value)}
            />
          </label>
          <button type="submit" className="primary-action" disabled={!newName.trim() || creating}>
            {creating ? "Creating…" : "Create"}
          </button>
          <button type="button" disabled={creating} onClick={() => setNewKind(null)}>
            Cancel
          </button>
        </form>
      )}
      {renameTarget && (
        <form
          className="ws-rename-form"
          aria-label={`Rename ${renameTarget.kind}`}
          onSubmit={(event) => {
            event.preventDefault();
            void renameEntry();
          }}
        >
          <strong>Rename {renameTarget.kind}</strong>
          <label>
            New name
            <span className="ws-rename-input">
              <input
                aria-label="New title"
                ref={renameInput}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !renaming) setRenameTarget(null);
                }}
                value={renameTitle}
                maxLength={120}
                disabled={renaming}
                onChange={(event) => setRenameTitle(event.target.value)}
              />
              {renameTarget.kind === "file" && (
                <span>{renameTarget.name.slice(workspaceTitle(renameTarget.name).length)}</span>
              )}
            </span>
          </label>
          <p>
            Renames this item in the local folder. Contents, internal note/object titles, and links
            are not rewritten. Existing links may need a manual update.
          </p>
          {renameError && <p role="alert">{renameError}</p>}
          <div>
            <button
              type="submit"
              className="primary-action"
              disabled={renaming || !renameTitle.trim()}
            >
              {renaming ? "Renaming…" : "Rename"}
            </button>
            <button type="button" disabled={renaming} onClick={() => setRenameTarget(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {reloadPath && !renaming && (
        <div className="ws-notice" role="alert">
          <span>Reloading discards this open draft. The saved file is not changed.</span>
          <button type="button" onClick={() => void reload()}>
            Discard draft and reload
          </button>
          <button type="button" onClick={() => setReloadPath(null)}>
            Keep editing
          </button>
        </div>
      )}
      <fieldset className="ws-body" disabled={renaming}>
        <WorkspacePortal target={null}>
          <fieldset className="ws-sidebar-surface" disabled={renaming}>
            <aside className="ws-tree" aria-label="Files and folders">
              <header>
                <button type="button" onClick={openFilesDashboard}>
                  <Icon name="folder" />
                  {desktopName}
                </button>
                <button
                  type="button"
                  aria-label="New folder in current location"
                  onClick={() => setNewKind("folder")}
                >
                  <Icon name="plus" />
                </button>
              </header>
              <small className="ws-folder-location">Create in: {folder || "Desktop root"}</small>
              {tree("")}
              {loading && !index && <p className="ws-muted">Reading local files…</p>}
              <footer>
                <span className="ws-saved">
                  <Icon name="check" />
                  Local folder connected
                </span>
                <strong>{workspaceName}</strong>
                <button type="button" className="ws-text-action" onClick={onSettings}>
                  Files settings
                </button>
              </footer>
            </aside>
          </fieldset>
        </WorkspacePortal>
        <div className="ws-main">
          {view === "home" && (
            <WorkspaceHome
              files={files}
              folders={rootFolders}
              onFolder={(entry) => void openEntry(entry)}
              onNewFolder={() => {
                setFolder("");
                setNewKind("folder");
              }}
              onFocus={() => onOpenApp?.("pomodoro")}
              inboxFolder={inboxFolder}
              documents={documents}
              capture={capture}
              captureBusy={captureBusy}
              onCaptureChange={setCapture}
              onCapture={(browser) => void captureNote(browser)}
              onOpen={(entry) => void openEntry(entry)}
              onInbox={() => void openFolder(inboxFolder)}
              onNew={(kind) => {
                setFolder("");
                setNewKind(kind);
              }}
              onRecent={() => setView("recent")}
            />
          )}
          {view === "recent" && (
            <section className="ws-recent">
              <h2>{query ? "Find your files" : "Recent files"}</h2>
              <p className="ws-muted">Sorted by when the local file was last edited.</p>
              <WorkspaceFileRows
                entries={files.filter((entry) =>
                  entry.relativePath.toLowerCase().includes(query.toLowerCase()),
                )}
                onOpen={(entry) => void openEntry(entry)}
              />
              {!files.some((entry) =>
                entry.relativePath.toLowerCase().includes(query.toLowerCase()),
              ) && <p className="ws-empty-copy">No matching files in this index.</p>}
            </section>
          )}
          {view === "files" && (
            <div className="ws-editing">
              {!calmNote && (
                <nav className="ws-breadcrumbs" aria-label="Current folder">
                  <button type="button" onClick={() => void openFolder("")}>
                    {desktopName}
                  </button>
                  {folder
                    .split("/")
                    .filter(Boolean)
                    .map((part, i, parts) => (
                      <span key={parts.slice(0, i + 1).join("/")}>
                        {" "}
                        /{" "}
                        <button
                          type="button"
                          onClick={() => void openFolder(parts.slice(0, i + 1).join("/"))}
                        >
                          {part}
                        </button>
                      </span>
                    ))}
                </nav>
              )}
              {!tabsTarget && (!calmNote || tabs.length > 1) && fileTabs}
              {chooseBeside && (
                <div className="ws-split-picker">
                  <strong>Open a file beside this one</strong>
                  <button type="button" onClick={() => setChooseBeside(false)}>
                    Cancel
                  </button>
                  {files
                    .filter(
                      (entry) => entry.fileType !== "other" && entry.relativePath !== activePath,
                    )
                    .map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() => void openEntry(entry, true)}
                      >
                        {entry.relativePath}
                      </button>
                    ))}
                  {files.filter(
                    (entry) => entry.fileType !== "other" && entry.relativePath !== activePath,
                  ).length === 0 && <p>Create another note or board first.</p>}
                </div>
              )}
              {activeTab ? (
                <>
                  <div className={researchOpen ? "ws-desk-with-source" : "ws-desk"}>
                    <div
                      className={`ws-panes ${besideTab && besidePath !== activePath ? "is-split" : ""}`}
                    >
                      {documentPane(activeTab)}
                      {besideTab && besidePath !== activePath && (
                        <div className="ws-beside">
                          <button
                            type="button"
                            className="ws-close-split"
                            onClick={() => setBesidePath(null)}
                          >
                            Close split
                            <Icon name="close" />
                          </button>
                          {documentPane(besideTab)}
                        </div>
                      )}
                    </div>
                    {researchOpen && onSourceTab && onResearchUrl && onSourceViewport && (
                      <WorkspaceSource
                        key={activeTab?.document.relativePath ?? "no-document"}
                        destination={
                          activeTab ? workspaceDisplayName(activeTab.document.name) : null
                        }
                        tabs={browserTabs}
                        active={sourceTab}
                        suspended={
                          renaming ||
                          openTools.size > 0 ||
                          newMenu ||
                          Boolean(newKind || renameTarget || reloadPath || chooseBeside)
                        }
                        canInsert={canInsertSource && !renaming}
                        onSelect={onSourceTab}
                        onNavigate={onResearchUrl}
                        onViewport={onSourceViewport}
                        onInsert={insertSource}
                        onClose={() => setResearchOpen(false)}
                      />
                    )}
                  </div>
                  {connectionsOpen && (
                    <section className="ws-link-context" aria-label="Connections">
                      <header>
                        <h3>
                          Connections · {incoming.length} incoming · {references.length} outgoing
                        </h3>
                        <button type="button" onClick={() => setConnectionsOpen(false)}>
                          Close connections
                        </button>
                      </header>
                      <p className="ws-muted">
                        From indexed notes and boards in this desktop. Refresh after outside edits.
                        Repair links by editing the source; no files are automatically changed.
                      </p>
                      <div className="ws-context-columns">
                        <section>
                          <h3>Backlinks</h3>
                          {incoming.map((document) => (
                            <button
                              type="button"
                              key={document.relativePath}
                              onClick={() => {
                                const entry = entries.find(
                                  (item) => item.relativePath === document.relativePath,
                                );
                                if (entry) void openEntry(entry);
                              }}
                            >
                              {workspaceDocumentTitle(document)}
                            </button>
                          ))}
                          {!incoming.length && (
                            <small>No incoming links found in the indexed files.</small>
                          )}
                        </section>
                        <section>
                          <h3>Outgoing references</h3>
                          {[
                            ...new Map(
                              references.map((reference) => [reference.target, reference]),
                            ).values(),
                          ].map((reference) => {
                            const resolved = resolveNoteReference(
                              reference.target,
                              activePath ?? "",
                              entries,
                            );
                            return (
                              <button
                                type="button"
                                key={reference.target}
                                onClick={() => handleLink(reference.target, activePath ?? "")}
                              >
                                <span>
                                  {resolved.kind === "blocked"
                                    ? "Blocked private or unsafe reference"
                                    : reference.label}
                                </span>
                                <small>
                                  {resolved.kind === "missing"
                                    ? "Not found · review"
                                    : resolved.kind === "ambiguous"
                                      ? "Ambiguous · review"
                                      : resolved.kind === "url"
                                        ? "HTTPS source · not fetched"
                                        : resolved.kind}
                                </small>
                              </button>
                            );
                          })}
                          {!references.length && (
                            <small>Add [[Note name]] to connect this file.</small>
                          )}
                        </section>
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <div className="ws-folder-home">
                  <header className="ws-folder-heading">
                    <div>
                      <h2>
                        {folder ? (
                          <button
                            type="button"
                            className="ws-title-button"
                            aria-label="Rename current folder"
                            onClick={() => {
                              const entry = entries.find((item) => item.relativePath === folder);
                              if (entry) startRename(entry);
                            }}
                          >
                            {folder.split("/").pop()} <Icon name="edit" />
                          </button>
                        ) : (
                          desktopName
                        )}
                      </h2>
                      <p>
                        {index?.directories[folder]?.entries.length ?? 0} items in this location
                      </p>
                    </div>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => setNewMenu(true)}
                    >
                      <Icon name="plus" />
                      New here
                    </button>
                  </header>
                  <div className="ws-folder-list">
                    <div className="ws-folder-list-head" aria-hidden="true">
                      <span>Name</span>
                      <span>Type</span>
                      <span>Modified</span>
                      <span />
                    </div>
                    {index?.directories[folder]?.entries.map((entry) => (
                      <button type="button" key={entry.id} onClick={() => void openEntry(entry)}>
                        <Icon
                          name={
                            entry.kind === "folder"
                              ? "folder"
                              : entry.fileType === "coach"
                                ? "grid"
                                : "file"
                          }
                        />
                        <strong>{workspaceEntryTitle(entry)}</strong>
                        <small>{entry.kind === "folder" ? "Folder" : entry.fileType}</small>
                        <time>
                          {new Date(entry.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                        <Icon name="arrow-right" />
                      </button>
                    ))}
                    {!index?.directories[folder]?.entries.length && (
                      <div className="ws-folder-empty">
                        <Icon name="folder" />
                        <strong>This folder is ready.</strong>
                        <span>Create a note, board, or folder to begin.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {(!calmNote || index?.partial) && (
            <footer className="ws-bottom">
              <span>
                <Icon name="lock" />
                Your files stay on this computer. Notes are never deleted here.
              </span>
              <span>
                {loading
                  ? "Reading local files…"
                  : index?.partial
                    ? "Partial index · larger files and folders may be omitted"
                    : `${files.length} local files`}
              </span>
            </footer>
          )}
        </div>
      </fieldset>
    </div>
  );
}
