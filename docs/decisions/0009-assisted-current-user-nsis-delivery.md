# ADR 0009: Assisted current-user NSIS delivery

Status: Accepted for Phase 5  
Date: 2026-08-29

## Context

Phase 4 produced a hardened portable Windows directory but not an installable application. Lattice
does not yet have a protected Windows code-signing identity, release service, or authenticated
update channel. Installation must therefore improve personal usability without weakening the
packaged trust boundary or pretending the build has production distribution assurances.

## Decision

- Wrap the already-packaged `out/Lattice-win32-x64` directory with electron-builder 26.15.3 and
  its NSIS target. Electron Packager remains the only tool that assembles and fuse-hardens the app.
- Use an assisted installer with current-user installation as the default, no elevation path, and
  an optional install-directory choice.
- Create a Start-menu shortcut, do not create a desktop shortcut, and do not launch the app
  automatically when setup completes.
- Preserve Lattice user data on uninstall. Removing installed binaries must not silently remove
  browsing state or the user's external Obsidian Markdown.
- Keep executable resource editing and signing disabled while no signing identity exists. The
  installer and application are explicitly reported as unsigned.
- Do not add automatic updates. An unsigned, unauthenticated update mechanism would create a
  larger supply-chain risk than manual installation.
- Gate delivery with a real silent current-user install, installed-app smoke, and silent uninstall.
  The gate refuses to run when an existing current-user Lattice install or shortcut is present.
  It proves the installed executable, ASAR, source manifest, fuses, uninstall record, and shortcut
  lifecycle.

## Consequences

The user can install and uninstall Lattice through familiar Windows setup UI, choose a destination,
and launch it from Start. The installer is reproducible from the pinned source and preserves the
exact hardened package bytes.

Windows may display reputation warnings because the artifact is unsigned. Phase 5 is suitable for
the owner's local use and testing, not broad public distribution. A later release phase must add a
protected signing identity, signed provenance and update metadata, rollback, and a tested release
channel before claiming production-grade delivery.
