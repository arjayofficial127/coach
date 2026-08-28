# Phase 5 completion report

Date: 2026-08-29  
Version: 0.5.0  
Result: PASS

## Outcome

Phase 5 turns the hardened Lattice portable directory into an assisted Windows x64 installer. The
installer defaults to the current user, cannot request elevation, allows a destination choice,
creates a Start-menu shortcut, avoids desktop clutter, and preserves user data on uninstall.

No browser capability or remote-site permission was relaxed. The installer wraps the existing
fuse-hardened package; it does not rebuild or edit the application executable.

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Pinned deterministic installer configuration | PASS | `electron-builder.yml`, electron-builder 26.15.3 in the lockfile |
| Existing hardened package unchanged by installer build | PASS | Pre/post SHA-256 values in `release/installer-build-evidence.json` |
| Unsigned state is explicit | PASS | Authenticode reports `NotSigned` for setup and installed app |
| Assisted current-user installation | PASS | Silent `/currentuser` install into an isolated temp directory |
| Windows integration | PASS | HKCU uninstall record and Start-menu shortcut created |
| Installed application | PASS | Real Phase 5 smoke covers shell, WebContentsView isolation, Markdown, reading queue, and privacy clearing |
| Hardened installed bytes | PASS | Installed executable, ASAR, and source-manifest hashes equal the portable package; fuses re-read |
| Clean uninstall | PASS | Binary directory, HKCU uninstall record, and Start-menu shortcut removed |
| Data-preservation policy | PASS | Uninstaller is configured not to delete Electron user data; external vault Markdown is never owned by setup |

The machine-readable lifecycle result is
[`artifacts/phase-5/installer-lifecycle-evidence.json`](../artifacts/phase-5/installer-lifecycle-evidence.json).
The installed app's integration result is
[`artifacts/phase-5/installed-smoke-evidence.json`](../artifacts/phase-5/installed-smoke-evidence.json).

## Development workflow

Development still uses `pnpm start`; renderer changes hot-reload and main/preload changes restart
Electron. Reinstallation is only necessary when testing setup or installed behavior. The complete
release gate is `pnpm run verify:phase5`.

## Deliberate boundary

The installer is unsigned because no protected signing identity was supplied. It is appropriate for
the owner's local use and will produce Windows reputation warnings. Phase 5 does not implement
automatic updates, signing, public distribution, OAuth popups, downloads, extensions, or site
permissions. The setup and executable also retain Electron's default icon because no approved
Lattice Windows icon asset exists yet. Those remain explicit future release decisions in the risk
register.
