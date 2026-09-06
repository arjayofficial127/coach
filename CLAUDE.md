# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Lattice / "Coach Browser" (`package.json` name is `lattice`, product name is `Coach Browser`): an
Electron desktop research browser. Websites render in isolated native `WebContentsView` tabs; all
durable user data is plain files (Obsidian-compatible Markdown, JSON Canvas `.canvas`, versioned
`.coach` JSON) in a user-selected local folder — there is no application database.

Requires Node.js 24+ and pnpm 11.19.0.

## Commands

```powershell
pnpm install --frozen-lockfile
pnpm start                # build main+preload, then vite dev server + auto-restarting Electron
pnpm run check            # the gate: biome check . && tsc --noEmit && vitest run
pnpm run format           # biome check --write .
pnpm test                 # vitest run
pnpm run typecheck        # tsc --noEmit
```

Run one test file or one test:

```powershell
pnpm vitest run src/main/vault/canvas-page.test.ts
pnpm vitest run -t "saves atomically"
```

Release gates (Windows x64, unsigned):

```powershell
pnpm run package          # runs check + build, then scripts/package.mjs -> out/Lattice-win32-x64/Lattice.exe
pnpm run smoke:packaged   # launches the packaged exe with --phase9-smoke, verifies evidence
pnpm run installer        # electron-builder NSIS -> release/Lattice-Setup-<version>.exe
pnpm run smoke:installer  # installs, verifies byte-identical binaries/fuses, uninstalls
pnpm run verify:phase16   # all four in sequence (verify:phaseN aliases are identical)
```

`pnpm start` hot-reloads the renderer and auto-restarts Electron on main/preload changes. Do not
repackage or reinstall to see a normal change — only when testing packaged/installed behavior.

## Architecture

Three processes, strict trust boundary (see `docs/decisions/0001-electron-trust-boundaries.md`):

- **Main** (`src/main`, bundled by esbuild to `dist/main/index.cjs`) — the only code with filesystem,
  dialog, and network authority.
- **Preload** (`src/preload/index.ts` → `dist/main/preload.cjs`) — the sole bridge; exposes the typed
  `LatticeApi` over `ipcRenderer.invoke` and nothing else.
- **Renderer** (`src/renderer`, Vite + React 19) — the trusted shell UI. Packaged, it is served from
  the custom `lattice://app/` scheme with a locked CSP (`src/main/protocol.ts`); in dev it loads
  `LATTICE_DEV_SERVER_URL`. `will-navigate` outside the trusted shell origin is blocked.

`src/shared` is the contract layer imported by all three: `contracts.ts` holds the `IPC` channel-name
map plus every request/response type, and pure logic (`lattice-search`, `zoom`, `source-capture`,
`coach-board`) lives here so it is testable without Electron.

### Adding an IPC surface

Touch four files in order: `src/shared/contracts.ts` (channel name + types) → `src/main/ipc.ts`
(handler with a zod schema validating the renderer payload) → `src/preload/index.ts` (bridge method)
→ renderer call site. Renderer input is untrusted: every path/URL/ID is validated in main. The
renderer submits stable IDs, never absolute paths — canonical path resolution and external dispatch
(Obsidian/Explorer handoff) stay in main (`docs/decisions/0012-stable-id-obsidian-handoff.md`).

### Websites and profiles

`BrowserRuntime` (`src/main/browser/browser-runtime.ts`) owns native `WebContentsView` tabs with
sandbox/contextIsolation on and no preload, no Node, no downloads, no popups, no device permissions.
`src/main/policies/navigation.ts` restricts navigation to HTTPS (plus `about:blank` and loopback
HTTP); `policies/bounds.ts` constrains the view rectangle the renderer requests.

`ProfileRuntime` (`src/main/profiles`) holds one `BrowserRuntime` per website profile, each on its own
`persist:` partition so cookies, storage, cache, and tabs stay isolated. Renderer state is likewise
profile-scoped: it is persisted in `localStorage` under versioned keys (`lattice.session.v1`,
`lattice.settings.v2`, `lattice.focus.v1`, `coach.dashboard.v1`, …) keyed by profile id.

### Local files

`VaultService` (`src/main/vault/vault-service.ts`) fronts the vault modules. Every write goes through
the atomic write + `assertPathWithinRoot` containment check in `atomic-note.ts`; saved-link edits are
frontmatter-only and preserve body, path, and filename. `local-workspace.ts` owns the per-desktop
`Desktops/<name-ID>/{Inbox,Notes,Files,Planner}` layout and the private `.coach/workspace.json`
metadata; `canvas-page.ts` reads/writes JSON Canvas; `reference-index.ts` builds the read-only
backlink/broken-reference index.

Data-format and behavior invariants are recorded as ADRs in `docs/decisions/` — read the relevant one
before changing a file format, a lifecycle rule, or a trust boundary.

### Renderer

`src/renderer/lattice-app.tsx` is the shell composition root (large by design); feature surfaces are
`*-surface.tsx` and their logic lives in sibling pure `*-model.ts` modules — put testable behavior in
the model, not the component.

## Testing

Vitest, `environment: "node"`, tests colocated as `*.test.ts(x)` next to their source. Component tests
use `renderToStaticMarkup` rather than a DOM environment. Main-process behavior that cannot be unit
tested is covered by the in-process Electron smoke harness (`src/main/smoke.ts`, entered via
`--phase9-smoke`/`--new-tab-reactivation-smoke` argv), whose JSON evidence the `smoke:*` scripts
assert against and publish under `artifacts/`. Packaged evidence is bound to a source manifest hash
(`scripts/source-manifest.mjs`), so `dist/` must be rebuilt from the checked-out source before
packaging.

## Conventions

Biome formats and lints (2-space indent, 100 cols, **CRLF**, organize-imports on). TypeScript is
`strict` with `noUncheckedIndexedAccess`. Run `pnpm run check` before committing.

## Workflow (from AGENTS.md)

- Work in implementation mode unless planning/diagnosis/review is explicitly requested; complete
  queued phases and tasks sequentially.
- Commit after a phase or task passes its gates, then continue to the next defined task without
  asking for routine confirmation. Stop only when the next scope needs a material product choice,
  new authority, or cannot pass its gates safely.
- Never commit incomplete or failing work — document the blocker and stop instead.
- Keep each commit scoped to its task and preserve unrelated user changes.
