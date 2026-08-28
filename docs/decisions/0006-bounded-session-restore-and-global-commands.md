# ADR 0006: Restore bounded intent and keep commands in the trusted shell

Status: Accepted for Phase 2  
Date: 2026-08-28

## Context

Lattice needs to survive a restart without turning renderer storage into an authority over native
views. It also needs browser shortcuts and search while untrusted website content owns keyboard
focus. Native `WebContentsView` content is composed separately from the React shell, so trusted
overlays cannot safely be drawn without explicit view visibility coordination.

## Decision

- Persist a versioned, bounded list of URL, desktop ID, and active-state records in trusted shell
  storage. Accept only HTTPS and `about:blank`, known desktop IDs, and no more than 24 tabs.
- Treat the Electron main-process snapshot as authoritative for live native views. Create saved tabs
  only for a pristine cold runtime; reconcile against existing views after shell reload/HMR.
- Forward only a fixed command enum for `Ctrl/Cmd+K`, `L`, `T`, and `W` from remote views to the
  shell. Remote content receives no privileged API.
- Hide the active native view whenever the trusted command palette is open, then restore visibility
  through the existing layout effect.
- Keep desktop IDs stable across display-name changes and store that ID in new Markdown captures.

## Consequences

- Ordinary restart and renderer reload preserve current browsing intent without duplicate views.
- Invalid or oversized stored sessions degrade to a safe fresh tab.
- Session order and URL survive; history stacks, page state, scroll, and credentials are delegated
  to Chromium rather than serialized by privileged application code.
- Search can operate across local concepts while website content has focus, and the overlay remains
  visually trustworthy.
- Renaming a desktop does not silently rename or move user files.

## Verification

Unit tests cover malformed and bounded session parsing, session construction, reload reconciliation,
and rename rejection rules. The packaged smoke reloads the shell over two native tabs, proves the
count remains two, verifies the restored active desktop/title, opens the palette with `Ctrl+K`, and
asserts that the native website view is hidden until the palette closes.
