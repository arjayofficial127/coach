# Phase 8 completion report

Date: 2026-08-29  
Version: 0.8.0  
Result: PASS

## Outcome

Phase 8 connects the local Lattice library back to Obsidian. Every saved-link card now offers an
**Obsidian** action that opens the exact existing Markdown note and a compact folder action that
reveals it in Windows Explorer.

The renderer never supplies or receives a note path. It sends only the saved link's stable UUID.
The main process re-lists the active vault, requires exactly one matching note, canonicalizes the
vault and target, checks containment, rejects symbolic links and junctions, requires an existing
Markdown file, and only then constructs or dispatches the external action.

The Obsidian action follows the official absolute-path form:
`obsidian://open?path=<percent-encoded-absolute-path>`. See
[Obsidian URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI).

Remote websites retain no external-protocol or filesystem authority. Both actions exist only on the
trusted React surface and are available exclusively through trusted-frame IPC handlers.

## Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Stable-ID target resolution | PASS | Focused tests resolve one UUID and reject missing or duplicate IDs |
| Canonical vault containment | PASS | Target is canonicalized inside the selected vault; links/junctions and non-Markdown targets are rejected |
| Obsidian URI encoding | PASS | Focused and packaged tests decode the official URI path back to the exact canonical note path |
| Renderer path privacy | PASS | Packaged smoke proves neither the absolute nor relative note path is rendered |
| Trusted dispatch | PASS | Packaged and installed smoke inject no-op shell handlers and prove exactly one Obsidian and one Explorer dispatch |
| Visual QA | PASS | Dedicated 1,000×720 screenshot verifies the card actions, responsive footer, metadata, and reading state |
| Regression suite | PASS | Formatting, TypeScript, 38 tests, production builds, WebContentsView isolation, desktop lifecycle, metadata editing, privacy, Markdown, and fuses pass |
| Installed lifecycle | PASS | Version 0.8.0 installs, repeats the full handoff/security smoke, and uninstalls without deleting user data |

Machine-readable and visual evidence:

- [`artifacts/phase-8/packaged-smoke-evidence.json`](../artifacts/phase-8/packaged-smoke-evidence.json)
- [`artifacts/phase-8/installed-smoke-evidence.json`](../artifacts/phase-8/installed-smoke-evidence.json)
- [`artifacts/phase-8/installer-lifecycle-evidence.json`](../artifacts/phase-8/installer-lifecycle-evidence.json)
- [`artifacts/phase-8/phase-8-obsidian-handoff.png`](../artifacts/phase-8/phase-8-obsidian-handoff.png)

## Development workflow

Use `pnpm start`; renderer changes hot-reload and main/preload changes rebuild and restart Electron.
Reinstallation is only needed for setup or installed-behavior tests. The complete gate is
`pnpm run verify:phase8`.

## Deliberate boundary

The automated gate does not launch a real Obsidian or Explorer process; it injects handlers and
proves the exact values that production Electron would dispatch. This makes the test deterministic
and avoids side effects. A real installed-Obsidian compatibility matrix and missing-protocol UX are
future work.

Phase 8 does not grant websites external protocol access and does not add arbitrary file opening,
downloads, OAuth popups, extensions, permissions, signing, or automatic updates.
