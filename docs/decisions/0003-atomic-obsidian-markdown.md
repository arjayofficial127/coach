# ADR 0003: Publish new Obsidian notes atomically without overwrite

Status: Accepted; amended for Phase 1  
Date: 2026-08-28

## Context

Lattice must save links and descriptions as normal Markdown files that Obsidian can discover. A
crash or concurrent save must not expose a partially written note or overwrite an existing note.
Remote website content must never choose arbitrary filesystem paths.

## Decision

The main-only `VaultService` owns one canonical active-vault path. The renderer receives an opaque
ID and display path, not a filesystem capability. A disposable vault is created beneath the OS
temporary directory with an `.obsidian` marker for the Phase 0 proof.

Each saved link is placed under `Saved Links/<sanitized desktop>` and contains quoted YAML
frontmatter plus a readable Markdown body. The filename uses a sanitized title, date, and UUID
suffix.

Publication is an atomic **create**, not an atomic replacement:

1. Canonicalize the vault and enforce path containment.
2. Reject symbolic links or junctions in the created note-directory path.
3. Open a unique temporary file in the final directory with exclusive-create semantics.
4. Write UTF-8 content, sync the file, and close it.
5. Create a hard link from the temporary file to the unique final name. This atomically exposes the
   complete bytes and fails if the destination already exists.
6. Unlink the temporary name. On failure, close and remove the temporary file.

## Consequences

- Obsidian sees either no note or the complete note; it never sees a partially written final file.
- Existing files are never overwritten.
- Same-directory hard-link publication depends on filesystem support. NTFS is the primary Phase 0
  target; network, FAT, cloud, and unusual sync-backed vaults need compatibility work.
- File sync does not guarantee parent-directory durability across sudden power loss on every
  filesystem.
- A crash after final-link creation but before temporary-name removal can leave a hidden temporary
  hard link beside a valid complete final note; startup cleanup is not implemented yet.
- Containment and reparse-point checks reduce risk but do not eliminate filesystem TOCTOU races.

## Verification

Unit tests cover rendering, Windows filename and folder sanitization, containment, successful
publication, and destination collision. The packaged Phase 1 smoke creates the vault and note
through preload and IPC, recomputes SHA-256, verifies the `.obsidian` directory and
`Saved Links\Research` path, finds zero temporary files, and reads the same record back through the
library parser.
