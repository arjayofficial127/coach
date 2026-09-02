import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isCoachBoard, parseCoachObject } from "../shared/coach-board";
import type { WorkspaceDirectoryEntry, WorkspaceEditableFileType } from "../shared/contracts";
import { Icon } from "./icon";
import {
  acceptSavedDocument,
  loadWorkspaceIndex,
  noteReferences,
  resolveNoteReference,
  type WorkspaceIndex,
  type WorkspaceTab,
  workspaceErrorMessage,
} from "./local-workspace-model";
import { WorkspaceDocument } from "./workspace-document";
import { WorkspaceFileRows, WorkspaceHome } from "./workspace-home";
import "./workspace-studio.css";

type NewEntryKind = "folder" | "board" | WorkspaceEditableFileType;
type View = "home" | "files" | "recent";
// Session-only copies partitioned by website profile, vault identity, and desktop.
const sessions = new Map<string, WorkspaceTab[]>();
const sessionListeners = new Set<() => void>();
const pendingSaves = new Map<string, Set<string>>();
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
  busy,
  onConnect,
  onRefresh,
  onReveal,
  onSettings,
  onOpenUrl,
}: Props) {
  const cacheKey = `${sessionKey}:${desktopId}`;
  const [index, setIndex] = useState<WorkspaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("home");
  const [folder, setFolder] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [query, setQuery] = useState("");
  const [newMenu, setNewMenu] = useState(false);
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

  const entries = index?.entries ?? [];
  const files = entries
    .filter((entry) => entry.kind === "file")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeTab = tabs.find((tab) => tab.document.relativePath === activePath) ?? null;
  const besideTab = tabs.find((tab) => tab.document.relativePath === besidePath) ?? null;
  const documents = useMemo(
    () => ({
      ...index?.documents,
      ...Object.fromEntries(
        tabs.map((tab) => [tab.document.relativePath, { ...tab.document, content: tab.draft }]),
      ),
    }),
    [index, tabs],
  );

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
    else if (resolved.kind === "url") onOpenUrl(resolved.url);
    else
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
      if (!tab || tab.draft === tab.document.content || savingRef.current.has(relativePath)) return;
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
          setMessage(`Saved ${saved.name} locally.`);
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
    [desktopId, onRefresh, refresh, updateTabs],
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
  const createEntry = async () => {
    if (!newKind || !newName.trim() || creating) return;
    setCreating(true);
    const name = newName.trim();
    const kind = newKind;
    try {
      const result = await window.lattice.localWorkspace.createEntry({
        desktopId,
        parentPath: folder,
        name,
        kind: kind === "folder" ? "folder" : "file",
        fileType: kind === "folder" ? undefined : kind === "board" ? "coach" : kind,
        coachKind: kind === "board" ? "board" : undefined,
      });
      if (!mounted.current) return;
      const extension =
        kind === "board" || kind === "coach" ? ".coach" : kind === "markdown" ? ".md" : ".text";
      const exact =
        kind === "folder" || name.toLowerCase().endsWith(extension) ? name : name + extension;
      const created = result.entries.find(
        (entry) => entry.name.toLowerCase() === exact.toLowerCase(),
      );
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
    if (captureBusy) return;
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
      setMessage("Save before closing, or use Reload saved file to explicitly discard this draft.");
      return;
    }
    updateTabs((current) => current.filter((item) => item.document.relativePath !== relativePath));
    if (activePath === relativePath)
      setActivePath(tabsRef.current[0]?.document.relativePath ?? null);
    if (besidePath === relativePath) setBesidePath(null);
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
  const tree = (relativePath: string, depth = 0): ReactNode =>
    depth > 24 ? null : (
      <ul className="ws-tree-list">
        {index?.directories[relativePath]?.entries.map((entry) => (
          <li key={entry.id}>
            <div
              className={`ws-tree-row ${activePath === entry.relativePath ? "is-active" : ""} ${folder === entry.relativePath ? "is-folder" : ""}`}
            >
              {entry.kind === "folder" ? (
                <button
                  type="button"
                  className="ws-tree-toggle"
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
                  <Icon name={expanded.has(entry.relativePath) ? "chevron-down" : "arrow-right"} />
                </button>
              ) : (
                <span className="ws-tree-spacer" />
              )}
              <button
                type="button"
                data-workspace-entry={entry.kind}
                onClick={() => void openEntry(entry)}
                title={entry.relativePath}
              >
                <Icon
                  name={
                    entry.kind === "folder"
                      ? "folder"
                      : entry.fileType === "coach"
                        ? "grid"
                        : "edit"
                  }
                />
                <span>{entry.name}</span>
              </button>
            </div>
            {entry.kind === "folder" &&
              expanded.has(entry.relativePath) &&
              tree(entry.relativePath, depth + 1)}
          </li>
        ))}
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
  const documentPane = (tab: WorkspaceTab) => (
    <WorkspaceDocument
      key={tab.document.relativePath}
      tab={tab}
      saving={savingPaths.has(tab.document.relativePath)}
      onChange={(draft) =>
        updateTabs((current) =>
          current.map((item) =>
            item.document.relativePath === tab.document.relativePath ? { ...item, draft } : item,
          ),
        )
      }
      onSave={() => void save(tab.document.relativePath)}
      onLink={(target) => handleLink(target, tab.document.relativePath)}
      onSplit={() => setChooseBeside(true)}
      onReload={() => setReloadPath(tab.document.relativePath)}
    />
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
    <div className="trusted-surface ws-studio" data-workspace-browser data-desktop-id={desktopId}>
      <header className="ws-header">
        <div>
          <h1>{desktopName} workspace</h1>
          <span className="ws-local-badge">
            <span />
            Local only
          </span>
        </div>
        <div className="ws-header-actions">
          <button
            type="button"
            onClick={() => {
              onRefresh();
              void refresh();
            }}
            disabled={loading || busy}
          >
            <Icon name="reload" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={onReveal}>
            <Icon name="folder" />
            Open in Explorer
          </button>
          <button
            type="button"
            className="primary-action"
            aria-expanded={newMenu}
            onClick={() => setNewMenu(!newMenu)}
          >
            <Icon name="plus" />
            New
            <Icon name="chevron-down" />
          </button>
        </div>
      </header>
      <div className="ws-navigation">
        <nav aria-label="Workspace views">
          {(["home", "files", "recent"] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-current={view === item ? "page" : undefined}
              onClick={() => setView(item)}
            >
              {item[0]?.toUpperCase()}
              {item.slice(1)}
            </button>
          ))}
        </nav>
        <label className="ws-search">
          <Icon name="search" />
          <input
            aria-label="Find workspace files"
            value={query}
            placeholder="Find a file…"
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value) setView("recent");
            }}
          />
        </label>
      </div>
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
            ] as const
          ).map(([kind, label]) => (
            <button
              type="button"
              key={kind}
              onClick={() => {
                setNewKind(kind);
                setNewName("");
                setNewMenu(false);
              }}
            >
              <Icon name={kind === "folder" ? "folder" : kind === "board" ? "grid" : "edit"} />
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
      {reloadPath && (
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
      <div className="ws-body">
        <aside className="ws-tree" aria-label="Files and folders">
          <header>
            <button type="button" onClick={() => void openFolder("")}>
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
              Manage in Settings
            </button>
          </footer>
        </aside>
        <main className="ws-main">
          {view === "home" && (
            <WorkspaceHome
              files={files}
              documents={documents}
              capture={capture}
              captureBusy={captureBusy}
              onCaptureChange={setCapture}
              onCapture={(browser) => void captureNote(browser)}
              onOpen={(entry) => void openEntry(entry)}
              onInbox={() => void openFolder("Inbox")}
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
              <nav className="ws-tabs" aria-label="Open workspace files">
                {tabs.map((tab) => (
                  <div
                    className={activePath === tab.document.relativePath ? "active" : ""}
                    key={tab.document.relativePath}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActivePath(tab.document.relativePath);
                        if (besidePath === tab.document.relativePath) setBesidePath(null);
                      }}
                    >
                      <Icon name={tab.document.fileType === "coach" ? "grid" : "edit"} />
                      {tab.document.name}
                      {tab.draft !== tab.document.content && <b title="Unsaved changes">•</b>}
                    </button>
                    <button
                      type="button"
                      aria-label={`Close ${tab.document.name}`}
                      onClick={() => closeTab(tab.document.relativePath)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
              </nav>
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
                  <details className="ws-link-context">
                    <summary>
                      Connections · {incoming.length} incoming · {references.length} outgoing
                    </summary>
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
                            {document.name}
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
                  </details>
                </>
              ) : (
                <div className="ws-folder-home">
                  <h2>{folder.split("/").pop() || desktopName}</h2>
                  <p>Open a note, create a board, or add folders right here.</p>
                  <div className="ws-folder-grid">
                    {index?.directories[folder]?.entries.map((entry) => (
                      <button type="button" key={entry.id} onClick={() => void openEntry(entry)}>
                        <Icon
                          name={
                            entry.kind === "folder"
                              ? "folder"
                              : entry.fileType === "coach"
                                ? "grid"
                                : "edit"
                          }
                        />
                        <strong>{entry.name}</strong>
                        <small>{entry.kind === "folder" ? "Folder" : entry.fileType}</small>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="primary-action" onClick={() => setNewMenu(true)}>
                    <Icon name="plus" />
                    Create here
                  </button>
                </div>
              )}
            </div>
          )}
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
        </main>
      </div>
    </div>
  );
}
