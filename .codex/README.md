# Local-first Control Room 2.0.0

A repository-local Node/Git harness. No packages, product changes, services, model settings,
global configuration or security-policy changes are installed. Existing project knowledge is
linked from MAP. A scoped .codex/biome.json keeps generated local/task JSON outside the
existing formatter scan without changing product configuration. Begin a future task with: **`$control-room: <your request>`**.

Use Node 24+ (the project runtime). The Codex tool environment exposed Node 24.19.0; the normal
Windows PATH can select Node 20.19.0. The existing Coach launcher identifies this already
installed runtime; select it for this PowerShell session if `node --version` is older than 24:

```powershell
$env:PATH = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:PATH"
node --version
```

From the repository root:

```powershell
node scripts/ai/control-room.mjs doctor
node scripts/ai/control-room.mjs context --scope src/renderer --term navigation --limit 10
node scripts/ai/control-room.mjs context --file src/renderer/lattice-app.tsx --start 1 --lines 60
node scripts/ai/control-room.mjs check framework-tests
node scripts/ai/control-room.mjs task --id navigation-review --request "Review navigation without editing" --scope src --mode investigation
node scripts/ai/control-room.mjs context --task .codex/tasks/navigation-review.json
node scripts/ai/control-room.mjs handoff --task .codex/tasks/navigation-review.json
node scripts/ai/control-room.mjs verify-framework
```

All commands also resolve the project from a subdirectory when the script is addressed correctly
(for example, from `src`: `node ../scripts/ai/control-room.mjs doctor`). `context --offset N`
retrieves another page; `--start N --lines N` expands source ranges. At most 100 paths or 200
source lines are displayed. Long lines are clipped with truncation reported. Explicit
`--file ... --allow-ignored` permits ignored non-secret text only. Source search skips binary,
generated/private/credential paths and files over 1 MiB. No search cache is used.

Command IDs in project.json: `framework-tests`, `typecheck`, `app-unit`, `navigation-tests`,
`website-typecheck`. The latter four are reviewed definitions for later relevant tasks;
consult local records for execution status. Missing dependencies are BLOCKED. Product
install/build/installer/write-format commands are deliberately outside automatic validation.
Read WORKFLOW before a meaningful implementation. The runner executes fixed argv without a shell.

Full stdout/stderr, immutable check records, hashed baselines and handoffs live in ignored
`.codex/local/`. Each check records exact argv/cwd/times/exit or timeout/source fingerprint.
Handoff retains original intent and open criteria; fingerprints include dirty source/config
and portable framework files, excluding generated/private/task artifacts. Any relevant source
edit makes prior evidence stale. PASS establishes the selected command outcome only.

## Activation and actual capabilities

Installed CLI 0.153.3 reported hooks, native multi-agent and browser features enabled. Native
delegation was exercised for useful read-only bootstrap auditing. No CLI adapter or paid test
invocation was added. Browser tools are exposed; application visual/runtime validation was not
performed. Per-task aggregate tokens are unavailable; do not infer them from account limits.

Root AGENTS guidance loads according to the client's normal rules. `.agents/skills/control-room`
uses the documented name/description format. Invoke `$control-room`; if absent, start a new
task/reload the client, or explicitly read `.codex/WORKFLOW.md`. Skills are instructions, not
background processes. No scoped AGENTS override was found during initial discovery.

The SessionStart handler is deterministic, read-only and directly tested. `.codex/hooks.json`
is inert until the client trusts its exact definition: review using `/hooks` in a client that
exposes that UI. Never bypass trust. Native event firing and desktop trust UI availability are
not asserted. The command handles root/subdirectory launches and the existing Node runtime.
If hooks are unavailable, manually call `doctor`/`context` at task start. Checks and handoffs
remain explicit at task boundaries; there is no Stop hook, automatic commit or task completion.
Official capability references: [skills](https://learn.chatgpt.com/docs/build-skills),
[hooks and trust](https://learn.chatgpt.com/docs/hooks). These do not prove this session's activation.

## Safe rerun / upgrade

`node scripts/ai/control-room.mjs verify-framework` audits installed content. Initial installation
bundle is retained locally at `.codex/local/install-bundle.json`. Reapply unchanged input with:

```powershell
node scripts/ai/control-room.mjs install --from .codex/local/install-bundle.json
node scripts/ai/control-room.mjs verify-framework
```

A bundle is `{ "version": "2.0.0", "files": [{ "path": "...", "content": "..." }] }`.
Root router/ignore entries also declare `section`. The manifest owns file or section SHA-256s
normalized to LF for Git line-ending conversion,
not other user content. Before a planned framework upgrade, review a new local bundle, preserve
the installed manifest as the old baseline, and run `install --from ...`; conflicts abort before
any managed edits. Resolve customization explicitly, never regenerate hashes to conceal it.
Reruns do not add duplicate blocks or timestamps. The installer does not delete old files;
individual writes are atomic, not a multi-file transaction. Inspect/rerun after an interruption.
Intentional customized managed content is reported as a conflict until reconciled through a
reviewed upgrade. Unmanaged project docs stay untouched.

Examples: attach a current screenshot and say `$control-room: Make this lighter while preserving
actions and keyboard behavior.` Text-only: `$control-room: Fix the navigation regression; preserve
the current desktop behavior.` Tiny tasks need no packet. Store curated knowledge in its existing
ADR/doc home or one justified `.codex/knowledge` entry; raw histories never enter default context.
