# ADR 0014: Focus-first navigation and reversible chrome reduction

Status: Accepted for Phase 10
Date: 2026-08-29

## Context

Lattice had working tabs, desktops, saved links, reading queues, canvas pages, and settings, but the
navigation model made a returning user reconstruct that structure. Internal pages appeared beneath
browser-only controls, the left rail used icons without persistent labels, and Home offered generic
web destinations instead of a clear way to resume interrupted work.

The target user may be rebuilding attention after distraction. The navigation therefore needs to
reduce decisions without hiding where content lives or creating an irreversible productivity mode.

## Decision

Lattice uses six stable destinations with explicit labels and shortcuts: Focus, Browse, Canvas
pages, Saved links, Reading queue, and Settings. The activity rail remains a compact accelerator,
while the workspace panel provides persistent labels, descriptions, counts, active state, and a
calm split between navigation, desktops, and the library.

Focus is the default return point. It offers one optional, local-only intention and exactly three
resume choices: the active website, the next queued link, and the most recently updated canvas. A
secondary strip exposes the full information architecture without competing with those choices.

Internal pages use a trusted surface toolbar instead of browser back/reload/address controls. Every
internal page has a direct return to Focus and a direct route to Browse.

Focus view is temporary UI state, never restored on launch. It hides the activity rail, workspace
panel, tab strip, and page-specific toolbar, but always retains a trusted 40 px bar containing the
current intention/context and an explicit **Show navigation** action. `Escape` and
`Ctrl/Cmd+Shift+F` exit it. The real remote `WebContentsView` receives the enlarged content bounds;
no iframe, preload, Node access, or new website permission is introduced.

`Alt+1` through `Alt+6` route to the six destinations. The native remote view intercepts and
forwards those commands to the trusted renderer so navigation remains available while a website has
keyboard focus.

## Consequences

- Returning to meaningful work takes one action from Focus.
- Internal tools no longer masquerade as browser pages.
- The user can reduce chrome without losing orientation or an escape route.
- The intention is bounded to 120 characters, normalized, and stored only in trusted-shell local
  storage; it is never written to remote websites or the Obsidian vault.
- Keyboard routing adds trusted shell commands but does not relax the website security boundary.
- Focus view is deliberately not a timer, blocker, streak, or notification system. Those mechanisms
  would require separate research and product decisions.

## Rejected alternatives

- **Permanent minimal mode:** rejected because a user rebuilding focus must always be able to
  recover the information architecture.
- **Hide all controls over websites:** rejected because Save and a visible escape hatch are core
  orientation and capture actions.
- **A dashboard with many widgets:** rejected because more status competes with the next decision.
- **Store the intention in Obsidian automatically:** rejected because a transient focus cue is not
  durable knowledge and should not create vault noise.
