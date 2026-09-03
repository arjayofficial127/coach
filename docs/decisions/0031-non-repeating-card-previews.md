# ADR 0031: One capture title per Home card

## Scope and Definition of Done

The user reported a capture appearing three times on one card: its display title, followed by a
preview containing the generated Markdown heading and the identical body. A title-only capture
must show its title once, without a redundant excerpt or filler message. Additional content must
still appear. This is a card presentation fix on main, not a note migration or editor redesign.

## Decision

The preview helper accepts the title already displayed by the card. It omits a matching leading
H1 and immediately following title-only paragraphs, comparing whole blocks with whitespace
normalized before the 180-character excerpt limit is applied. It does not remove matching phrases
inside longer paragraphs, later in the body, or in quoted/code blocks. Empty excerpts omit the
preview paragraph; unindexed documents still say to open the file rather than implying emptiness.
Board previews remain unchanged.

This operates on a local string only. Existing files, capture storage format, IDs, filenames,
drafts, source-editor contents, and links are unchanged. No filesystem or IPC capability is added.
Differently worded titles are not guessed or automatically reconciled with saved content.

## Verification

The card-rendering regressions cover the reported triple repetition, legacy capture frontmatter,
CRLF/whitespace, meaningful additional content, title substrings, quotes/code, preview limits,
unindexed content, and immutable input documents. The packaged/installer workspace gate now
requires exactly one occurrence of the capture title on its Home card and no preview paragraph;
the existing gate checks saved content, name, and timestamp remain unchanged afterward.

- App-scoped Biome: 123 files passed. TypeScript passed. Vitest: 222 tests across 39 files passed,
  including 18 new card-preview tests.
- Production build and unsigned installer build passed. The existing ~510 kB bundle warning
  remains unchanged in significance.
- The first portable smoke attempt exceeded the existing 180-second limit after the Daily Flow
  progress marker and before workspace tests, without an assertion failure. The unchanged build
  was rerun; it passed the new card assertion and all workspace journeys, but the outer gate
  compared the final native rectangle's right edge (1002) to the initial vault boundary (1001.6)
  captured before resize/restore. This mixed-state layout check was corrected: final content size
  and vault boundary are now sampled alongside the final native bounds. Both portable and
  installed checks enforce containment and non-overlap with no tolerance added. Browser runtime
  behavior and production security boundaries are unchanged.
- Failed-attempt source/package manifest:
  `d0268bf07bcbca73a8919b4fdb93e03db2291fcbd4f62deee9e2cc18bcddaf9f`.
  Failed evidence and the visually inspected title-only card screenshot are retained under
  `artifacts/card-preview-2026-09-03/` (ignored).
- The corrected portable gate passed. Its initial content size was 1001 x 722 DIP and final
  content size was 1002 x 723 DIP, confirming the measurements had changed after resize/restore.
  Final native bounds fit both the current content size and current vault boundary.
- Final source/package manifest:
  `b3cd0689d5f9fae519f9c5fab94599f63a8049d2b5985a9b35607ac826fa1d1f`.
- Final portable smoke and install -> installed smoke -> uninstall lifecycle passed. Both runs
  exercised the exactly-once card assertion and strict current-state layout checks. Successful
  evidence, installer hashes, and Home screenshots are preserved in the same local artifact folder.
- Existing unrelated source edits, historical generated artifacts, and the previously documented
  repository-wide lint issues remain outside this focused commit.
