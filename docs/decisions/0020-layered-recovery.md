# ADR 0020: Layer recovery by ownership and reversibility

**Status:** Accepted — 2026-08-29

## Context

Lattice combines browser views, trusted shell state, append-only personal apps, and user-owned
Obsidian files. A single universal undo mechanism would either lie about what can be restored or
require Lattice to retain private website and filesystem state it should not own.

## Decision

Use three recovery layers:

1. The trusted shell offers one visible 10-second recovery action for its latest reversible command.
2. Canvas owns a bounded 100-step draft Undo/Redo stack and dirty-navigation guard.
3. Vault removal is a same-vault atomic rename into `.lattice-trash`; restore is permitted only to
   the original contained path and never overwrites a collision.

Destructive Electron operations without a sound inverse use confirmation instead of a false Undo.
Domain corrections in Pomodoro, Daily Flow, and Wealth Lab retain their established activity/history
semantics after the short interaction-level recovery window.

## Consequences

- `Esc`, visible recovery actions, and `Ctrl+Z` provide a predictable escape route.
- Lattice does not serialize remote website state or create a private vault database.
- Only the newest global action has one-click recovery, while trashed vault files remain manually
  recoverable on disk.
- Full multi-action history, crash-persistent recovery tokens, and automatic trash retention remain
  future policy decisions.
