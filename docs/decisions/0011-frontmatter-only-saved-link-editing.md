# ADR 0011: Frontmatter-only saved-link editing

Status: Accepted for Phase 7  
Date: 2026-08-29

## Context

Titles and descriptions often need refinement after a page is captured. Lattice creates the initial
saved-link note, but the note lives in the user's Obsidian vault and may accumulate manual prose,
links, embeds, plugin fields, or sync-provider changes. Regenerating the file from Lattice's model
would risk overwriting user-owned content.

## Decision

- Expose a trusted-shell editor for saved-link title and description only.
- Resolve the target by unique stable UUID; never accept a renderer-supplied filesystem path.
- Validate title and description again in the main process and re-read the note before mutation.
- Replace only the `title` and `description` JSON-compatible YAML scalar lines. Preserve all other
  frontmatter and the complete body byte-for-byte.
- Keep the existing filename, directory, desktop ID, URL, timestamps, and reading state.
- Reuse the guarded update posture: canonical containment, Markdown/Saved Links scope, no
  symlinks/junctions, one-megabyte bound, stale-ID rejection, concurrent size/mtime detection,
  same-directory temporary write, flush, atomic replacement, and cleanup on failure.
- Do not expose this API to remote `WebContentsView` pages; the existing trusted-frame IPC check
  remains mandatory.

## Consequences

The user can improve library metadata without opening Obsidian, while Obsidian remains authoritative
for note content and organization. The card updates from the file that was read back after the
atomic replacement rather than assuming the write succeeded.

The visible Markdown heading and prose generated at initial capture intentionally do not change.
That avoids destructive rewriting but can leave the display title in frontmatter different from the
first body heading. A future schema-aware Obsidian editor or explicit body-edit operation must define
conflict and ownership rules before changing that boundary.
