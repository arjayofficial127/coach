# ADR 0008: Keep privacy controls scoped to the isolated website profile

Status: Accepted for Phase 4  
Date: 2026-08-29

## Context

Lattice intentionally persists remote-site cookies and cache so ordinary websites can retain login
state. Without user controls, that profile has an unclear retention lifecycle. Clearing the trusted
shell session would erase workspace intent and mix trust domains; exposing Electron's session API
to the renderer would grant excessive authority.

## Decision

- Keep the website profile and trusted shell in separate Electron sessions.
- Expose a narrow summary of remote cookies and cache bytes, not cookie contents or origin details.
- Expose one all-or-nothing website-data clear action in the main process, covering browser storage,
  caches, service workers, and auth cache.
- Require an explicit second confirmation in trusted UI and explain that websites may sign out.
- Store the restore-tabs preference as a validated versioned shell record; disabling it removes the
  saved session immediately.
- Disconnect a vault by dropping the capability and remembered configuration only. Never delete or
  rewrite vault content as part of disconnect.

## Consequences

- Users can reset remote browsing state without losing Lattice desktops, settings, or Obsidian
  knowledge.
- The shell sees aggregate counts only and does not become a cookie inspector.
- Clearing is intentionally profile-wide; per-origin retention and multiple/incognito profiles
  remain future work.
- Disconnect is safely reversible by choosing the same vault again.

## Verification

Unit tests cover settings repair and opt-out parsing. Browser QA covers the confirmation, summary,
switch, and vault states at full and compact widths. The packaged smoke seeds and clears three
storage mechanisms in the real isolated session, verifies the Settings summary, and proves vault
disconnect preserves the Markdown file.
