# Lattice — Phase 4

**Status: PASS (2026-08-29).** Lattice is a working personal research browser with secure native
website tabs, restart-safe desktops, fast local search, Obsidian-compatible saved links, and a
durable reading queue plus explicit privacy controls.

![Packaged Phase 4 settings](artifacts/phase-4/phase-4-shell.png)

## What works

- Real HTTPS websites render in isolated native `WebContentsView` tabs.
- Tabs retain their URL, active state, and desktop membership across app restarts.
- The global command palette searches actions, desktops, open tabs, saved links, and the web.
- `Ctrl/Cmd+K`, `L`, `T`, and `W` work even while a native website has focus.
- Desktops can be created and safely renamed; rename never silently moves Obsidian folders.
- A desktop session can be reset with **Close all tabs**.
- An Obsidian vault can be selected once and restored on the next launch.
- Pages can be queued during capture, marked read, or queued again from the local library.
- Reading state lives in the Markdown note and works across every desktop without a private
  database.
- Settings report cookies and cache from Lattice's isolated website profile.
- Website cookies, cache, local storage, IndexedDB, service workers, and related data can be cleared
  through an explicit two-step action.
- Tab restoration can be disabled, and a vault can be disconnected without deleting Markdown.
- Saving a page atomically writes Markdown under `Saved Links/<Desktop>/` with a stable desktop ID,
  URL, title, and description.
- The in-app library reads those files recursively and filters them by desktop or text.
- Phase 0's isolation remains intact: remote pages have no Node, preload, Lattice bridge, filesystem
  access, downloads, popups, device permissions, or non-HTTPS navigation.

## Run it

Prerequisites are Node.js 24+ and pnpm 11.19.0. Install dependencies once:

```powershell
pnpm install --frozen-lockfile
```

Start the high-iteration development loop:

```powershell
pnpm start
```

Renderer edits hot-reload. Main/preload edits rebuild and restart Electron automatically. You do
**not** reinstall Lattice after each change; rebuild the package only when testing packaged
behavior.

Run the quality and release gates:

```powershell
pnpm run check
pnpm run package
pnpm run smoke:packaged
pnpm run verify:phase4
```

The unsigned Windows x64 app is generated at
`out/Lattice-win32-x64/Lattice.exe`. It is a portable application directory, not an installer.
Windows reputation warnings are expected until a later phase adds code signing and installation.

## Evidence and decisions

- [Phase 4 report](docs/phase-4-report.md)
- [Packaged smoke evidence](artifacts/phase-4/packaged-smoke-evidence.json)
- [Packaged Settings screenshot](artifacts/phase-4/phase-4-shell.png)
- [Real WebContentsView screenshot](artifacts/phase-4/remote-example-com.png)
- [Generated queued Markdown](artifacts/phase-4/packaged-smoke-note.md)
- [Remaining risks](docs/unresolved-risks.md)
- [Architecture decisions](docs/decisions/)
- [Historical Phase 3 report](docs/phase-3-report.md)

The packaged evidence is bound to the exact source manifest used to build it. The smoke gate also
checks Authenticode state, Electron fuses, CSP, session separation, effective remote isolation,
native tab lifecycle, reload reconciliation, command/native-view composition, layout bounds,
screenshot hashes, atomic reading-state transitions, privacy clearing, non-destructive vault
disconnect, and library read-back.

## Current phase boundary

Phase 4 intentionally does not add downloads, OAuth popups, browser extensions, site permissions,
an installer, updates, code signing, full history/scroll restoration, or Chrome-equivalent Safe
Browsing. Those capabilities require explicit policy and security work; see the risk register
before Phase 5.
