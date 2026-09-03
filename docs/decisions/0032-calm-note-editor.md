# ADR 0032: A calm, directly editable note page

## Scope and Definition of Done

Implement the approved calm-note concept on main. An opened note uses one compact header,
readable document width, direct body editing, optional folders/search, a saved/dirty status and
Save only when needed. Secondary actions remain reachable. Source, draft, explicit reload,
history, rename, board, split, and research safety must remain intact. Source tests, packaged
smoke and installer lifecycle must pass before a focused commit. No unrelated queued task is
part of this request.

## Decisions

- The main note toolbar is portaled into the workspace header; the second split document keeps
  its own small toolbar so its Save action cannot accidentally target the first document.
- Opening a note preserves the Coach shell's existing expanded/compact navigation state and
  leaves folder navigation visible. The folder toggle controls only that local file sidebar;
  Focus remains the sole explicit action that changes the distraction-free shell. Breadcrumb
  buttons return to Home or the actual note's parent folder. New and search remain in the folder
  sidebar. Home/folder browsing keeps its existing controls. Browser and file tabs remain shared
  with the shell.
- Note tools is a keyboard-accessible disclosure, not a fake ARIA menu. It closes on Escape,
  outside pointer, focus leaving, or choosing an action. Escape returns focus to the trigger.
  Source/preview, research, split, history, details, connections, rename, reload, refresh and
  Explorer remain explicit actions. Connections is never a permanent zero-count bar.
- Direct editing is a plain Markdown-body editor styled as a page, not a WYSIWYG serializer.
  It retains unsupported Markdown verbatim. Source exposes the entire file; Preview uses the
  existing safe React renderer, never arbitrary HTML. Text and Coach-object editors remain.
- The clean Markdown view retains an exact source prefix: frontmatter and a matching leading
  H1. Only a known Inbox capture's matching title-only first paragraph is additionally folded
  into that prefix. The original bytes remain in the file and full source editor. Appending to
  a title-only capture adds a paragraph separator; it does not replace the captured thought.
  Ordinary repeated prose, mismatched headings, file names and links are not rewritten.
- Saving remains explicit (Save or Ctrl+S). The actual save broker, conflict checking, session
  history, unsaved-draft protection and local filesystem authority are unchanged. There are no
  new IPC operations, network calls, permissions or executable Coach-object capabilities.
  Successful saves use the toolbar status only, without a duplicate success banner; failures
  and conflict notices remain visible.
- Tools/block disclosures suspend the remote research WebContentsView through the existing
  suspension path. Native bounds, isolation and overlay gates remain mandatory.

## Verification

- App-scoped Biome passed over 126 files (80 existing warnings, 3 existing informational
  suggestions). TypeScript passed. All 237 tests across 40 files passed, including 15 new tests
  for reversible page/source projection, metadata/CRLF retention, generated-title presentation,
  ordinary prose, meaningful indentation, inert hostile input, and idle/dirty/saving controls.
- The first portable functional run passed, but screenshot inspection caught the CSS grid
  auto-placing the content shell in a collapsed navigation column. Explicit placement fixed
  this; the gate now requires a full-width stage, readable note/source widths, a compact header,
  and containment. The rejected screenshot and original evidence are retained locally under
  `artifacts/calm-editor-2026-09-03/attempt-1-*` (ignored).
- The corrected portable run passed and its calm-note screenshot was visually inspected.
  Packaged journeys exercise the actual visible disclosures, Ctrl+S, exact source access,
  preserved capture prefix, history-as-draft, reload cancellation and explicit discard, restored
  folder navigation, Escape focus recovery, and existing board/split/rename journeys. The native
  source is also checked hidden while the new Note tools disclosure is open, then restored.
- Final production builds and portable smoke passed, including the single-save-indicator
  assertion. The unchanged installer retry passed install, full installed smoke and uninstall;
  portable and installed bytes matched, hardened security fuses remained intact, and uninstall
  removed the disposable application and registration without configuring user-data deletion.
  The final installed calm-note screenshot was visually inspected. Final build, portable,
  installed and lifecycle evidence is retained in `artifacts/calm-editor-2026-09-03/` (ignored).
- The first installed run of that final build hit the existing 180-second timeout after
  `workspace board created`, during the path leading to the editor screenshot, without reporting
  an assertion failure. The preceding portable run passed. The disposable test installation
  was verified against the package manifest before using its uninstaller; the unchanged gate
  retry passed without increasing timeouts or weakening assertions. The timeout's cause is not
  proven; intermittent smoke/capture timing remains a test-harness risk.
- Final source/package manifest:
  `f913626a16d9ff1ce8aa70b653bf8cce8fcf8a92034857f7300a3deee0763d47`.
- Final `Lattice-Setup-0.16.0.exe` SHA-256:
  `8c870191fca9390d8b21f2e5124f0bccad99bd554c5f343f355b6fd7ba1b235b`.
- The sidebar-preservation follow-up passed TypeScript, all 237 tests and the unchanged packaged
  smoke gate. The first packaged attempt hit the same intermittent 180-second hidden-window
  capture timeout after `workspace board created`; its unchanged retry passed. The smoke gate now
  records the shell navigation mode before opening a note and requires that mode plus the visible
  file sidebar to remain unchanged afterward. Its final screenshot was visually inspected.
- Production renderer is approximately 515 kB (143.7 kB gzip); the existing >500 kB advisory
  remains. The installer remains unsigned. Full repository-wide lint still includes unrelated
  website/generated-artifact issues; app-scoped validation is recorded rather than claiming
  `pnpm check` is clean. No unrelated source/artifact changes are staged with this work.

## Known limits and risks

- This is intentionally not a new rich-text document model; inline Markdown syntax is visible
  while writing. Preview and complete source are one disclosure away.
- A filename rename still does not rewrite internal H1s, capture text or incoming links. A
  mismatched internal title remains visible rather than being guessed away.
- Session history is not durable versioning. Existing conflict/error notices and partial-index
  notices stay visible even though routine status chrome is reduced.
- Existing unrelated dirty source, release artifacts and repository-wide lint issues remain
  outside this change. Their presence must be recorded with final validation evidence.
