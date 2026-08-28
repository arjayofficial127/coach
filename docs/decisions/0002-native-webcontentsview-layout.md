# ADR 0002: Render websites in a native WebContentsView

Status: Accepted; amended for Phase 1  
Date: 2026-08-28

## Context

An iframe cannot display many normal sites because of framing policy, and it does not create the
desired browser-process boundary. Electron's `<webview>` tag is disabled for security and API
simplicity. The deprecated `BrowserView` should not be the basis of new work.

## Decision

Attach one Electron `WebContentsView` per native tab to `BrowserWindow.contentView`. Only the active
view is visible. The trusted renderer owns a normal DOM placeholder. A `ResizeObserver` reports its
device-independent bounds through validated IPC; the main process floors and clamps those values to
the current content size before moving the active native view.

Trusted controls and the vault panel occupy layout space beside the native surface. They are not
drawn as DOM overlays above it, because a native child surface sits above ordinary renderer DOM.
Any future modal or floating UI that overlaps the website must first hide, shrink, or move the
native view.

The runtime retains the original child `WebContents`, removes the view from its parent, removes its
download listener, and explicitly closes the contents during teardown.

## Alternatives rejected

- **iframe:** incompatible with many sites and not a browser surface.
- **`<webview>`:** expands renderer-facing API and is deliberately disabled.
- **BrowserView:** deprecated in favor of `WebContentsView`.
- **External system browser only:** cannot provide Lattice's integrated workspace and capture flow.

## Consequences

- Layout is a coordination contract between React and the main process.
- Tabs require explicit ownership, visibility, bounds, shared-session policy, and disposal rules;
  crash/session restoration remains future work.
- Screenshots of an occluded/hidden native view are platform-sensitive. The smoke first uses
  `capturePage`, then a DevTools-protocol fallback limited to the smoke path.
- Phase 1 validates create, switch, close, replacement-last-tab, and full teardown behavior.

## Verification

The packaged React slot and native bounds match after flooring, the view ends before the trusted
capture boundary, `example.com` renders in a `WebContentsView`, and the packaged test exercises a
second native tab before teardown. All created child contents are asserted destroyed after close.

Reference: [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view).
