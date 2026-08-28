# ADR 0015: Read-only local reference index with opaque file identities

**Status: Accepted for Phase 11**

## Context

Lattice pages can point to other canvas pages, objects, HTTPS URLs, documents, images, and files.
Saved-link notes also identify HTTPS resources. Users need backlinks and useful broken-reference
diagnostics, but the renderer must not receive absolute vault paths and Lattice must not guess at
repairs by rewriting Obsidian files.

## Decision

- Build the index on demand in the main process from the existing saved-link and Lattice-canvas
  readers. Do not add a private graph database or a background watcher.
- Address pages and objects by their authored stable IDs. Normalize HTTPS URL fragments away so
  equivalent saved-link and canvas targets share a backlink key.
- Resolve local files only after vault containment, safe-relative-path, canonical-path, and regular
  file checks. Send only a basename and a truncated SHA-256 target key to the renderer; never send
  an absolute or vault-relative path in reference-index results.
- Classify HTTPS destinations as external rather than resolved. Lattice does not issue background
  network requests to test them.
- Show incoming source page/note names and explicit unresolved diagnostics. Repair controls navigate
  to the authored source. They never rewrite, move, rename, or delete a Markdown or Canvas file.
- Expose the index through one trusted-shell IPC method guarded by the existing main-frame and shell
  origin assertion. Remote `WebContentsView` pages receive no new bridge or capability.

## Consequences

The graph stays local, portable, and derived from Obsidian-owned files. It can become stale after an
external editor change until the user re-enters or saves the relevant view. Network availability,
third-party canvases, Obsidian wiki-link parsing, rename inference, and automatic repair remain out
of scope.
