# Coach Browser / Lattice

Scope: this Git repository; an Electron desktop research browser plus an independently
configured marketing frontend in `website/frontend`. `website/backend` is reserved with
no runtime (website README). The pnpm workspace configuration controls allowed dependency
builds; it declares no subpackage globs. Keep website requirements separate from desktop
behavior; this frontend existed before bootstrap.

Observed during bootstrap: package name `lattice`, product `Coach Browser`, version 0.16.0;
Node >=24, pnpm 11.19.0; Electron 44, React 19, TypeScript, Vite/esbuild, Vitest and Biome.
These are observations from package manifests, not upgrade targets. Installed dependency
entry points exist. See the command registry; discovery does not establish passing checks.

Main (`src/main/index.ts`) owns filesystem authority, native website views, profiles and
validated IPC. Preload (`src/preload/index.ts`) exposes the typed bridge. React enters at
`src/renderer/index.tsx`, composes in `lattice-app.tsx`, and shares contracts through
`src/shared/contracts.ts`. Main IPC uses validation; websites live in separate native
WebContentsView contexts. The browser preview bridge is a dev convenience, not proof of
Electron isolation or installed-app behavior.

Local-folder data uses Markdown, JSON Canvas and versioned `.coach` objects. Profile/session
state also uses Electron partitions and renderer localStorage; do not reduce all persistence
to one file store. Filesystem containment belongs in main. Existing ADRs document intended
boundaries, including changes over time; reconcile their status with the actual request.

Existing knowledge homes remain `CLAUDE.md`, `docs/decisions/`, `docs/WORKSPACE-STUDIO.md`,
`docs/recovery-ux.md`, and `docs/unresolved-risks.md`. Preserve their content and provenance.
The README mixes prior phase reports with newer changes: its historic PASS
does not verify today's checkout. No new duplicate knowledge catalog was created.

Command definitions: root `package.json` provides development, `test`, `typecheck`, `check`,
build and release scripts. `check` = Biome check + TypeScript + Vitest. `format` writes files.
Package/smoke/installer scripts can build, launch, install or uninstall software: they are
excluded from implicit helper validation. The website has its own development/build commands.
Product builds, full suites and GUI smoke runs were not needed to test this framework.
