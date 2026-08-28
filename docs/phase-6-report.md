# Phase 6 completion report

Date: 2026-08-29  
Version: 0.6.0  
Result: PASS

## Outcome

Phase 6 makes desktop organization safe and usable. A live native website tab can move between
desktops without being recreated, reloaded, or detached from its `WebContentsView`. A desktop can
be deleted only after it has no open tabs and no saved links, and only after a second explicit
confirmation. At least one desktop always remains.

Desktop lifecycle actions operate only on Lattice's local workspace/session preferences. They do
not rename, move, delete, or otherwise modify Obsidian folders or Markdown. Existing saved links
remain associated through their stable desktop ID and original folder metadata.

No remote-site capability was relaxed. Downloads, popups, permissions, non-HTTPS navigation, Node,
preload, and the trusted shell bridge remain denied to websites.

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Pure desktop lifecycle invariants | PASS | Unit tests cover known tab moves, occupied/saved/last-desktop guards, deletion, and adjacent selection |
| Live native tab move | PASS | Packaged smoke moves the active `WebContentsView` tab from Build to Inspiration without changing its native tab ID |
| Trusted menu composition | PASS | Packaged smoke proves the native website view is hidden while the overlapping move menu is open |
| Occupied desktop guard | PASS | Delete is rejected while Build owns an open tab |
| Explicit destructive confirmation | PASS | Empty Build requires two delete actions before removal |
| Obsidian preservation | PASS | Research retains its saved count and the generated Markdown survives vault disconnect and desktop lifecycle actions |
| Installer lifecycle | PASS | Version 0.6.0 installs for the current user, passes the full desktop/security/Markdown smoke, and uninstalls cleanly |
| Regression suite | PASS | Formatting, TypeScript, 34 tests, production build, package fuses, privacy clearing, isolation probes, and evidence hashes pass |

Machine-readable evidence:

- [`artifacts/phase-6/packaged-smoke-evidence.json`](../artifacts/phase-6/packaged-smoke-evidence.json)
- [`artifacts/phase-6/installed-smoke-evidence.json`](../artifacts/phase-6/installed-smoke-evidence.json)
- [`artifacts/phase-6/installer-lifecycle-evidence.json`](../artifacts/phase-6/installer-lifecycle-evidence.json)

## Development workflow

Use `pnpm start` during implementation. Renderer edits hot-reload and main/preload edits rebuild and
restart Electron; reinstalling after each change is unnecessary. The complete release gate is
`pnpm run verify:phase6`.

The repository workflow in `AGENTS.md` now records the requested default: implement the queued phase,
verify it, create a focused commit only after its gates pass, then continue to the next queued task.

## Deliberate boundary

Phase 6 does not bulk-migrate Markdown when a desktop changes, reassign saved links, reorder or
archive desktops, or add a trash/recovery model. It also does not add downloads, OAuth popups,
extensions, site permissions, signing, or automatic updates. Each remains a separate product and
security decision for a later phase.
