# ADR 0004: Use a pinned registry-only Electron packaging chain

Status: Accepted for Phase 0  
Date: 2026-08-28

## Context

The initial Electron Forge path pulled a Git-based transitive `@electron/node-gyp` dependency that
the workspace supply-chain policy rejected. Weakening that policy for a convenience tool would be
the wrong Phase 0 tradeoff.

## Decision

Use exact, lockfile-pinned packages from the registry:

- Electron `44.0.0`
- Vite for the React renderer
- esbuild for main and preload bundles
- `@electron/packager` for a Windows x64 application directory
- `@electron/fuses` for binary hardening

Only compiled `dist` output and a minimal runtime `package.json` enter the packaging staging
directory. Dependencies are bundled; development source and tooling are not copied into the app.
The app is ASAR-packed.

The following fuses are asserted from the final executable:

- Run as Node: disabled
- Cookie encryption: enabled
- `NODE_OPTIONS`: disabled
- Node CLI inspect arguments: disabled
- Embedded ASAR integrity validation: enabled
- Load application only from ASAR: enabled
- Extra `file://` privileges: disabled

Fuses are flipped before any future code-signing step. A deterministic manifest binds 32 runtime,
configuration, lockfile, build-script, and verifier inputs to the packaged output; the smoke refuses
evidence publication if current inputs no longer match. Phase 0 deliberately produces an unsigned
runnable directory, not an installer.

## Consequences

- The supply-chain policy stays intact and every direct dependency is exactly pinned.
- The repository owns a small amount of packaging orchestration instead of Forge configuration.
- Installer creation, signing, update feeds, rollback, and release channels remain future work.
- The first package may need network access to the official Electron release artifact; later runs
  use the tool cache when available.

## Verification

The packaged executable launches without Vite, its Authenticode status is exactly `NotSigned`, its
seven security fuse states are read back and asserted, and executable, ASAR, source-manifest, and
screenshot hashes are stored in the Phase 0 evidence.

References: [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging),
[Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), and
[ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity).
