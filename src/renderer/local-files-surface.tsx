import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  WorkspaceDirectoryEntry,
  WorkspaceDirectoryListing,
  WorkspaceEditableFileType,
  WorkspaceFileDocument,
} from "../shared/contracts";
import { Icon } from "./icon";

type NewEntryKind = "folder" | WorkspaceEditableFileType;

interface EditorTab {
  document: WorkspaceFileDocument;
  draft: string;
  dirty: boolean;
}

interface CoachValue {
  version: 1;
  kind: string;
  title?: string;
  content?: string;
  [key: string]: unknown;
}

function parseCoach(content: string): CoachValue | null {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || typeof candidate.kind !== "string") return null;
    return candidate as CoachValue;
  } catch {
    return null;
  }
}

function writeCoach(value: CoachValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function entryLabel(entry: WorkspaceDirectoryEntry): string {
  if (entry.kind === "folder") return "Folder";
  if (entry.fileType === "markdown") return "Markdown";
  if (entry.fileType === "text") return "Text";
  if (entry.fileType === "coach") return "Coach object";
  return "File";
}

interface LocalFilesSurfaceProps {
  desktopId: string;
  desktopName: string;
  workspaceName: string;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onReveal: () => void;
}

export function LocalFilesSurface({
  desktopId,
  desktopName,
  workspaceName,
  connected,
  busy,
  onConnect,
  onRefresh,
  onReveal,
}: LocalFilesSurfaceProps) {
  const [listing, setListing] = useState<WorkspaceDirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [newKind, setNewKind] = useState<NewEntryKind | null>(null);
  const [newName, setNewName] = useState("");
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  const activeTab = tabs.find((tab) => tab.document.relativePath === activePath) ?? null;
  const coachValue = useMemo(
    () => (activeTab?.document.fileType === "coach" ? parseCoach(activeTab.draft) : null),
    [activeTab],
  );

  const loadDirectory = useCallback(
    async (relativePath: string) => {
      if (!connected) return;
      setLoading(true);
      setMessage("");
      try {
        setListing(await window.lattice.localWorkspace.listDirectory({ desktopId, relativePath }));
        setNewKind(null);
        setNewName("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [connected, desktopId],
  );

  useEffect(() => {
    setListing(null);
    setTabs([]);
    setActivePath(null);
    setMessage("");
    if (connected) void loadDirectory("");
  }, [connected, loadDirectory]);

  const openEntry = async (entry: WorkspaceDirectoryEntry) => {
    if (entry.kind === "folder") {
      await loadDirectory(entry.relativePath);
      return;
    }
    if (entry.fileType === "other") {
      setMessage("Coach can browse this file, but currently edits .md, .text, and .coach files.");
      return;
    }
    const existing = tabs.find((tab) => tab.document.relativePath === entry.relativePath);
    if (existing) {
      setActivePath(existing.document.relativePath);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const document = await window.lattice.localWorkspace.readFile({
        desktopId,
        relativePath: entry.relativePath,
      });
      setTabs((current) => [...current, { document, draft: document.content, dirty: false }]);
      setActivePath(document.relativePath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const createEntry = async () => {
    if (!listing || !newKind || !newName.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const next = await window.lattice.localWorkspace.createEntry({
        desktopId,
        parentPath: listing.relativePath,
        name: newName,
        kind: newKind === "folder" ? "folder" : "file",
        fileType: newKind === "folder" ? undefined : newKind,
      });
      setListing(next);
      const normalizedName = newName.trim().toLocaleLowerCase();
      const created = next.entries.find(
        (entry) =>
          entry.name.toLocaleLowerCase() === normalizedName ||
          entry.name.toLocaleLowerCase().startsWith(`${normalizedName}.`),
      );
      setNewKind(null);
      setNewName("");
      onRefresh();
      if (created?.kind === "file") await openEntry(created);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (draft: string) => {
    if (!activePath) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.document.relativePath === activePath ? { ...tab, draft, dirty: true } : tab,
      ),
    );
  };

  const updateCoach = (field: "title" | "content", value: string) => {
    if (coachValue) updateDraft(writeCoach({ ...coachValue, [field]: value }));
  };

  const saveActive = useCallback(async () => {
    const tab = tabs.find((candidate) => candidate.document.relativePath === activePath);
    if (!tab?.dirty) return;
    setLoading(true);
    setMessage("");
    try {
      const saved = await window.lattice.localWorkspace.saveFile({
        desktopId,
        relativePath: tab.document.relativePath,
        content: tab.draft,
        expectedUpdatedAt: tab.document.updatedAt,
      });
      setTabs((current) =>
        current.map((candidate) =>
          candidate.document.relativePath === saved.relativePath
            ? { document: saved, draft: saved.content, dirty: false }
            : candidate,
        ),
      );
      setMessage(`Saved ${saved.name}`);
      onRefresh();
      if (listing) void loadDirectory(listing.relativePath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [activePath, desktopId, listing, loadDirectory, onRefresh, tabs]);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s" && activeTab) {
        event.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [activeTab, saveActive]);

  const closeTab = (relativePath: string) => {
    const closing = tabs.find((tab) => tab.document.relativePath === relativePath);
    if (closing?.dirty) {
      setMessage(`Save ${closing.document.name} before closing it.`);
      return;
    }
    const index = tabs.findIndex((tab) => tab.document.relativePath === relativePath);
    const remaining = tabs.filter((tab) => tab.document.relativePath !== relativePath);
    setTabs(remaining);
    if (activePath === relativePath) {
      setActivePath(
        remaining[Math.min(index, remaining.length - 1)]?.document.relativePath ?? null,
      );
    }
  };

  if (!connected) {
    return (
      <div className="trusted-surface local-files-surface local-files-empty">
        <span className="local-files-empty-icon">
          <Icon name="folder" />
        </span>
        <span className="eyebrow">Your local Coach workspace</span>
        <h1>Give {desktopName} a local home</h1>
        <p>
          Choose any local folder. Coach adds private <code>.coach</code> metadata and gives every
          desktop its own nested folders, Markdown, text, and Coach objects.
        </p>
        <button type="button" className="primary-action" onClick={onConnect}>
          Connect local folder
        </button>
        <small>Coach never moves, rewrites, or deletes existing files in the folder.</small>
      </div>
    );
  }

  return (
    <div className="trusted-surface local-files-surface coach-workspace" data-workspace-browser>
      <header className="local-files-header">
        <div>
          <span className="eyebrow">{workspaceName || "Local workspace"}</span>
          <h1>{desktopName} workspace</h1>
          <p>Folders, notes, files, and programmable Coach objects—without leaving Coach.</p>
        </div>
        <div className="local-files-actions">
          <button
            type="button"
            onClick={() => {
              onRefresh();
              void loadDirectory(listing?.relativePath ?? "");
            }}
            disabled={busy || loading}
          >
            <Icon name="reload" /> {busy || loading ? "Working…" : "Refresh"}
          </button>
          <button type="button" onClick={onReveal} title="Open this desktop in File Explorer">
            <Icon name="folder" /> Open in Explorer
          </button>
        </div>
      </header>

      <div className="coach-workspace-toolbar" role="toolbar" aria-label="Create workspace content">
        <div className="coach-workspace-breadcrumbs">
          {listing?.breadcrumbs.map((crumb, index) => (
            <span key={crumb.relativePath || "root"}>
              {index > 0 && <b>/</b>}
              <button type="button" onClick={() => void loadDirectory(crumb.relativePath)}>
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        <div className="coach-workspace-create-actions">
          <button type="button" onClick={() => setNewKind("folder")}>
            <Icon name="plus" /> Folder
          </button>
          <button type="button" onClick={() => setNewKind("markdown")}>
            <Icon name="plus" /> Markdown
          </button>
          <button type="button" onClick={() => setNewKind("text")}>
            <Icon name="plus" /> Text
          </button>
          <button type="button" className="primary-action" onClick={() => setNewKind("coach")}>
            <Icon name="sparkle" /> Coach object
          </button>
        </div>
      </div>

      {message && (
        <div className="coach-workspace-message" role="status">
          {message}
        </div>
      )}

      <section className="coach-workspace-shell">
        <aside className="coach-workspace-browser" aria-label="Files and folders">
          {newKind && (
            <form
              className="coach-workspace-new-entry"
              onSubmit={(event) => {
                event.preventDefault();
                void createEntry();
              }}
            >
              <label htmlFor="workspace-new-entry">
                New {newKind === "folder" ? "folder" : `${newKind} file`}
              </label>
              <div>
                <input
                  id="workspace-new-entry"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={newKind === "folder" ? "Project" : "Untitled"}
                />
                <button type="submit" className="primary-action" disabled={!newName.trim()}>
                  Create
                </button>
                <button type="button" onClick={() => setNewKind(null)} aria-label="Cancel">
                  <Icon name="close" />
                </button>
              </div>
            </form>
          )}

          <div className="coach-workspace-entry-list">
            {listing?.entries.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={activePath === entry.relativePath ? "active" : undefined}
                onClick={() => void openEntry(entry)}
                data-workspace-entry={entry.kind}
              >
                <span className={`coach-workspace-entry-icon ${entry.fileType}`}>
                  <Icon
                    name={
                      entry.kind === "folder"
                        ? "folder"
                        : entry.fileType === "coach"
                          ? "sparkle"
                          : "edit"
                    }
                  />
                </span>
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entryLabel(entry)}</small>
                </span>
                {entry.kind === "folder" && <Icon name="arrow-right" />}
              </button>
            ))}
            {!loading && listing?.entries.length === 0 && (
              <div className="coach-workspace-empty-folder">
                <Icon name="folder" />
                <strong>This folder is empty.</strong>
                <small>Create a folder, Markdown note, text file, or Coach object here.</small>
              </div>
            )}
          </div>
        </aside>

        <div className="coach-workspace-editor" data-workspace-editor>
          {tabs.length > 0 && (
            <div className="coach-workspace-tabs" role="tablist" aria-label="Open workspace files">
              {tabs.map((tab) => (
                <div
                  key={tab.document.relativePath}
                  className={`coach-workspace-tab ${
                    activePath === tab.document.relativePath ? "active" : ""
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePath === tab.document.relativePath}
                    onClick={() => setActivePath(tab.document.relativePath)}
                  >
                    <span>{tab.document.name}</span>
                    {tab.dirty && <b title="Unsaved changes">•</b>}
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
            </div>
          )}

          {activeTab ? (
            <div className="coach-workspace-document">
              <header>
                <div>
                  <span className="eyebrow">
                    {activeTab.document.fileType === "coach"
                      ? `Coach · ${coachValue?.kind ?? "invalid JSON"}`
                      : activeTab.document.fileType}
                  </span>
                  <h2>{activeTab.document.name}</h2>
                  <small>{activeTab.document.relativePath}</small>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  disabled={!activeTab.dirty || loading}
                  onClick={() => void saveActive()}
                >
                  {loading ? "Saving…" : "Save"}
                </button>
              </header>

              {activeTab.document.fileType === "coach" && coachValue?.kind === "document" ? (
                <div className="coach-object-editor">
                  <label>
                    Title
                    <input
                      value={typeof coachValue.title === "string" ? coachValue.title : ""}
                      onChange={(event) => updateCoach("title", event.target.value)}
                    />
                  </label>
                  <label>
                    Content
                    <textarea
                      value={typeof coachValue.content === "string" ? coachValue.content : ""}
                      onChange={(event) => updateCoach("content", event.target.value)}
                      spellCheck
                    />
                  </label>
                  <small>
                    <code>.coach</code> is readable JSON. Its <code>kind</code> selects the editor;
                    unknown kinds remain available as raw JSON.
                  </small>
                </div>
              ) : (
                <textarea
                  className="coach-workspace-source-editor"
                  aria-label={`Edit ${activeTab.document.name}`}
                  value={activeTab.draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  spellCheck={activeTab.document.fileType !== "coach"}
                />
              )}
            </div>
          ) : (
            <div className="coach-workspace-welcome">
              <span>
                <Icon name="sparkle" />
              </span>
              <h2>Your desktop, built from local files.</h2>
              <p>
                Open a file on the left, or create nested folders and documents anywhere. Coach
                edits <code>.md</code>, <code>.text</code>, and extensible <code>.coach</code>{" "}
                objects.
              </p>
              <small>No file is silently moved, renamed, rewritten, or deleted.</small>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
