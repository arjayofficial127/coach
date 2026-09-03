# ADR 0029: A unified local home and research workbench

## Plan and Definition of Done

Implement the approved home/workbench image direction, not its fictional example data:

- One contextual sidebar and one shared tab strip for local files and browser tabs.
- A quiet, content-first home with capture, previews, folders, real dated board cards, and templates.
- A focused editor with optional live research beside it, explicit quote/link insertion into drafts,
  and local board embeds. Preserve rename, split editing, history, and manual Save semantics.
- Preserve local ownership and archive behavior. Do not rewrite or populate user notes implicitly.
- Native website rendering remains a sandboxed WebContentsView without the trusted preload.
  Clip its bounds and hide it for shell overlays and route/profile changes. Stack the source
  beneath the editor on small layouts, hiding the native surface while it is off-screen.
- Test source provenance, unsafe inputs, embeds, real empty/populated states, drafts, resizing,
  menus, and existing source/package/installer gates. Visually inspect the actual UI.
- Commit only this work on main, preserving unrelated existing edits, and stop.

## Decisions and risk notes

The implementation uses the existing local workspace broker, draft cache, and atomic Save flow.
No migration or seed content is needed. The shared sidebar remains desktop-scoped; editor tabs
join the browser chrome while Files is open. Focus hides the contextual tree. Desktop selection,
file and folder renaming, archive behavior, and local-folder Settings remain available.

Home shows actual indexed files and folders. Today is derived from board cards whose local date
is today, with their actual column name; it does not infer completion or display fictional progress.
The focus action opens the existing Pomodoro app. Planner is an empty extensible board `.coach`
object with `defaultView: calendar`, not a separate incompatible format.

Standalone `![[Board.coach]]` renders a bounded preview of the linked local board. Its action opens
the original file beside the note. All edits remain explicit drafts and Save operations. The preview
is not an independent copy and does not recursively execute other objects. Markdown suppresses a
first H1 only when it exactly matches the file title already shown; saved source is unchanged.

Research uses the existing profile's sandboxed WebContentsView. A narrow, trusted-sender-only IPC
reads the active page selection, bounded to 20,000 characters. Provenance is taken from WebContents,
not a caller-supplied URL. Only credential-free HTTPS is supported. A tab or profile change invalidates
an in-flight capture; changing the destination file clears its review. Late research navigation results
are ignored when the profile, desktop, or screen has changed.

Captured text is reviewed as literal React text. Markdown insertion uses a backtick fence longer than
any backtick run in the selection, with a fixed source-link label. Captured markup cannot become a
local link, embed, HTML element, or script. Backlink extraction also ignores these fenced quotations.
The source URL is included, but no note bytes change until Save. Text files receive plain text instead.

Native bounds are clipped to the actual source slot and content stage. Position tracking catches
layout movement without a resize (notices, embeds, title changes); unchanged bounds do not generate
IPC calls. Review, creation/rename controls, the command palette, profile menu, and route changes
hide the remote surface. No remote preload or filesystem capability has been added.
Floating recovery and zoom controls reserve space above the native page so its layer cannot cover
their buttons. Shared file tabs retain the rename-in-progress guard after moving into the tab strip.

## Limits and deferred work

- This phase does not introduce arbitrary `.coach` code execution, AI agents, permanent note deletion,
  automatic link repair, cloud storage, or Obsidian-plugin compatibility.
- The local index remains bounded. Home and connections explicitly inherit its partial-index warning.
  Outside edits require Refresh. Draft/session-history durability remains as documented previously.
- Board embeds are previews with an explicit editor handoff, not fully editable inline copies.
- Quote capture reads the top-level document selection, not all cross-origin frames or PDF viewers.
  If selection is unavailable, the review offers a source link only. Website loading depends on the site.
- The renderer bundle now crosses Vite's advisory 500 kB chunk threshold. No dependency was added;
  code splitting is deferred rather than changing loading boundaries during this feature.
- Portable/installer builds are still unsigned. Installer lifecycle testing uses a disposable directory
  and profile, not the user's installed app or local notes.

## Verification

Completed on 2026-09-03:

- Application-source Biome check and TypeScript passed; Vitest passed 188 tests across 37 files.
- Production build and portable smoke passed. All 20 workspace workflow booleans are true,
  including shared navigation, Home layout, planner creation, linked board editing, explicit source
  capture, remote isolation, overlay safety, and native bounds.
- The unsigned installer passed installation, the same installed-app smoke, hardened-fuse/hash
  verification, and uninstall cleanup. No user installation or notes were replaced.
- Browser-driven visual checks covered the empty/populated Home, editor, source review, and narrow
  focus layout. They caught and fixed collapsed content rows, duplicate matching headings, and
  tab-strip overflow. No browser-preview console errors were reported.
- Evidence and trusted-shell screenshots are retained locally under `artifacts/workspace-vision/`:
  `packaged-smoke-evidence.json`, `installed-smoke-evidence.json`,
  `installer-lifecycle-evidence.json`, `installer-build-evidence.json`, `home.png`, and `workbench.png`.
  Shell screenshots do not composite the separate native website layer; native visibility, bounds,
  isolation, and source selection are independently verified by the Electron smoke probes.
- Installer SHA-256: `d5b20ddc482d8493c6f74ea4e53791de17698641de118ec028f5d76ea54e1702`.
  Packaged source manifest SHA-256: `801912bbd62ed60bc6da15fed9e61a823e71e6de157d7f0e2d55b3f600be15f5`.

The smoke harness uses a visible but unfocused window for resize/scroll verification: hidden
Chromium windows can suspend animation and resize delivery. Quote assertions compare the actual
Chromium selection string, not DOM `textContent`, which has different whitespace semantics.

Repository-wide `biome check .` still reports the pre-existing missing SVG title in
`website/frontend/public/coach-mark.svg` and generated `release/installer-build-evidence.json`
line-ending formatting. The equivalent application-source check (`src`, `scripts`, and root app
configuration), TypeScript, and Vitest are used as scoped gates; unrelated website files and the
lint configuration are not changed. Package output is tested with the existing working-tree browser
changes present, but the focused commit excludes those unrelated edits.

Generated historical smoke artifacts remain uncommitted. Safety review declined their reset to HEAD;
they were left intact rather than overwritten. Fresh feature evidence is preserved separately as above.
