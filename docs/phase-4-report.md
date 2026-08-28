# Phase 4 completion report

Date: 2026-08-29  
Status: **PASS**

## Outcome

Phase 4 gives the user explicit control over continuity and local authority. The packaged `0.4.0`
app adds a polished Settings surface, reports cookies and cache from the isolated remote-site
profile, clears website data through a deliberate two-step action, makes tab restoration optional,
and disconnects an Obsidian vault without deleting any files. No remote permission was relaxed.

## Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Static quality | Pass | Biome clean, TypeScript clean, 9 test files and 31 tests passed. |
| Production renderer | Pass | Vite produced a 26.26 kB CSS bundle and 228.31 kB JS bundle before gzip. |
| Settings UX | Pass | Full and compact layouts, switch state, clear confirmation, and vault lifecycle inspected. |
| Website-data summary | Pass | Packaged profile reported a seeded cookie and 3,854 cached bytes. |
| Website-data clearing | Pass | Cookies, local storage, Cache Storage, HTTP cache, IndexedDB/service-worker classes, and auth cache cleared in the isolated remote session. |
| Continuity preference | Pass | Validated versioned setting controls whether saved tabs are read or written at launch. |
| Vault disconnect | Pass | Main process forgot the active vault while the packaged Markdown note remained present and readable. |
| Prior-phase regression | Pass | Native tabs, restart reconciliation, command composition, reading transitions, and library projection passed. |
| Remote isolation | Pass | Separate `WebContentsView` session; Node, bridge, popups, permissions, downloads, and unsafe protocols denied. |
| Windows package | Pass | Electron 44.0.0, hardened fuses, ASAR-only loading, Authenticode `NotSigned` as expected. |

Primary machine-readable evidence is
[`artifacts/phase-4/packaged-smoke-evidence.json`](../artifacts/phase-4/packaged-smoke-evidence.json).
The final executable and source-manifest hashes are recorded in that file.

## Implemented design

### Remote profile privacy

The main process owns the persistent `persist:lattice-remote` session and exposes only a summary
(`cookieCount`, `cacheBytes`) plus one full clear operation. The clear action covers cookies, HTTP
cache, local storage, IndexedDB, Cache Storage, service workers, file systems, WebSQL, background
fetch, and authentication cache. It never targets the trusted shell session or filesystem.

The Settings button requires a second explicit confirmation because clearing data can sign the user
out. The packaged gate seeds a cookie, local-storage key, and Cache Storage entry in the isolated
website view, clears them, and behaviorally proves all three are absent.

### Continuity control

The restore-tabs preference is a versioned, validated trusted-shell record. Disabling it immediately
removes the restorable session record, prevents further session writes, and causes the next launch
to start fresh. Desktop definitions remain intact.

### Non-destructive vault lifecycle

Disconnect clears only Lattice's active vault capability and remembered configuration path. It does
not traverse, modify, or delete the selected vault. The packaged smoke disconnects its disposable
vault and then verifies the previously written Markdown file still exists.

## Package

Runnable output:

```text
C:\coach\out\Lattice-win32-x64\Lattice.exe
```

This remains an unsigned portable directory, not an installer. Remaining release and browser
capability gaps are tracked in [`unresolved-risks.md`](unresolved-risks.md).
