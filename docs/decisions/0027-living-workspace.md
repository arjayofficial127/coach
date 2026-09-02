# ADR 0027: Living workspace Home and rich local editor

## Scope and Definition of Done

Build the two approved Coach concepts on main: a content-led Home with real recent files and Inbox,
and a compact nested file tree with rich Markdown and interactive `.coach` boards in split view.
All content comes from the connected desktop; no synthetic activity or decorative metrics ship.

- Home, Files, and Recent navigation retains open drafts and displays honest empty/loading states.
- Folder creation and editable files work at root and nested levels; Explorer stays secondary.
- Markdown supports safe formatted preview, checklists, tables, links, and insertion tools.
- Version-1 `.coach` boards support editable cards and status, table and calendar views, and raw JSON.
- Split panes, file tabs, local save status, context links and unresolved-link diagnostics work.
- No remote images or HTML execute in the trusted shell; local paths stay relative.
- Dirty drafts survive view switches; saves preserve edits made during an in-flight save.
- Focused automated tests, typecheck, build, packaged smoke, and installer smoke pass before commit.
- Preserve unrelated user changes and document limits explicitly.

## Decisions

- Add a separate `WorkspaceStudio` renderer and dedicated token-based stylesheet; the shell keeps
  its existing desktop selection, browser tabs, website profiles, and native browser visibility rules.
- Home displays real recent-file previews, Inbox entries, capture actions, and cards due today.
  Empty desktops invite creation instead of displaying invented notes, counts, or activity.
- Use the existing trusted desktop-relative file broker for a bounded read-only index: at most 80
  directories, 2,000 entries, and 64 previewable documents; preview reads skip files over 128 KB and
  stop at a 2 MB aggregate budget. A partial-index notice is shown when limits or read failures occur.
  Folder navigation can still open locations outside that preview budget.
- Add `coachKind: board` to file creation without adding arbitrary paths or execution permissions.
  Version-1 boards have titled columns and cards with a status, optional date, and optional note link.
  Main validates known board structure, duplicate identifiers, cardinality, and real calendar dates.
  Visual changes preserve unknown JSON properties; unsupported kinds keep the source editor.
- Render Markdown as React elements, not injected HTML. Headings, emphasis, code, checklists, tables,
  quotes, and note/source links work. Remote images are represented by explicit links, never fetched
  into the trusted shell. HTTPS navigation remains an explicit action through the normal browser.
- Resolve local links relative to the source and desktop root, with unambiguous basename fallback.
  Absolute paths, hidden metadata paths, root escapes, unsafe protocols, and credential URLs are
  blocked. Ambiguous/missing targets explain manual repair; no automatic filesystem changes occur.
- Open at most 12 files per desktop session. Drafts and previous-save copies live only in renderer
  memory, keyed by website profile, vault identity, and desktop. Session notifications reconcile
  in-flight saves with newly typed drafts even after navigating away and back. No unscoped storage
  of private note bodies is introduced. Explicit reload confirms draft discard.
- Keep browser-source capture honest: it captures the active tab's title and URL, not remote DOM,
  page selections, or an AI summary. Inbox filing/moves and note deletion remain out of scope.
- Editor errors show only allowlisted product diagnostics; unknown filesystem failures use a
  path-free fallback. Windows sharing violations found in packaged checks now use the existing
  bounded atomic-replacement retry for workspace metadata and file saves.

## Remaining limits and risks

- Session history retains five previous saves in memory; it is **not** durable backup or crash
  recovery. Closing Coach loses these copies. Save files normally and maintain an external backup.
- The index is bounded and refreshed explicitly/on local writes, not filesystem-watched. Counts and
  backlinks describe indexed files only. Heading/block fragments are not independently validated.
- This is a supported Markdown subset, not full CommonMark or WYSIWYG.
  Markdown previews and reference extraction cap at 100,000 characters; oversized previews are
  read-only, with the full file retained in Write. Link-token lengths are bounded to avoid pathological
  scans of malformed text. Binary previews, arbitrary executable builders, drag/drop file moves,
  note deletion, durable version storage, merge tooling,
  and arbitrary object plug-ins are not included. `.coach` remains inert structured data.
- Save concurrency uses the existing timestamp check and atomic sibling replacement. It preserves
  drafts against ordinary outside edits but does not eliminate hostile local filesystem TOCTOU races.
- Nested tree and split panes adapt to available space. Large boards scroll horizontally; compact
  editor widths stack the two files without discarding either draft.

## Verification

- Application source lint, TypeScript, and 161 tests passed (including safe Markdown rendering,
  link resolution, index limits, in-flight draft preservation, board schema/round-trip, external
  save conflicts, and junction escape rejection).
- Browser preview exercised creating Markdown and board files, editing/saving, rendered checklists
  and tables, linked cards, split opening, and preview-bridge Inbox capture. Native date-picker
  keyboard input saved a card date and surfaced it in Today and Calendar. An unsaved note survived
  leaving Files for Dashboard and returning; its test draft was then restored to the saved content.
- Root `pnpm run package` currently stops on a pre-existing untracked
  `website/frontend/public/coach-mark.svg` accessibility error. The unrelated website is unchanged.
  Equivalent app-scoped lint, typecheck, tests, build, and package stages are used for Coach.
- Final packaged smoke and NSIS installer lifecycle passed on September 3, 2026 (local time).
  Both require Home, Markdown, board save/readback, split, Inbox, draft retention, Table, and Calendar
  gates. The existing remote WebContentsView isolation, hardened fuses, profiles, desktop archive,
  saved-link, Canvas, and privacy gates also passed. Windows metadata-lock warnings no longer occurred.
- Installer bytes match the hardened portable package. The disposable installation, uninstall
  registry entry, and Start-menu shortcut were removed by the lifecycle gate; no real notes or
  existing installation were replaced. The installer remains unsigned.
- Final source manifest: `77854d0daf02197c6a723c244d3b8c5f06ee411e648e26b52adec6bf83535c13`.
  Fresh Home/editor screenshots were visually inspected. Local evidence copies live in ignored
  `artifacts/workspace-studio/`; tracked earlier-phase evidence is restored to avoid unrelated churn.
