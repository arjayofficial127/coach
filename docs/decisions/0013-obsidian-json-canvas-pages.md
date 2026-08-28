# ADR 0013: Obsidian JSON Canvas pages with isolated website objects

Status: Accepted for Phase 9  
Date: 2026-08-29

## Context

Lattice needs a local “whole page” that can collect descriptions, websites, links, documents,
images, files, other objects, and other pages. Pages need nested folders and must remain useful in
Obsidian rather than becoming records in a private application database.

The open [JSON Canvas 1.0 specification](https://jsoncanvas.org/spec/1.0/) defines `.canvas` files
with top-level `nodes` and `edges`, plus standard `text`, `file`, `link`, and `group` node types. It
also permits additional fields, allowing an application to retain interoperable standard nodes
while carrying its own metadata.

Embedding a remote iframe in Lattice's React renderer would cross the Phase 0 trust boundary. The
trusted shell has a strict `frame-src 'none'` policy and intentionally exposes its narrow preload
bridge only to the trusted main frame.

## Decision

- Store pages under `Lattice Pages/<nested folder>/` as `.canvas` files.
- Keep the public JSON Canvas shape: `nodes`, `edges`, and standard node `type` fields.
- Put page identity, title, description, folder, schema version, and timestamps in a top-level
  `lattice` extension object.
- Represent descriptions as standard `text` nodes, website objects as standard `link` nodes, and
  local file objects as standard `file` nodes. Lattice extension fields carry the object title,
  description, and behavioral kind.
- Represent a link collection as a `text` node with a `latticeLinks` extension array. Each entry has
  a stable UUID and one of six explicit kinds: `page`, `object`, `url`, `document`, `image`, or
  `file`.
- Resolve page, object, and file actions from stable IDs in the main process. The renderer never
  submits an absolute path. Local targets must be relative vault paths with no absolute prefix,
  empty component, `.` component, or `..` component.
- Treat an “iframe” as a website card in the trusted canvas. **Open live** creates an isolated
  native `WebContentsView`; no `<iframe>` or `<webview>` is enabled in the trusted shell.
- Create pages through exclusive same-directory temporary files and hard-link publication. Update
  them through a same-directory, fsynced temporary file, an optimistic size/mtime concurrency
  check, reparse-point checks, and atomic replacement. Bounded retries handle transient Windows
  sharing violations while preserving the fail-closed behavior.
- Index only valid canvases carrying Lattice metadata. Arbitrary Obsidian canvases remain untouched
  and do not break the Lattice page index.

## Limits

- Object links target an object on the same page. A cross-page object is reached by following the
  page link first.
- Broken page/file references are retained as authored; Lattice does not silently rewrite them.
- External edits are detected at save time with optimistic metadata checks. There is no merge UI.
- File actions reveal an existing file in Explorer; arbitrary file execution is not granted.

## Consequences

Pages remain local, readable by Obsidian, and portable at the standard JSON Canvas layer. Lattice
can provide richer typed actions without relaxing the remote-site boundary. Extension-aware
behavior is Lattice-specific, so other JSON Canvas clients will show the standard node content but
may ignore titles, descriptions, and typed-link actions stored in extension fields.
