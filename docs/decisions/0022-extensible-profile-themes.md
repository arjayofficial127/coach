# ADR 0022: Extensible profile-scoped themes with semantic tokens

**Status:** Accepted — 2026-08-29

## Context

Lattice had one hard-coded dark appearance. The product now needs the existing dark UI, a tactile
light option, and a named custom palette without turning each future theme into a separate set of
component overrides. Website profiles already own trusted-shell settings independently.

## Decision

- Store theme selection and one named custom palette inside the existing profile-scoped Settings
  record. Migrate version 1 settings to version 2 without changing tab-restoration behavior.
- Keep a data-driven catalog with stable identifiers: `lattice-dark`, `paper-felt`, and `custom`.
  Future built-ins extend the catalog and semantic-token resolution rather than component state.
- Preserve the original dark values exactly. Felt White resolves the same tokens to neutral
  off-whites and composes fine, irregular speckles from local CSS radial gradients; it adds no remote
  asset or trusted-shell network request.
- Let Custom name and tune background, card, text, muted-text, and accent colors. Preview edits live
  on the Settings surface, normalize saved values, and persist only through an explicit Save action.
- Route theme selection and custom-theme saving through Lattice's existing 10-second recovery bar so
  both actions have a visible Undo path.
- Synchronize the native Windows title-bar overlay through a validated, trusted-main-frame-only IPC
  call so its background and caption symbols do not remain dark when the trusted shell becomes light.
- Apply themes only to the trusted Lattice shell. Native website content remains isolated and is
  never restyled or inspected by the theme system.

## Consequences

Each website profile can carry a different calm working environment without mixing identities or
Obsidian content. The five semantic custom controls intentionally favor a bounded, understandable
surface over a full CSS editor. This version has one custom slot per profile; multiple presets,
theme import/export, and automated contrast repair remain future schema and accessibility work.
