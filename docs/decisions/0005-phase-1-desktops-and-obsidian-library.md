# ADR 0005: Keep workspace intent in the shell and saved knowledge in Obsidian

Status: Accepted for Phase 1; session persistence amended by ADR 0006 in Phase 2  
Date: 2026-08-28

## Context

Lattice needs browser-like tabs without becoming an opaque proprietary knowledge store. A desktop
should express the user's current browsing context, while saved pages and descriptions should remain
normal files that Obsidian and other tools can read.

## Decision

- The trusted shell owns desktop definitions, the active desktop, tab-to-desktop assignment, and UI
  state. Desktop definitions persist in validated shell `localStorage`; Phase 2 adds the bounded
  tab/session record defined by ADR 0006.
- The Electron main process owns every native tab and exposes only ID-based create, switch, close,
  navigate, visibility, and snapshot operations through validated IPC.
- A saved link is durable knowledge. It is stored as Markdown beneath
  `Saved Links/<Desktop>/`, not in browser storage or a private database.
- The main process remembers the last selected non-disposable vault under Electron user data. A
  disposable test vault is never remembered.
- The library is a bounded, read-only projection over valid `type: "saved-link"` Markdown notes. It
  derives the desktop folder from the actual path and accepts HTTPS records only.

## Consequences

- Saved knowledge is portable, inspectable, syncable by the user's chosen Obsidian workflow, and
  remains after Lattice is removed.
- Renaming a desktop does not move existing files; a later phase needs an explicit migration UX.
- Browser tabs and desktop membership now restore through the bounded Phase 2 model; full history,
  scroll, and page-state restoration remain excluded.
- The library can ignore malformed or externally edited notes without handing arbitrary content to
  privileged code.
- The shell profile now persists small preference data, but packaged CSP still denies shell network
  access and remote websites remain in a separate session.

## Verification

Unit tests validate desktop-state repair, folder sanitization, constrained frontmatter parsing, and
recursive library discovery. The packaged smoke proves a two-tab native lifecycle and writes then
reads back one `Research` link through the real preload/IPC boundary.
