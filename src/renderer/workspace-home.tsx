import { isCoachBoard, parseCoachObject } from "../shared/coach-board";
import type { WorkspaceDirectoryEntry, WorkspaceFileDocument } from "../shared/contracts";
import { Icon } from "./icon";
import { notePreview, workspaceTitle } from "./local-workspace-model";

export function WorkspaceFileRows({
  entries,
  onOpen,
}: {
  entries: WorkspaceDirectoryEntry[];
  onOpen: (entry: WorkspaceDirectoryEntry) => void;
}) {
  return (
    <div className="ws-file-rows">
      {entries.map((entry) => (
        <button type="button" key={entry.id} onClick={() => onOpen(entry)}>
          <Icon name={entry.fileType === "coach" ? "grid" : "edit"} />
          <span>
            <strong>{entry.name}</strong>
            <small>
              {entry.relativePath.split("/").slice(0, -1).join(" / ") || "Desktop root"}
            </small>
          </span>
          <span className="ws-type">{entry.fileType === "other" ? "file" : entry.fileType}</span>
          <time>{new Date(entry.updatedAt).toLocaleDateString()}</time>
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
  const inbox = files.filter((entry) => entry.relativePath.startsWith(inboxFolder + "/"));
  const previews = files.filter((entry) => entry.fileType !== "other").slice(0, 2);
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
        <header>
          <h2>A little clarity. Then momentum.</h2>
          <p>Your notes, sources, and next steps—in one place.</p>
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
            placeholder="Catch a thought or paste a link…"
          />
          <button type="submit" disabled={!capture.trim() || captureBusy}>
            <Icon name="plus" />
            {captureBusy ? "Capturing…" : "Capture to Inbox"}
          </button>
        </form>
        <section>
          <h3>Pick up where you left off</h3>
          {previews.length ? (
            <div className="ws-preview-grid">
              {previews.map((entry) => {
                const document = documents[entry.relativePath];
                const object = parseCoachObject(document?.content ?? "");
                return (
                  <button
                    type="button"
                    className="ws-preview-card"
                    key={entry.id}
                    onClick={() => onOpen(entry)}
                  >
                    <header>
                      <Icon name={entry.fileType === "coach" ? "grid" : "edit"} />
                      <strong>{workspaceTitle(entry.name)}</strong>
                    </header>
                    {isCoachBoard(object) ? (
                      <div className="ws-mini-board">
                        {object.columns.slice(0, 3).map((column) => (
                          <div key={column.id}>
                            <b>{column.title}</b>
                            {object.cards
                              .filter((card) => card.columnId === column.id)
                              .slice(0, 2)
                              .map((card) => (
                                <span key={card.id}>{card.title}</span>
                              ))}
                            <small>
                              {object.cards.filter((card) => card.columnId === column.id).length}{" "}
                              cards
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>
                        {document
                          ? notePreview(
                              entry.fileType === "coach"
                                ? String(object?.content ?? object?.title ?? "JSON object")
                                : document.content,
                            ) || "A fresh page, ready for your next thought."
                          : "Open to read this file."}
                      </p>
                    )}
                    <footer>
                      <span className="ws-tag">{entry.fileType}</span>
                      <small>{new Date(entry.updatedAt).toLocaleDateString()}</small>
                    </footer>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ws-welcome">
              <h3>A home for your next idea.</h3>
              <p>Create a note or a board. Only your own work appears here.</p>
              <button type="button" className="primary-action" onClick={() => onNew("markdown")}>
                Create your first note
              </button>
              <button type="button" onClick={() => onNew("board")}>
                Create a board
              </button>
            </div>
          )}
        </section>
        <section aria-label="Your space">
          <header className="ws-home-folder-header">
            <h3>Your space</h3>
            <div>
              <button type="button" onClick={onNewFolder}>
                <Icon name="plus" />
                Folder
              </button>
              <button type="button" onClick={() => onNew("markdown")}>
                <Icon name="plus" />
                File
              </button>
            </div>
          </header>
          <div className="ws-home-folders">
            {folders.map((entry) => (
              <button type="button" key={entry.id} onClick={() => onFolder(entry)}>
                <Icon name="folder" />
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
          <WorkspaceFileRows entries={files.slice(0, 5)} onOpen={onOpen} />
          {!files.length && (
            <p className="ws-empty-copy">
              Files can live at the root or inside any folder. Start wherever you like.
            </p>
          )}
          {files.length > 5 && (
            <button type="button" className="ws-text-action" onClick={onRecent}>
              See all files <Icon name="arrow-right" />
            </button>
          )}
        </section>
        <section>
          <h3>Make something useful</h3>
          <div className="ws-template-row">
            <button type="button" onClick={() => onNew("board")}>
              <Icon name="grid" />
              <span>
                Board<small>Saved as a .coach file</small>
              </span>
            </button>
            <button type="button" onClick={() => onNew("planner")}>
              <Icon name="timer" />
              <span>
                Planner<small>Cards, dates, and calendar</small>
              </span>
            </button>
            <button type="button" onClick={() => onNew("coach")}>
              <Icon name="edit" />
              <span>
                Coach document<small>Text and structured data</small>
              </span>
            </button>
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
              {due.slice(0, 6).map(({ entry, card, column }) => (
                <button
                  type="button"
                  className="ws-today-item"
                  key={entry.id + ":" + card.id}
                  onClick={() => onOpen(entry)}
                >
                  <Icon name="grid" />
                  <span>
                    <strong>{card.title}</strong>
                    <small>
                      {workspaceTitle(entry.name)} · {column}
                    </small>
                  </span>
                </button>
              ))}
              {due.length > 6 && (
                <p className="ws-muted">{due.length - 6} more dated cards in your boards.</p>
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
          <h3>Local by design</h3>
          <p className="ws-muted">
            Your files stay in your connected folder. Archiving a desktop keeps its notes.
          </p>
        </section>
      </aside>
    </div>
  );
}
