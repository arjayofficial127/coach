import { type ReactNode, useEffect, useRef, useState } from "react";
import { isCoachBoard, parseCoachObject, writeCoachObject } from "../shared/coach-board";
import type { WorkspaceFileRevision } from "../shared/contracts";
import { Icon } from "./icon";
import {
  extendTextToLine,
  insertMarkdown,
  type WorkspaceTab,
  workspaceDisplayName,
  workspaceDocumentTitle,
  workspaceTitle,
} from "./local-workspace-model";
import { WorkspaceBoard } from "./workspace-board";
import { WorkspaceMarkdown } from "./workspace-markdown";
import { notePage, writeNotePage } from "./workspace-page-model";
import { WorkspacePortal } from "./workspace-portal";

const inserts = [
  ["Heading", "\n## $selection\n"],
  ["Checklist", "\n- [ ] $selection\n"],
  ["Callout", "\n> $selection\n"],
  ["Table", "\n| Name | Status |\n| --- | --- |\n| $selection | Next |\n"],
  ["Link to file", "[[$selection]]"],
  ["Embed board", "\n![[$selection]]\n"],
  ["Source link", "[$selection](https://example.com)"],
] as const;

export function WorkspaceDocument({
  tab,
  saving,
  onChange,
  onLink,
  onSplit,
  onReload,
  onRenameTitle,
  onEmbed,
  onResearch,
  toolbarTarget = null,
  onRefresh,
  onReveal,
  onConnections,
  onToolsOpen,
  disabled = false,
}: {
  tab: WorkspaceTab;
  saving: boolean;
  onChange: (value: string) => void;
  onSave?: () => void;
  onLink: (target: string) => void;
  onSplit: () => void;
  onReload: () => void;
  onRename?: () => void;
  onRenameTitle?: (title: string) => Promise<string | null>;
  onEmbed?: (target: string) => ReactNode;
  onResearch?: () => void;
  toolbarTarget?: HTMLElement | null;
  onRefresh?: () => void;
  onReveal?: () => void;
  onConnections?: () => void;
  onToolsOpen?: (path: string, open: boolean) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"page" | "write" | "preview">("page");
  const [raw, setRaw] = useState(false);
  const [history, setHistory] = useState(false);
  const [revisions, setRevisions] = useState<WorkspaceFileRevision[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const menu = useRef<HTMLFieldSetElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const cancelTitleCommit = useRef(false);
  const coach = tab.document.fileType === "coach" ? parseCoachObject(tab.draft) : null;
  const dirty = tab.draft !== tab.document.content;
  const displayName = workspaceDisplayName(tab.document.name);
  const displayTitle = workspaceDocumentTitle(tab.document, tab.draft);
  const savedTitle = workspaceTitle(tab.document.name);
  const [titleDraft, setTitleDraft] = useState(savedTitle);
  const [titleError, setTitleError] = useState("");
  const [pagePrefix, setPagePrefix] = useState(() => notePage(tab.draft, displayTitle).prefix);
  const page = tab.draft.startsWith(pagePrefix)
    ? { prefix: pagePrefix, body: tab.draft.slice(pagePrefix.length) }
    : notePage(tab.draft, displayTitle);
  const isPage = tab.document.fileType === "markdown" && mode === "page";
  useEffect(() => {
    setTitleDraft(savedTitle);
    setTitleError("");
  }, [savedTitle]);
  useEffect(() => {
    if (!history || !window.lattice.localWorkspace.listFileRevisions) return;
    let current = true;
    setHistoryLoading(true);
    setHistoryError("");
    void window.lattice.localWorkspace
      .listFileRevisions({
        desktopId: tab.document.desktopId,
        relativePath: tab.document.relativePath,
      })
      .then((items) => {
        if (current) setRevisions(items);
      })
      .catch(() => {
        if (current) setHistoryError("Version history could not be loaded.");
      })
      .finally(() => {
        if (current) setHistoryLoading(false);
      });
    return () => {
      current = false;
    };
  }, [history, tab.document.desktopId, tab.document.relativePath]);
  const commitTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === savedTitle || !onRenameTitle) {
      setTitleDraft(savedTitle);
      return;
    }
    const error = await onRenameTitle(next);
    if (error) {
      setTitleDraft(savedTitle);
      setTitleError(error);
    } else {
      setTitleError("");
    }
  };
  const changeText = (value: string) => {
    if (!isPage) return onChange(value);
    const source = writeNotePage(page, value);
    setPagePrefix(source.slice(0, source.length - value.length));
    onChange(source);
  };
  const selectMode = (next: typeof mode) => {
    if (next === "page") setPagePrefix(notePage(tab.draft, displayTitle).prefix);
    setMode(next);
  };
  useEffect(() => {
    onToolsOpen?.(tab.document.relativePath, toolsOpen || insertOpen);
    return () => onToolsOpen?.(tab.document.relativePath, false);
  }, [toolsOpen, insertOpen, onToolsOpen, tab.document.relativePath]);
  useEffect(() => {
    if (!toolsOpen && !insertOpen) return;
    if (toolsOpen) menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !menuButton.current?.contains(event.target)
      )
        setToolsOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setToolsOpen(false);
        setInsertOpen(false);
        if (toolsOpen) menuButton.current?.focus();
        else input.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [toolsOpen, insertOpen]);
  const action = (run: () => void) => {
    setToolsOpen(false);
    menuButton.current?.focus();
    run();
  };
  const insert = (template: string) => {
    const source = input.current;
    const result = insertMarkdown(
      isPage ? page.body : tab.draft,
      source?.selectionStart ?? (isPage ? page.body.length : tab.draft.length),
      source?.selectionEnd ?? (isPage ? page.body.length : tab.draft.length),
      template,
    );
    changeText(result.content);
    setInsertOpen(false);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(result.cursor, result.cursor);
    });
  };
  const restoreRevision = async (revision: WorkspaceFileRevision) => {
    const readRevision = window.lattice.localWorkspace.readFileRevision;
    if (!readRevision) return;
    setHistoryError("");
    try {
      const restored = await readRevision({
        desktopId: tab.document.desktopId,
        relativePath: tab.document.relativePath,
        revisionId: revision.id,
      });
      onChange(restored.content);
      setHistory(false);
      requestAnimationFrame(() => input.current?.focus());
    } catch {
      setHistoryError("That saved version could not be opened.");
    }
  };
  const sourceEditor = (
    <textarea
      ref={input}
      className={`ws-source ${isPage || tab.document.fileType === "text" ? "ws-page-input" : ""}`}
      aria-label={`Edit ${displayName}`}
      value={isPage ? page.body : tab.draft}
      disabled={disabled}
      placeholder="Continue your thought…"
      onChange={(event) => changeText(event.target.value)}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled || !(isPage || tab.document.fileType === "text")) return;
        const target = event.currentTarget;
        const style = window.getComputedStyle(target);
        const lineHeight = Number.parseFloat(style.lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
        const targetLine = Math.floor(
          Math.max(
            0,
            event.clientY -
              target.getBoundingClientRect().top +
              target.scrollTop -
              Number.parseFloat(style.paddingTop || "0"),
          ) / lineHeight,
        );
        const expanded = extendTextToLine(target.value, targetLine);
        if (!expanded) return;
        event.preventDefault();
        changeText(expanded.content);
        requestAnimationFrame(() => {
          input.current?.focus();
          input.current?.setSelectionRange(expanded.cursor, expanded.cursor);
        });
      }}
      spellCheck={tab.document.fileType !== "coach"}
      onKeyDown={(event) => {
        if (
          event.key === "ArrowUp" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          event.currentTarget.selectionStart === event.currentTarget.selectionEnd &&
          event.currentTarget.selectionStart <=
            (() => {
              const firstBreak = event.currentTarget.value.search(/\r?\n/);
              return firstBreak < 0 ? event.currentTarget.value.length : firstBreak;
            })()
        ) {
          event.preventDefault();
          const column = event.currentTarget.selectionStart;
          titleInput.current?.focus();
          const titleColumn = Math.min(column, titleDraft.length);
          titleInput.current?.setSelectionRange(titleColumn, titleColumn);
          return;
        }
        if (
          tab.document.fileType === "markdown" &&
          event.key === "/" &&
          (event.ctrlKey || event.metaKey)
        ) {
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
      <WorkspacePortal target={toolbarTarget}>
        <fieldset
          className="ws-note-toolbar"
          disabled={disabled}
          data-workspace-file={tab.document.relativePath}
        >
          <span className={`ws-document-status ${dirty ? "ws-unsaved" : "ws-saved"}`} role="status">
            <Icon name={dirty ? "edit" : "check"} />
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved locally"}
          </span>
          <button
            ref={menuButton}
            type="button"
            aria-label={`Note tools for ${displayTitle}`}
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            <Icon name="more" />
          </button>
          {toolsOpen && (
            <fieldset
              className="ws-document-tools"
              ref={menu}
              aria-label="Note tools"
              onBlur={(event) => {
                if (
                  event.relatedTarget instanceof Node &&
                  !event.currentTarget.contains(event.relatedTarget) &&
                  event.relatedTarget !== menuButton.current
                )
                  setToolsOpen(false);
              }}
            >
              {tab.document.fileType === "markdown" && (
                <>
                  <button
                    type="button"
                    aria-pressed={mode === "page"}
                    onClick={() => action(() => selectMode("page"))}
                  >
                    Edit note
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "write"}
                    onClick={() => action(() => selectMode("write"))}
                  >
                    Markdown source
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "preview"}
                    onClick={() => action(() => selectMode("preview"))}
                  >
                    Preview
                  </button>
                </>
              )}
              {tab.document.fileType === "coach" && (
                <button type="button" onClick={() => action(() => setRaw(!raw))}>
                  {raw ? "Visual editor" : "View JSON"}
                </button>
              )}
              {onResearch && (
                <button type="button" onClick={() => action(onResearch)}>
                  Research beside
                </button>
              )}
              <button type="button" onClick={() => action(onSplit)}>
                Open beside
              </button>
              <button type="button" onClick={() => action(() => setHistory(!history))}>
                Version history
              </button>
              <button type="button" onClick={() => action(() => setDetailsOpen(!detailsOpen))}>
                File details
              </button>
              {onConnections && (
                <button type="button" onClick={() => action(onConnections)}>
                  Connections
                </button>
              )}
              <button type="button" disabled={saving} onClick={() => action(onReload)}>
                Reload saved file
              </button>
              {onRefresh && (
                <button type="button" onClick={() => action(onRefresh)}>
                  Refresh files
                </button>
              )}
              {onReveal && (
                <button type="button" onClick={() => action(onReveal)}>
                  Open in Explorer
                </button>
              )}
            </fieldset>
          )}
        </fieldset>
      </WorkspacePortal>
      <header className="ws-document-header">
        <div className="ws-inline-title-wrap">
          <input
            ref={titleInput}
            className="ws-inline-title"
            aria-label="Document title"
            value={titleDraft}
            maxLength={120}
            disabled={disabled}
            spellCheck
            onChange={(event) => {
              setTitleDraft(event.target.value);
              setTitleError("");
            }}
            onBlur={() => {
              if (cancelTitleCommit.current) {
                cancelTitleCommit.current = false;
                return;
              }
              void commitTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                cancelTitleCommit.current = true;
                setTitleDraft(savedTitle);
                setTitleError("");
                input.current?.focus();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                input.current?.focus();
              } else if (
                event.key === "ArrowDown" &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                event.currentTarget.selectionStart === event.currentTarget.selectionEnd
              ) {
                event.preventDefault();
                const column = event.currentTarget.selectionStart ?? 0;
                event.currentTarget.blur();
                input.current?.focus();
                const bodyColumn = Math.min(column, input.current?.value.length ?? 0);
                input.current?.setSelectionRange(bodyColumn, bodyColumn);
              }
            }}
          />
          {titleError && <small role="alert">{titleError}</small>}
        </div>
      </header>
      {detailsOpen && (
        <section className="ws-file-details" aria-label="File details">
          <header>
            <strong>File details</strong>
            <button
              type="button"
              aria-label="Close file details"
              onClick={() => setDetailsOpen(false)}
            >
              <Icon name="close" />
            </button>
          </header>
          <dl>
            <dt>Filename</dt>
            <dd>{tab.document.name}</dd>
            <dt>Location in this desktop</dt>
            <dd>
              {tab.document.relativePath.split("/").slice(0, -1).join(" / ") || "Desktop root"}
            </dd>
            <dt>Last saved</dt>
            <dd>
              <time dateTime={tab.document.updatedAt}>
                {new Date(tab.document.updatedAt).toLocaleString()}
              </time>
            </dd>
            <dt>Format</dt>
            <dd>{tab.document.fileType}</dd>
            <dt>Source length</dt>
            <dd>{tab.draft.length.toLocaleString()} characters</dd>
          </dl>
          <small>
            Local file. Display names are simplified; generated headings and metadata remain in
            Markdown source. Notes are never deleted here.
          </small>
        </section>
      )}
      {history && (
        <div className="ws-history">
          <strong>Version history</strong>
          <button type="button" onClick={() => setHistory(false)}>
            Close history
          </button>
          <p>Every distinct save is kept locally, up to 100 versions or 50 MB per file.</p>
          {historyError && <small role="alert">{historyError}</small>}
          {historyLoading ? (
            <small>Loading saved versions…</small>
          ) : revisions.length ? (
            revisions.map((revision) => (
              <button
                type="button"
                key={revision.id}
                onClick={() => void restoreRevision(revision)}
              >
                Restore {new Date(revision.savedAt).toLocaleString()} as draft
              </button>
            ))
          ) : !window.lattice.localWorkspace.listFileRevisions && tab.history.length ? (
            tab.history.map((revision) => (
              <button
                type="button"
                key={revision.savedAt}
                onClick={() => onChange(revision.content)}
              >
                Restore {new Date(revision.savedAt).toLocaleString()} as draft
              </button>
            ))
          ) : (
            <small>No earlier saved versions yet.</small>
          )}
        </div>
      )}
      {tab.document.fileType === "markdown" ? (
        <>
          {mode !== "preview" && (
            <div className="ws-insert-toolbar">
              <button
                type="button"
                aria-expanded={insertOpen}
                onClick={() => setInsertOpen(!insertOpen)}
              >
                <Icon name="plus" />
                <span className="ws-insert-label">Insert block</span>
              </button>
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
          {mode !== "preview" ? (
            sourceEditor
          ) : (
            <WorkspaceMarkdown
              content={page.body}
              onChange={(value) => onChange(writeNotePage(page, value))}
              onLink={onLink}
              onEmbed={onEmbed}
              titleAlreadyShown={displayTitle}
            />
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
      <footer className="ws-writing-hint">
        {mode === "preview" && tab.document.fileType === "markdown" ? (
          <button type="button" onClick={() => selectMode("page")}>
            Edit note
          </button>
        ) : (
          "Saved automatically"
        )}
        {tab.document.fileType === "markdown" && mode !== "preview" && " · Ctrl+/ for blocks"}
      </footer>
    </section>
  );
}
