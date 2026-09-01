# ADR 0024: Give each desktop a stable local workspace without filesystem authority in the renderer

## Context

Coach desktops already grouped website tabs, saved links, Canvas pages, and runnable apps, but the
selected folder was presented as an Obsidian vault and ordinary files had no equally important
desktop-level home. Quick captures also lived only in profile-local application state.

## Decision

- Present the capability as **Connect local folder**. An Obsidian folder remains a compatible local
  folder, but Obsidian is optional.
- Keep private coordination data in `.coach/workspace.json` and user-visible material under
  `Desktops/<sanitized desktop name>-<stable ID>/`.
- Create exactly four initial areas for every live desktop: `Inbox`, `Notes`, `Files`, and `Planner`.
  A desktop rename updates display metadata but retains the existing folder name to avoid silent
  moves and broken external references.
- Publish New Tab quick notes atomically into the active desktop's `Inbox` when a local folder is
  connected. Existing Daily Flow capture remains profile-local for continuity.
- Return only basenames, kinds, counts, timestamps, sizes, and opaque item IDs to the renderer.
  Absolute paths stay in the trusted main process. Explorer reveal accepts only a validated desktop
  ID, resolves the canonical folder in main, and reuses the trusted-shell-only IPC guard.
- Make Files & Inbox visible in the left navigation, the desktop tab strip, and the customizable
  dashboard. Browser tabs remain native remote views; local files remain trusted-shell UI, so the
  two concepts are adjacent without sharing DOM or privileges.
- Disconnecting forgets authority only. Coach does not silently rewrite, rename, move, or delete
  user files or desktop folders.

## Consequences

The selected desktop has an inspectable local home and quick capture becomes durable Markdown when
connected. Existing Saved Links and `Lattice Pages` locations remain compatible and are not silently
migrated into the new tree. Top-level file metadata is indexed, but recursive content search,
filesystem watching, in-app file editing, manual-rename reconciliation, and cross-store
deduplication remain separate decisions recorded in the risk register.
