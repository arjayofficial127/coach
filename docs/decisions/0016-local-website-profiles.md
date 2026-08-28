# ADR 0016: Local website profiles own isolated Chromium partitions

**Status: Accepted for Phase 12**

## Context

One persistent website partition cannot safely represent several work or personal identities. A
Google, Microsoft, GitHub, or other identity-provider session selected for one context must not
appear inside another context. Profiles also need recognizable local names and optional pictures,
without turning Lattice into a credential store.

## Decision

- Store only bounded local profile metadata: a generated UUID, display name, internal partition
  key, optional generated PNG filename, and timestamps. Never serialize passwords, provider
  account IDs, cookies, access tokens, refresh tokens, or ID tokens into the profile registry.
- Give each profile a distinct persistent Electron session partition. The first **Personal** profile
  retains `persist:lattice-remote`, preserving existing Phase 0–11 website sessions during upgrade.
  Additional partition keys are main-process-generated UUIDs and cannot be supplied by the renderer.
- Keep one `BrowserRuntime` per opened profile during an app session. Inactive native views are
  hidden and cannot emit trusted-shell state. Closing Lattice destroys every native view while the
  selected Chromium partitions retain their encrypted-on-disk website state.
- Namespace restorable URLs, desktop membership, settings, and focus intention by profile in the
  trusted shell. The primary profile reads the old unscoped records once for migration. Obsidian
  vault authority and saved knowledge stay shared because profiles represent website identities,
  not separate vaults.
- Choose pictures only through a trusted native file dialog. Reject non-files and sources over
  10 MB, decode through Electron, center-crop and resize to 128×128, then atomically save a bounded
  PNG under app user data. The renderer receives only a data URL, never the source path.
- Do not add profile deletion in this phase. Deleting a persistent partition is destructive and
  needs a separate sign-out, retention, recovery, and secure-deletion design.

## Consequences

Profile switching is deliberate and returns to the Focus surface with that profile's own context.
Website authentication remains owned by Chromium and the website; Lattice does not know which
Google or other provider account is signed in. Redirect-based sign-in can persist per profile, but
popup-based OAuth remains blocked by the existing deny-by-default policy and is not claimed as
compatible.
