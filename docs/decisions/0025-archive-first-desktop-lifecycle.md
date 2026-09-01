# 0025 — Archive-first desktop lifecycle

## Decision

Removing a live desktop is an archive operation. Archived desktops remain recoverable and are
managed from Settings. Permanent deletion is available only for an archived desktop and removes
Coach-owned browser history and recently-closed records for that desktop.

The connected local workspace is outside that destructive boundary. Archive, restore, permanent
desktop deletion, and folder disconnection never rewrite, move, or delete Inbox notes, Markdown,
Canvas pages, documents, images, planner material, or the desktop folder itself. Those files remain
manually managed by the user.

Settings presents the privacy-safe root folder name and active desktop folder, plus explicit open
and disconnect actions. Coach retains archived desktop mappings in `.coach/workspace.json` while
they remain recoverable, without exposing an absolute device path to the renderer.

## Consequences

- A desktop cannot be permanently deleted directly from the sidebar.
- Archive preserves desktop-scoped browser history until the user confirms permanent deletion.
- Permanent deletion reports the browser-record count it will clear and explicitly promises that
  local notes and files stay in place.
- Open tabs must be moved or closed before archive completes; saved Markdown remains attached to
  the archived desktop and returns when restored.
- Local folders can accumulate intentionally retained material after permanent desktop deletion;
  cleanup remains manual until a separately reviewed file-management design exists.
