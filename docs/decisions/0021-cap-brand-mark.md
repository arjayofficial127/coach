# ADR 0021: Use the supplied cap as the Lattice brand mark

**Status:** Accepted — 2026-08-29

## Context

Lattice still used Electron's default Windows icon and a temporary letter mark in the activity rail.
The approved cap artwork is a transparent 32×32 PNG, and the repository already contains its
matching vector trace.

## Decision

- Preserve the supplied PNG as `src/renderer/assets/lattice-logo.png`.
- Use the matching SVG geometry for the high-DPI in-app logo and primary favicon, with the PNG as a
  favicon fallback.
- Generate a 32-bit Windows ICO containing 16, 24, 32, 48, 64, 128, and 256 pixel entries.
- Apply that ICO to Electron Packager, the NSIS installer, uninstaller, and installer header.
- Keep the monochrome cap on a light in-app tile so it remains legible against Lattice's dark rail.

## Consequences

The trusted shell, browser metadata, portable executable, shortcuts, and installer now share one
approved mark. The original raster remains available without modification, while scalable uses do
not depend on enlarging the small PNG.
