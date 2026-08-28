# ADR 0007: Keep reading state in the saved Markdown note

Status: Accepted for Phase 3  
Date: 2026-08-29

## Context

A reading queue should remain useful in Obsidian and survive removal of Lattice. Storing queue state
only in renderer storage or a private database would split ownership, drift from renamed files, and
make the user's reading intent invisible to other local tools. Allowing the renderer to submit file
paths would unnecessarily widen its filesystem authority.

## Decision

- Store `reading_status`, `queued_at`, and `read_at` in each saved-link Markdown note.
- Treat missing Phase 1/2 fields as the backward-compatible `saved` state.
- Accept reading transitions from the trusted shell by stable UUID and a three-value status enum
  only; never accept a renderer-supplied path.
- Resolve the note through the bounded library, reject duplicate IDs, verify containment and link
  safety, confirm the note ID again, and replace through a flushed same-directory temporary file.
- Preserve the Markdown body and unrelated frontmatter during a transition.
- Project the queue across desktops because reading intent is global while desktop membership
  remains available on every record.

## Consequences

- Obsidian, sync tools, and local scripts can inspect the same reading state as Lattice.
- External edits are visible after refresh and common concurrent edits fail closed.
- Stable-ID lookup costs a bounded library scan; an index can be introduced later as a rebuildable
  cache, not a new source of truth.
- Atomic replacement is proven on the current Windows/local-filesystem gate; cloud and network
  provider behavior remains in the risk register.

## Verification

Unit tests prove queue capture, queued/read/requeued transitions, body preservation, temporary-file
cleanup, and wrong-ID rejection. The packaged smoke exercises the real preload/IPC boundary,
re-reads the resulting Markdown, verifies the queue UI, and checks the native website view remains
hidden beneath trusted queue content.
