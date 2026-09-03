# ADR 0030: Readable capture titles without renaming files

## Scope and Definition of Done

The user approved hiding generated capture identifiers from everyday titles. Show the human
part of `2026-09-03 - catch this bro - fd1d6b08.md` as `catch this bro`, consistently across Home,
Inbox/recent rows, the local file tree, tabs, editor headings, and incoming-reference labels.
Keep the exact filename, desktop-relative location, and saved timestamp available on demand.
Verify that presentation does not write, rename, move, or delete a file or change link identity.
Commit only this scope on main and stop; larger card redesign and file-naming changes are deferred.

## Decisions

- A renderer-only display helper recognizes the capture writer's complete date/title/eight-hex
  suffix/Markdown-extension pattern, including a valid calendar date. It preserves title case and
  punctuation. Folders, ordinary dated notes, incomplete suffixes, and other file types are not
  shortened. File-oriented labels retain the extension; headings and cards omit it.
- The existing physical filename-stem helper remains unchanged for explicit rename operations.
  Paths and entry IDs still identify files, tab keys, save destinations, and backlink targets.
  New captures still use collision-resistant filenames; there is no storage migration.
- An initially closed, keyboard-operable File details disclosure shows the original filename,
  desktop-relative parent folder, and last-saved date. Absolute device paths remain private.
- Cards use a concise accessible Open label instead of concatenating their title and preview
  into the action tooltip. A matching first Markdown heading remains hidden in Preview only;
  no source text is removed.

## Limits and safety

An independently authored file with the exact generated capture filename pattern will also get
a shortened display label. This is reversible presentation only; File details and the explicit
rename dialog retain the exact name. Equal display titles do not merge files; physical paths and
IDs remain distinct. No automatic title casing, content-derived title migration, link repair,
or filename cleanup is included. Remote website permissions and IPC contracts are unchanged.

## Verification

- App-scoped Biome check: 122 files passed. TypeScript passed.
- Vitest: 204 tests across 38 files passed, including 16 new title regressions.
- Production build passed; the existing advisory bundle-size warning remains (~510 kB).
- Portable smoke and install -> installed smoke -> uninstall lifecycle passed, including the new
  `readableCaptureTitles` gate in both builds. It opens a real disposable capture through Home,
  checks the editor/tab labels, opens File details, inspects and cancels explicit rename, then
  verifies identical saved name, content, and timestamp. All existing isolation gates passed.
- Visually inspected the captured Home and expanded File details screenshots. Evidence copies
  are retained locally under `artifacts/readable-titles-2026-09-03/` (ignored, not committed).
- Source/package manifest match: `faead48a2e5db8a539b23170f6cbbbfa865b758b11e5b5acc79b03d6c4fab88e`.
- The installed smoke logged late `browser:set-visible` calls reporting an unavailable profile
  between its final profile probe and remote-isolation report. The existing harness closes the
  profile runtime before waiting 50 ms while its shell is still alive (`src/main/smoke.ts`).
  The timing is consistent with teardown callbacks, not a title/file failure; assertions and
  lifecycle checks all passed. This pre-existing runtime/harness lifecycle is unchanged, and
  eliminating the teardown race is outside this presentation-only fix.
- The previously documented unrelated root-wide lint findings are not part of this fix. Existing
  unrelated source edits and generated historical smoke artifacts remain outside the commit.
