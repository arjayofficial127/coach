# Phase 1 completion report

Date: 2026-08-28  
Status: **PASS**

## Outcome

Phase 1 turns the Phase 0 security spike into a coherent personal research-browser prototype while
preserving the original trust boundary. The packaged `0.1.0` app presents a polished workspace,
owns multiple native website views, groups tabs into desktops, captures descriptions into desktop
folders, and reads those Markdown files back as a local library.

## Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Static quality | Pass | Biome clean, TypeScript clean, 6 test files and 21 tests passed. |
| Production renderer | Pass | Vite produced a 19.44 kB CSS bundle and 212.25 kB JS bundle before gzip. |
| Visual composition | Pass | Home, library, browser capture drawer, and tab states inspected at the default 1280 × 720 preview. |
| Compact layout | Pass | 920 × 700 viewport had no horizontal document overflow; workspace panel collapsed and capture remained usable. |
| Packaged shell | Pass | `lattice://app/index.html`, strict response CSP, bridge present, 1233 × 822 PNG captured. |
| Native tabs | Pass | Packaged runtime began with 1 view, created a second, switched to the first, closed the second, and returned to 1. |
| Remote isolation | Pass | `WebContentsView`, separate session, no Node/`require`/bridge/`<webview>`, popup and permission denial exercised. |
| Obsidian write | Pass | Atomic note published under `Saved Links\Research`, exact bytes hashed, and no temporary files remained. |
| Library round-trip | Pass | The packaged library reader returned the saved ID, description, and folder. |
| Windows package | Pass | Electron 44.0.0, hardened fuses, ASAR-only loading, Authenticode `NotSigned` as expected. |
| Source binding | Pass | 38 packaged source inputs matched the post-package source manifest. |

Primary machine-readable evidence is
[`artifacts/phase-1/packaged-smoke-evidence.json`](../artifacts/phase-1/packaged-smoke-evidence.json).
The package SHA-256 recorded by the gate is
`a4032c81628889bea5a45b25f975066353182cb237aa7d5ccf331833fc3727f8`.

## Implemented design

### Browser runtime

The main process owns a map of tab IDs to `WebContentsView` and `WebContents` instances. Only the
active view is visible. All tabs share the isolated remote-site session and the same deny-by-default
permission, popup, download, protocol, and client-certificate policies. Closing a tab removes the
child view and closes its contents; closing the last tab creates a fresh blank tab.

### Desktops and shell persistence

The trusted React shell owns named desktop definitions and validates stored preferences before use.
The shell uses `persist:lattice-shell` so those definitions survive restart. Tab-to-desktop
assignment is intentionally session-only in Phase 1; browser-session restoration is a later state
model rather than an implicit persistence side effect.

### Obsidian capture and library

The main process remembers the last non-disposable vault in a small atomic configuration file under
Electron's user-data directory. The renderer never receives a path capability; it can only invoke
validated operations against the active vault.

New links are atomically published beneath `Saved Links/<sanitized desktop>/`. The library reader
is bounded to 2,000 notes, eight directory levels, and 1 MB per file; it skips hidden entries,
symlinks, unrelated Markdown, invalid frontmatter, invalid dates, and non-HTTPS records.

### Visual interface

The Phase 1 shell includes an activity rail, persistent workspace sidebar, desktop counters, native
tab strip, browser toolbar, home/quick-start view, searchable saved-link library, status bar, and a
trusted capture drawer. The drawer occupies layout space rather than overlaying the native website
surface, honoring the `WebContentsView` composition constraint.

## Package

Runnable output:

```text
C:\coach\out\Lattice-win32-x64\Lattice.exe
```

This is an unsigned portable directory. It is not an installer and should not yet be presented as a
production browser. The security and product gaps that block that claim remain in
[`unresolved-risks.md`](unresolved-risks.md).
