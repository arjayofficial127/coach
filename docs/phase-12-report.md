# Phase 12 completion report

**Status: PASS (2026-08-29)**

## Outcome

Phase 12 adds named local website profiles with optional pictures. Each profile owns a distinct
persistent Chromium identity boundary plus its own tabs, desktops, settings, and focus intention;
Obsidian knowledge remains deliberately shared.

## Definition of Done

| Requirement | Result |
| --- | --- |
| Create and switch named profiles | PASS — the rail menu creates up to eight unique profiles and switches through trusted IPC |
| Keep website identities separate | PASS — main-process-generated persistent partitions isolate cookies and origin storage |
| Preserve the existing user's sign-ins | PASS — the first Personal profile retains the original `persist:lattice-remote` partition |
| Keep focus context separate | PASS — URLs, tab membership, desktops, settings, and intention use profile-scoped validated records |
| Support local profile pictures safely | PASS — trusted file selection, 10 MB source bound, 128×128 PNG conversion, atomic private write, and no source-path exposure |
| Avoid credential storage | PASS — the registry contains metadata and opaque partition keys only; Chromium retains provider sessions |
| Preserve the remote-site boundary | PASS — websites still receive no preload, Node, Lattice bridge, filesystem path, or new permission |
| Source, package, and installer gates | PASS — formatting, TypeScript, 62 Vitest tests, portable packaging, packaged smoke, NSIS build, and installed-app lifecycle smoke pass |

## Decisions and verification

- [ADR 0016](decisions/0016-local-website-profiles.md) records the identity, migration, avatar,
  shared-vault, and no-delete contracts.
- Unit tests cover first-run creation, legacy partition retention, distinct new partitions, unique
  names, the eight-profile bound, registry recovery, avatar bounds, persistence, and shell-key
  migration.
- Packaged and installed-app smoke create and switch a second profile, hide the native website under
  the trusted menu, seed cookies in both partitions, prove neither can read the other's value, scan
  the persisted registry for credential-shaped fields, and return to the primary profile's loaded
  HTTPS tab.

## Known limits

Popup-based OAuth remains blocked. Lattice does not display or store the provider account identity,
offer profile deletion, import Chrome profiles, synchronize profiles, provide incognito, or securely
erase partition remnants. These are separate security and product decisions.

## Next phase

Phase 13 will be selected from the remaining documented risks after Phase 12 is committed.
