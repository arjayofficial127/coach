# ADR 0023: Separate a minimal New Tab from the review Dashboard

**Status: Accepted for Phase 16**

## Context

The original focus home mixed two different jobs: beginning a browsing action and reviewing ongoing
work. It repeated destinations already present in the left navigation and made every new blank tab
feel like a dashboard. Lattice also needed a very low-friction place to write a thought without
forcing the user to classify it immediately.

## Decision

- Treat **New Tab** as a transient launch surface with two primary choices only: search/open and
  quick capture. It is not represented as another permanent left-navigation destination because the
  tab itself is its location.
- Move the existing review experience to an explicit **Dashboard** destination. Dashboard owns the
  optional focus intention, recent thread, recent canvas, Today preview, and reading-queue preview.
  It does not repeat Saved links, Runnable apps, or Settings cards already present in navigation.
- Keep New Tab's primary control URL-capable. Submitting the field uses the existing HTTPS/search
  normalization and isolated `WebContentsView` navigation boundary.
- Show at most six suggestions from already local, bounded sources: Runnable apps, open desktop tabs,
  saved links, the latest canvas page, and resolved vault-file references. Typing filters these
  candidates; unmatched text remains a normal web search.
- Give apps and suggestion kinds distinct dimensional icon tiles. The color and silhouette identify
  a destination, while labels remain the accessible source of truth.
- Model quick capture as an immutable Bullet Journal **Note** organized into **Inbox**. The original
  text is never overwritten. Filing appends a Reference-lane event, and Undo can restore the prior
  profile-local state.
- Keep quick captures inside the active website profile's validated Runnable-app state. Do not
  silently write every transient note into the selected Obsidian vault; explicit export/handoff is a
  later product decision.
- Preserve the existing trust boundary. New Tab gains no network, filesystem, IPC, identity-provider,
  or remote-page authority beyond the already reviewed browser and vault APIs.

## Consequences

Opening a tab now creates a quieter moment: the user can go somewhere, resume something relevant,
or park one thought. Dashboard becomes semantically honest and easier to find. Captures are durable
across restarts and profiles but remain local shell data, so backup, Obsidian export, search, and
retention require a future decision.

## Verification

Pure tests prove note capture normalization, Inbox placement, later filing, and original-text
preservation. Packaged and installed Electron smoke open a real New Tab, assert app/history/saved/file
suggestions, submit a note, verify its Inbox count, open Daily Flow directly to Inbox, find the
original note, and capture a real PNG while the native website view is hidden.
