import { useRef, useState } from "react";
import { isCoachBoard, parseCoachObject, writeCoachObject } from "../shared/coach-board";
import { Icon } from "./icon";
import { insertMarkdown, type WorkspaceTab, workspaceTitle } from "./local-workspace-model";
import { WorkspaceBoard } from "./workspace-board";
import { WorkspaceMarkdown } from "./workspace-markdown";

const inserts = [
  ["Heading", "\n## $selection\n"],
  ["Checklist", "\n- [ ] $selection\n"],
  ["Callout", "\n> $selection\n"],
  ["Table", "\n| Name | Status |\n| --- | --- |\n| $selection | Next |\n"],
  ["Link to file", "[[$selection]]"],
  ["Source link", "[$selection](https://example.com)"],
] as const;

export function WorkspaceDocument({
  tab,
  saving,
  onChange,
  onSave,
  onLink,
  onSplit,
  onReload,
  onRename,
}: {
  tab: WorkspaceTab;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onLink: (target: string) => void;
  onSplit: () => void;
  onReload: () => void;
  onRename: () => void;
}) {
  const [mode, setMode] = useState<"write" | "preview">("preview");
  const [raw, setRaw] = useState(false);
  const [history, setHistory] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const coach = tab.document.fileType === "coach" ? parseCoachObject(tab.draft) : null;
  const dirty = tab.draft !== tab.document.content;
  const insert = (template: string) => {
    const source = input.current;
    const result = insertMarkdown(
      tab.draft,
      source?.selectionStart ?? tab.draft.length,
      source?.selectionEnd ?? tab.draft.length,
      template,
    );
    onChange(result.content);
    setInsertOpen(false);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(result.cursor, result.cursor);
    });
  };
  const sourceEditor = (
    <textarea
      ref={input}
      className="ws-source"
      aria-label={`Edit ${tab.document.name}`}
      value={tab.draft}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={tab.document.fileType !== "coach"}
      onKeyDown={(event) => {
        if (event.key === "/" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          setInsertOpen(true);
        }
      }}
    />
  );
  return (
    <section
      className="ws-document"
      data-workspace-editor
      data-workspace-file={tab.document.relativePath}
    >
      <header className="ws-document-header">
        <div>
          <span className="ws-kicker">
            {tab.document.fileType === "coach"
              ? `Coach · ${coach?.kind ?? "JSON needs repair"}`
              : tab.document.fileType}
          </span>
          <h2>
            <button
              type="button"
              className="ws-title-button"
              aria-label={`Rename file ${tab.document.name}`}
              onClick={onRename}
            >
              {workspaceTitle(tab.document.name)} <Icon name="edit" />
            </button>
          </h2>
          {tab.document.relativePath.includes("/") && (
            <small>{tab.document.relativePath.split("/").slice(0, -1).join(" / ")}</small>
          )}
        </div>
        <button
          type="button"
          className="primary-action"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>
      <div className="ws-document-tools">
        {tab.document.fileType === "markdown" && (
          <div className="ws-segmented">
            <button type="button" aria-pressed={mode === "write"} onClick={() => setMode("write")}>
              Write
            </button>
            <button
              type="button"
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              Preview
            </button>
          </div>
        )}
        {tab.document.fileType === "coach" && (
          <button type="button" onClick={() => setRaw(!raw)}>
            {raw ? "Visual editor" : "View JSON"}
          </button>
        )}
        <button type="button" onClick={onSplit}>
          <Icon name="grid" /> Open beside
        </button>
        <button type="button" onClick={() => setHistory(!history)} aria-expanded={history}>
          <Icon name="timer" /> Session history
        </button>
        <button type="button" onClick={onReload} disabled={saving}>
          Reload saved file
        </button>
      </div>
      {history && (
        <div className="ws-history">
          <strong>Previous saves in this session</strong>
          <p>
            Restore creates a draft; Save is still required. These copies do not survive closing
            Coach.
          </p>
          {tab.history.length ? (
            tab.history.map((revision) => (
              <button
                type="button"
                key={revision.savedAt}
                onClick={() => onChange(revision.content)}
              >
                Restore {new Date(revision.savedAt).toLocaleTimeString()} as draft
              </button>
            ))
          ) : (
            <small>No previous saves yet.</small>
          )}
        </div>
      )}
      {tab.document.fileType === "markdown" ? (
        <>
          {mode === "write" && (
            <div className="ws-insert-toolbar">
              <button
                type="button"
                aria-expanded={insertOpen}
                onClick={() => setInsertOpen(!insertOpen)}
              >
                <Icon name="plus" /> Insert block
              </button>
              <small>Ctrl+/ for blocks · Ctrl+S to save</small>
              {insertOpen && (
                <div className="ws-insert-menu">
                  {inserts.map(([label, template]) => (
                    <button type="button" key={label} onClick={() => insert(template)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {mode === "write" ? (
            sourceEditor
          ) : (
            <WorkspaceMarkdown content={tab.draft} onChange={onChange} onLink={onLink} />
          )}
        </>
      ) : tab.document.fileType === "coach" && !raw && isCoachBoard(coach) ? (
        <WorkspaceBoard
          board={coach}
          onChange={(value) => onChange(writeCoachObject(value))}
          onLink={onLink}
        />
      ) : tab.document.fileType === "coach" &&
        !raw &&
        coach?.kind === "document" &&
        typeof coach.title === "string" &&
        typeof coach.content === "string" ? (
        <div className="ws-coach-document">
          <label>
            Title
            <input
              value={coach.title}
              maxLength={200}
              onChange={(event) =>
                onChange(writeCoachObject({ ...coach, title: event.target.value }))
              }
            />
          </label>
          <label>
            Content
            <textarea
              value={coach.content}
              onChange={(event) =>
                onChange(writeCoachObject({ ...coach, content: event.target.value }))
              }
            />
          </label>
          <WorkspaceMarkdown content={coach.content} onLink={onLink} />
        </div>
      ) : (
        <>
          {tab.document.fileType === "coach" && (
            <p className="ws-notice">
              {!coach || coach.kind === "board"
                ? "This object needs JSON repair before the visual editor can open it."
                : "This object uses the JSON editor. Unknown fields are preserved."}{" "}
              No code is executed.
            </p>
          )}
          {sourceEditor}
        </>
      )}
      <footer className="ws-document-status">
        <span className={dirty ? "ws-unsaved" : "ws-saved"}>
          <Icon name={dirty ? "edit" : "check"} />
          {dirty ? "Unsaved changes" : "Saved locally"}
        </span>
        <small>{tab.draft.length.toLocaleString()} characters</small>
      </footer>
    </section>
  );
}
