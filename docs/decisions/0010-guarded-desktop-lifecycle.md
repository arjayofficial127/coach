# ADR 0010: Guarded desktop lifecycle without vault mutation

Status: Accepted for Phase 6  
Date: 2026-08-29

## Context

Lattice desktops group native browser tabs and saved-link notes. Earlier phases supported create and
rename but intentionally left Obsidian folders unchanged. Moving tabs and deleting desktops must not
turn a lightweight browser organization action into an implicit filesystem migration or destroy
user-owned Markdown.

## Decision

- Move a tab by updating its stable tab-to-desktop assignment. Keep the same native tab active and
  do not navigate, reload, close, or recreate its `WebContentsView`.
- Hide the native website view while the overlapping trusted move menu is open so Chromium content
  cannot visually cover or intercept the shell action.
- Permit desktop deletion only when the desktop has zero open tabs and zero saved links, at least one
  other desktop exists, and the user repeats the delete action to confirm.
- After deleting the active desktop, select the adjacent surviving desktop. If it owns a tab, switch
  to that existing native tab; otherwise show the trusted home surface.
- Treat Obsidian as external user-owned storage. Create, rename, move, and delete actions never
  rename, move, delete, or bulk-edit folders or Markdown.
- Persist the resulting workspace and tab assignment through the existing bounded, versioned local
  session model. Keep all remote-site permissions and navigation restrictions unchanged.

## Consequences

Desktop organization is predictable and reversible until the final explicit deletion, while saved
research cannot be silently orphaned or removed. A desktop with saved links must remain until a
future explicit reassignment/archive design exists.

The conservative rule limits convenience: there is no bulk move, saved-link reassignment, desktop
trash, folder migration, or undo. Those capabilities require separate transactional semantics and
adversarial filesystem tests before implementation.
