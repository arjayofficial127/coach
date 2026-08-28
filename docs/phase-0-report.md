# Phase 0 completion report

Date: 2026-08-28  
Verdict: **PASS**  
Scope: secure Electron/browser/vault/package spike only

## Gate results

| Gate | Result | Observed evidence |
| --- | --- | --- |
| Packaged shell | Pass | Actual URL `lattice://app/index.html`, title `Lattice Phase 0`, React DOM ready, preload bridge present. |
| Production shell policy | Pass | Response CSP uses `connect-src 'none'`; no loopback or WebSocket development allowance. Packaged code ignores `LATTICE_DEV_SERVER_URL`. |
| Real website surface | Pass | Native constructor `WebContentsView` loaded `https://example.com/` with title `Example Domain`. |
| Native layout | Pass | Renderer/preload/IPC reported `{x:0,y:124,width:676,height:527}`; it matched the React slot and ended before the vault panel. |
| Website isolation | Pass | Remote page had no Node `process`, `require`, shell bridge, preload, or `<webview>` API. Shell and site sessions were distinct. |
| Default-deny controls | Pass | User-gesture popup reached Electron's deny handler and returned `null`; geolocation reached the permission-check handler and resolved `denied`. |
| Lifecycle | Pass | The retained child `WebContents` reported destroyed after explicit removal and close. |
| Disposable vault | Pass | Packaged shell created a unique temporary vault with a `.obsidian` directory. |
| Atomic Markdown | Pass | Preload → validated IPC → `VaultService` → atomic writer created `Saved Links/*.md`; 453 bytes read back, hash matched, zero `.tmp` files remained. |
| Windows package | Pass | `Lattice.exe` and `resources/app.asar` launched independently of Vite. Authenticode status was exactly `NotSigned`. |
| Package hardening | Pass | ASAR integrity and ASAR-only loading enabled; RunAsNode, NODE_OPTIONS, CLI inspect, and unnecessary `file://` privileges disabled; cookie encryption enabled. |
| Source/evidence binding | Pass | A 32-file source manifest is embedded beside the ASAR and must match at smoke time; previous PASS artifacts are removed before every run. |
| Static/unit quality | Pass | Biome and TypeScript clean; 4 Vitest files and 16 tests passed. |

## Captured artifact facts

- Electron: `44.0.0`
- Chromium: `152.0.7977.54`
- Packaged Node: `24.18.1`
- Executable size: `244,440,576` bytes
- Executable SHA-256: `c1912f72b0543e87f25568c55b1b4e07a513d5f0ff0597161458285cec824f41`
- ASAR size: `777,412` bytes
- ASAR SHA-256: `a9167fb94d3145d893e854a948c31458b7a08d1251028640238d5b8f86597bce`
- Source-manifest SHA-256: `4a46a573595253a9819808d7f4ef3884bc7347de562be474f757b890666d4dfa`
- Remote screenshot: `845 × 590` PNG, captured from the real site contents
- Screenshot SHA-256: `97bd46a392cb77c63d24c844bead10d7bc5eaf5341f5965da5fe93f0f5c069a0`
- Authenticode: `NotSigned` (expected for Phase 0)

Canonical machine-readable evidence is in
[packaged-smoke-evidence.json](../artifacts/phase-0/packaged-smoke-evidence.json). The visual and data
outputs are [remote-example-com.png](../artifacts/phase-0/remote-example-com.png) and
[packaged-smoke-note.md](../artifacts/phase-0/packaged-smoke-note.md).

## What the smoke actually exercises

1. Launches the packaged `Lattice.exe` with a 30-second timeout.
2. Loads packaged renderer assets through the session-scoped custom protocol.
3. Waits for React's `ResizeObserver` to send usable bounds through the real preload and IPC path.
4. Creates a disposable vault and note through that same packaged bridge.
5. Loads a public HTTPS page in the production `BrowserRuntime` using unique in-memory smoke
   sessions.
6. Exercises permission and popup denial, checks effective JavaScript isolation, captures the site,
   and records native bounds.
7. Explicitly closes the child contents and verifies destruction.
8. Re-reads and hashes the Markdown and screenshot, inspects the executable signature and fuses,
   checks the package-time source manifest, and publishes fresh evidence into the repository.

## Issues discovered during the spike

- Generated `dist` output was initially inside Biome's scan boundary; generated/package directories
  are now excluded.
- `@electron/packager` 20 uses a named `packager` export and requires author metadata; both are now
  explicit.
- The workspace policy rejected Electron Forge's Git-based transitive dependency; the accepted
  registry-only packaging path is recorded in ADR 0004.
- A hidden `WebContentsView` had no capturable display surface on this Windows host. The smoke shows
  the window without focus and falls back to DevTools `Page.captureScreenshot` when Electron's
  native capture remains unavailable.
- Electron 44 can invalidate `view.webContents` after close. `BrowserRuntime` now retains the
  original `WebContents` reference, enabling reliable destruction verification.
- Windows PowerShell execution policy blocked a `.ps1` signature helper. The verifier now uses an
  inline, read-only command with PowerShell 7 and a Windows PowerShell fallback.
- The final audit found Electron's default extra `file://` privileges were unnecessary. That fuse
  is now disabled and asserted from the packaged executable.
- PASS artifacts could previously survive a later failed smoke. The combined `verify:phase0` gate
  now clears them first and binds the package to a deterministic source-manifest hash.

## Boundary and next decision

The gate establishes feasibility, not browser completeness. The full interface, tabs/desktops,
saved-link library, production Obsidian UX, installer, updater, and code signing remain outside
Phase 0. See [unresolved-risks.md](unresolved-risks.md) before authorizing Phase 1.
