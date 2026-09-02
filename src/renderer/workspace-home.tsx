import { isCoachBoard, parseCoachObject } from "../shared/coach-board";
import type { WorkspaceDirectoryEntry, WorkspaceFileDocument } from "../shared/contracts";
import { Icon } from "./icon";
import { notePreview } from "./local-workspace-model";

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
  inboxFolder = "Inbox",
  documents,
  capture,
  captureBusy,
  onCaptureChange,
  onCapture,
  onOpen,
  onInbox,
  onNew,
  onRecent,
}: {
  files: WorkspaceDirectoryEntry[];
  inboxFolder?: string;
  documents: Record<string, WorkspaceFileDocument>;
  capture: string;
  captureBusy: boolean;
  onCaptureChange: (value: string) => void;
  onCapture: (browser?: boolean) => void;
  onOpen: (entry: WorkspaceDirectoryEntry) => void;
  onInbox: () => void;
  onNew: (kind: "markdown" | "board") => void;
  onRecent: () => void;
}) {
  const inbox = files.filter((entry) => entry.relativePath.startsWith(`${inboxFolder}/`));
  const previews = files.filter((entry) => entry.fileType !== "other").slice(0, 3);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
      <header>
        <span className="ws-kicker">YOUR LOCAL WORKSPACE</span>
        <h2>Pick up where you left off</h2>
        <p>Notes, plans, and sources. Close to your browser, owned by you.</p>
      </header>
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
                  <strong>{entry.name}</strong>
                </header>
                {isCoachBoard(object) ? (
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
                        <small>
                          {object.cards.filter((card) => card.columnId === column.id).length} cards
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
          <Icon name="sparkle" />
          <h3>A home for your next idea.</h3>
          <p>Start a note or a board. Your content will appear here as you work.</p>
          <button type="button" className="primary-action" onClick={() => onNew("markdown")}>
            Create your first note
          </button>
          <button type="button" onClick={() => onNew("board")}>
            Create a board
          </button>
        </div>
      )}
      <div className="ws-home-middle">
        <section className="ws-panel">
          <header>
            <h3>
              <Icon name="folder" />
              Inbox <span>{inbox.length}</span>
            </h3>
            <button type="button" onClick={onInbox}>
              Open Inbox
            </button>
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
              onChange={(event) => onCaptureChange(event.target.value)}
              placeholder="Capture a thought before it disappears…"
            />
            <button type="submit" disabled={!capture.trim() || captureBusy}>
              <Icon name="plus" />
              Capture
            </button>
          </form>
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
        <section className="ws-panel">
          <header>
            <h3>
              <Icon name="timer" />
              Today
            </h3>
          </header>
          {due.length ? (
            due.slice(0, 6).map(({ entry, card, column }) => (
              <button
                type="button"
                className="ws-today-item"
                key={`${entry.id}:${card.id}`}
                onClick={() => onOpen(entry)}
              >
                <span className="ws-task-dot" />
                <span>
                  <strong>{card.title}</strong>
                  <small>
                    {entry.name} · {column}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div className="ws-empty-copy">
              <p>No board cards due today.</p>
              <p>Add a date to a card to bring it here.</p>
            </div>
          )}
          <button type="button" className="ws-text-action" onClick={() => onNew("board")}>
            Create a planning board
            <Icon name="arrow-right" />
          </button>
        </section>
      </div>
      <section className="ws-panel">
        <header>
          <h3>
            <Icon name="timer" />
            Recent files
          </h3>
          <button type="button" onClick={onRecent}>
            See all
          </button>
        </header>
        <WorkspaceFileRows entries={files.slice(0, 5)} onOpen={onOpen} />
        {!files.length && (
          <p className="ws-empty-copy">Files will appear here after you create or capture them.</p>
        )}
      </section>
    </div>
  );
}
