# Phase 2 completion report

Date: 2026-08-28  
Status: **PASS**

## Outcome

Phase 2 makes Lattice usable as a continuous personal workspace. The packaged `0.2.0` app restores
bounded HTTPS tab sessions with stable desktop membership, exposes one local command surface for
desktops/tabs/saved links/actions, forwards browser shortcuts from native website views, and adds
safe desktop rename and session reset controls. The Phase 0 trust boundary remains unchanged.

## Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Static quality | Pass | Biome clean, TypeScript clean, 7 test files and 26 tests passed. |
| Production renderer | Pass | Vite produced a 22.46 kB CSS bundle and 221.11 kB JS bundle before gzip. |
| Visual composition | Pass | Tab labels, workspace menu, rename state, search ranking, and command overlay inspected at 1280 px. |
| Compact layout | Pass | Command palette inspected at 920 × 700 with no horizontal overflow. |
| Session continuity | Pass | Packaged renderer reloaded over two live native tabs and reconnected to both without duplication. |
| Desktop continuity | Pass | Restored Example Domain to Build with the correct one-tab desktop count. |
| Global commands | Pass | `Ctrl+K` opened the trusted command palette and hid the native website view beneath it. |
| Native tabs | Pass | Create, switch, close, title propagation, and teardown passed in the package. |
| Remote isolation | Pass | Separate `WebContentsView` session; Node, preload bridge, popups, permissions, downloads, and unsafe protocols denied. |
| Obsidian write | Pass | Atomic note retained both sanitized folder and stable `desktop_id`; no temporary files remained. |
| Windows package | Pass | Electron 44.0.0, hardened fuses, ASAR-only loading, Authenticode `NotSigned` as expected. |
| Source binding | Pass | Packaged source inputs matched the post-package source manifest. |

Primary machine-readable evidence is
[`artifacts/phase-2/packaged-smoke-evidence.json`](../artifacts/phase-2/packaged-smoke-evidence.json).
The final package hash and exact source-manifest hash are recorded in that file.

## Implemented design

### Bounded session restoration

The shell stores at most 24 restorable tab records. A record contains only an HTTPS URL (or
`about:blank`), stable desktop ID, and active flag. Stored data is parsed defensively against the
currently valid desktops. On a cold runtime Lattice creates the saved native tabs and removes the
placeholder tab. On a shell reload it reconciles URLs to already-live native tabs, including
duplicates, instead of creating another set.

This is continuity, not a full browser history snapshot: page history stacks, form state, scroll,
and back-forward cache state are not persisted.

### Commands across the native boundary

The trusted React command palette ranks local actions, desktops, tabs, and saved Markdown before an
optional web-search action. A website `WebContentsView` intercepts only the supported accelerator
keys and sends a narrow command enum to the trusted shell. When the palette opens, the native view
is explicitly hidden so an untrusted website cannot draw above trusted command UI.

### Stable desktop identity

Desktop display names can change while IDs remain stable. New Markdown notes store both the
human-readable folder and `desktop_id`; library filtering prefers the ID and falls back to folder
name for legacy Phase 1 notes. Rename deliberately does not move existing folders, avoiding hidden
bulk filesystem changes or collisions.

## Package

Runnable output:

```text
C:\coach\out\Lattice-win32-x64\Lattice.exe
```

This is an unsigned portable directory, not an installer. Remaining release and browser-capability
gaps are tracked in [`unresolved-risks.md`](unresolved-risks.md).
