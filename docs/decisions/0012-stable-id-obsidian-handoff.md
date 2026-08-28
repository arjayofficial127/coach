# ADR 0012: Stable-ID broker for Obsidian and Explorer handoff

Status: Accepted for Phase 8  
Date: 2026-08-29

## Context

Saved research should move naturally between Lattice and Obsidian, but exposing absolute note paths
or generic shell APIs to the renderer would widen the trusted surface. Allowing websites to navigate
to arbitrary external schemes would be substantially worse. Lattice needs one narrow broker for
user-initiated handoff from a trusted library card.

## Decision

- The renderer sends only a stable saved-link UUID for both actions. It never supplies or receives a
  file path, executable, command, or external URI.
- The main process validates the UUID and trusts calls only from the shell's main frame.
- Re-list the active vault and require exactly one matching note. Missing and duplicate identities
  fail closed.
- Canonicalize the vault and target, require containment under the vault, reject links/junctions,
  and require an existing `.md` file.
- Construct the Obsidian URI internally using the official absolute `path` parameter and
  `encodeURIComponent`; do not accept a URI from the renderer.
- Use Electron's `shell.openExternal` only for the constructed `obsidian://open` URI and
  `shell.showItemInFolder` only for the resolved canonical note.
- Keep remote navigation policy unchanged: websites cannot request these IPC channels or navigate
  themselves to external protocols.
- Inject shell actions in smoke tests to prove exact dispatch without launching applications or
  mutating the user's desktop session.

## Consequences

The user can jump directly from a Lattice card to the corresponding Obsidian note or Explorer
location. The broker has a narrow, auditable input and cannot become a generic file/URI launcher.

The feature depends on Obsidian having registered its URI handler. Electron's successful dispatch
does not prove Obsidian opened the note, and `openExternal` does not provide a reliable application
acknowledgment. Phase 8 therefore reports dispatch success honestly; missing-handler diagnostics and
real Obsidian compatibility remain future work.
