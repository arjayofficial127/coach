import { isCoachBoard, parseCoachObject } from "../shared/coach-board";
import type { WorkspaceDirectoryEntry, WorkspaceFileDocument } from "../shared/contracts";
import { Icon } from "./icon";
import { workspaceEntryTitle } from "./local-workspace-model";

export function WorkspaceFileRows({
  entries,
  onOpen,
  dashboard = false,
}: {
  entries: WorkspaceDirectoryEntry[];
  onOpen: (entry: WorkspaceDirectoryEntry) => void;
  dashboard?: boolean;
}) {
  const modified = (value: string) => {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className={`ws-file-rows${dashboard ? " is-dashboard" : ""}`}>
      {dashboard && (
        <div className="ws-file-row-head" aria-hidden="true">
          <span>Name</span>
          <span>Location</span>
          <span>Modified</span>
          <span />
        </div>
      )}
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.id}
          aria-label={`Open ${workspaceEntryTitle(entry)}`}
          onClick={() => onOpen(entry)}
        >
          <Icon name={entry.fileType === "coach" ? "grid" : "edit"} />
          {dashboard ? (
            <>
              <strong>{workspaceEntryTitle(entry)}</strong>
              <span className="ws-file-location">
                <Icon name="folder" />
                {entry.relativePath.split("/").slice(0, -1).join(" / ") || "Desktop root"}
              </span>
              <time>{modified(entry.updatedAt)}</time>
              <Icon name="more" />
            </>
          ) : (
            <>
              <span>
                <strong>{workspaceEntryTitle(entry)}</strong>
                <small>
                  {entry.relativePath.split("/").slice(0, -1).join(" / ") || "Desktop root"}
                </small>
              </span>
              <span className="ws-type">
                {entry.fileType === "other" ? "file" : entry.fileType}
              </span>
              <time>{new Date(entry.updatedAt).toLocaleDateString()}</time>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export function WorkspaceHome({
  files,
  folders,
  inboxFolder = "Inbox",
  documents,
  capture,
  captureBusy,
  onCaptureChange,
  onCapture,
  onOpen,
  onFolder,
  onNewFolder,
  onFocus,
  onInbox,
  onNew,
  onRecent,
}: {
  files: WorkspaceDirectoryEntry[];
  folders: WorkspaceDirectoryEntry[];
  inboxFolder?: string;
  documents: Record<string, WorkspaceFileDocument>;
  capture: string;
  captureBusy: boolean;
  onCaptureChange: (value: string) => void;
  onCapture: (browser?: boolean) => void;
  onOpen: (entry: WorkspaceDirectoryEntry) => void;
  onFolder: (entry: WorkspaceDirectoryEntry) => void;
  onNewFolder: () => void;
  onFocus: () => void;
  onInbox: () => void;
  onNew: (kind: "markdown" | "board" | "planner" | "coach") => void;
  onRecent: () => void;
}) {
  const inbox = files.filter((entry) => entry.relativePath.startsWith(`${inboxFolder}/`));
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const due = files.flatMap((entry) => {
    const board = parseCoachObject(documents[entry.relativePath]?.content ?? "");
    return isCoachBoard(board)
      ? board.cards
          .filter((card) => card.dueDate === today)
          .map((card) => ({
            entry,
            card,
            column: board.columns.find((column) => column.id === card.columnId)?.title,
          }))
      : [];
  });
  return (
    <div className="ws-home" data-workspace-home>
      <div className="ws-home-primary">
        <header className="ws-home-intro">
          <h2>Files &amp; Inbox</h2>
          <p>Everything you’re working on, in one place.</p>
        </header>
        <form
          className="ws-capture"
          onSubmit={(event) => {
            event.preventDefault();
            onCapture();
          }}
        >
          <input
            aria-label="Quick capture"
            maxLength={20000}
            value={capture}
            onChange={(e) => onCaptureChange(e.target.value)}
            placeholder="Capture a note, task, or link…"
          />
          <button
            type="submit"
            className="primary-action"
            disabled={!capture.trim() || captureBusy}
          >
            {captureBusy ? "Adding…" : "Add to Inbox"}
          </button>
        </form>
        <section className="ws-home-stats" aria-label="Workspace summary">
          <button type="button" onClick={onInbox}>
            <Icon name="queue" />
            <span>
              <small>Inbox</small>
              <strong>{inbox.length}</strong>
              <span>Items captured</span>
            </span>
          </button>
          <button type="button" onClick={onRecent}>
            <Icon name="file" />
            <span>
              <small>Recent files</small>
              <strong>{files.length}</strong>
              <span>Files in this workspace</span>
            </span>
          </button>
          <button type="button" onClick={onFocus}>
            <Icon name="timer" />
            <span>
              <small>Due today</small>
              <strong>{due.length}</strong>
              <span>Items due today</span>
            </span>
          </button>
        </section>
        <section className="ws-home-recent" aria-label="Recent files">
          <header className="ws-home-folder-header">
            <h3>Recent files</h3>
            <button type="button" className="ws-text-action" onClick={onRecent}>
              View all
            </button>
          </header>
          <WorkspaceFileRows dashboard entries={files.slice(0, 5)} onOpen={onOpen} />
          {!files.length && (
            <div className="ws-home-empty-row">
              <Icon name="file" />
              <span>
                <strong>No recent files yet.</strong>
                <small>Create a note or capture something to start your workspace.</small>
              </span>
              <button type="button" onClick={() => onNew("markdown")}>
                Create a note
              </button>
            </div>
          )}
        </section>
        <section className="ws-pinned-spaces" aria-label="Pinned spaces">
          <header className="ws-home-folder-header">
            <h3>Pinned spaces</h3>
            <button type="button" onClick={onNewFolder}>
              <Icon name="plus" /> New folder
            </button>
          </header>
          <div className="ws-home-folders">
            {folders.slice(0, 4).map((entry) => (
              <button type="button" key={entry.id} onClick={() => onFolder(entry)}>
                <Icon name="folder" />
                <span>{entry.name}</span>
              </button>
            ))}
            {!folders.length && (
              <button type="button" onClick={onNewFolder}>
                <Icon name="plus" />
                <span>Create your first folder</span>
              </button>
            )}
          </div>
        </section>
      </div>
      <aside className="ws-home-rail" aria-label="Today and Inbox">
        <section>
          <header className="ws-home-folder-header">
            <h3>Today</h3>
            <small>{now.toLocaleDateString(undefined, { weekday: "short", day: "2-digit" })}</small>
          </header>
          {due.length ? (
            <>
              {due.slice(0, 4).map(({ entry, card, column }) => (
                <button
                  type="button"
                  className="ws-today-item"
                  key={`${entry.id}:${card.id}`}
                  onClick={() => onOpen(entry)}
                >
                  <span className="ws-task-check" />
                  <span>
                    <strong>{card.title}</strong>
                    <small>
                      {workspaceEntryTitle(entry)} · {column}
                    </small>
                  </span>
                </button>
              ))}
              {due.length > 4 && (
                <p className="ws-muted">{due.length - 4} more dated cards in your boards.</p>
              )}
            </>
          ) : (
            <div className="ws-empty-copy">
              <p>No board cards due today.</p>
              <p>Add a date to a card to bring it here.</p>
            </div>
          )}
          <button type="button" className="ws-text-action" onClick={onFocus}>
            <Icon name="timer" />
            Choose a focus session
          </button>
        </section>
        <section>
          <header className="ws-home-folder-header">
            <h3>Inbox · {inbox.length}</h3>
            <button type="button" onClick={onInbox}>
              Open Inbox
            </button>
          </header>
          {inbox.length ? (
            <WorkspaceFileRows entries={inbox.slice(0, 3)} onOpen={onOpen} />
          ) : (
            <p className="ws-empty-copy">
              Your Inbox is clear. Capture a thought or a browser source here.
            </p>
          )}
          <button
            type="button"
            className="ws-text-action ws-capture-source"
            onClick={() => onCapture(true)}
            disabled={captureBusy}
          >
            <Icon name="globe" />
            Capture active browser tab
          </button>
        </section>
        <section>
          <h3 className="ws-local-title">
            <Icon name="desktop" /> Local by design
          </h3>
          <p className="ws-muted">
            Your files stay in your connected folder. Archiving a desktop keeps its notes.
          </p>
        </section>
      </aside>
    </div>
  );
}
