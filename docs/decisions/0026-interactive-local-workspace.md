# ADR 0026: Make the local workspace an in-app editor with a narrow file broker

## Context

Coach already gave each desktop a stable local folder, but the Files & Inbox surface only summarized
the four starter folders and delegated navigation to Explorer. That made local knowledge feel like an
attachment to the browser instead of a first-class part of the desktop. Coach needs Obsidian-like
folder freedom while preserving the trusted-shell boundary and user ownership of ordinary files.

## Decision

- Make Coach the primary workspace browser. A user can navigate arbitrary nested folders with
  breadcrumbs and create a folder, Markdown file, text file, or Coach object at the current level.
  **Open in Explorer** remains a secondary escape hatch.
- Edit `.md` and `.text` as plain text. Treat `.coach` as UTF-8 JSON with a stable version-1 envelope
  containing a lowercase `kind`. The first structured kind is `document`; unknown valid kinds remain
  editable as raw JSON so future planner, board, builder, and app objects do not require a new file
  extension.
- Keep all filesystem authority in the trusted main process. Renderer requests carry only a desktop
  ID and normalized relative path. Main resolves the stable desktop root, rejects absolute paths,
  traversal, hidden segments, reserved names, symlinks, unsupported edit types, oversized documents,
  and paths outside the canonical root. Neither absolute workspace paths nor filesystem exceptions
  containing them are returned to the renderer.
- List one directory at a time with bounded entries, depth, and path length. This supports deep trees
  without granting the renderer recursive filesystem access or scanning an entire user folder on each
  navigation.
- Create files exclusively and save edits through a temporary sibling plus rename. Saves carry the
  last observed timestamp and fail on an external change instead of silently overwriting it.
- Keep deletion, rename, and move out of this capability. Closing a dirty editor is blocked until the
  user saves it; no operation silently rewrites, relocates, or removes another file.
- Keep remote websites in the existing isolated `WebContentsView`. The workspace editor is trusted
  shell UI and receives no remote DOM, Node, or arbitrary-path capability.

## Consequences

Every desktop now has an in-app folder/file workspace with document tabs and an extensible local
object format. The files remain readable outside Coach and an Obsidian-compatible folder is still a
valid connected root.

This is an editor foundation, not a full IDE or Obsidian clone. Recursive search, filesystem watching,
rename/move/delete UI, Markdown preview, binary document editing, draft crash recovery, specialized
editors for additional `.coach` kinds, merge tooling, and large-tree performance characterization
remain explicit future work. Canonical checks reduce path escape risk but do not eliminate local
filesystem TOCTOU races.
