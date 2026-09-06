# Selective knowledge map

Open only the entries relevant to the request. These are source pointers, not a dependency graph.

| Concern | Starting points |
| --- | --- |
| Existing repository rules | [AGENTS](../AGENTS.md), [project conventions](../CLAUDE.md) |
| Architecture and decisions | [ADRs](../docs/decisions), [trust boundary](../docs/decisions/0001-electron-trust-boundaries.md) |
| Main, preload, contracts | [main entry](../src/main/index.ts), [IPC](../src/main/ipc.ts), [preload](../src/preload/index.ts), [contracts](../src/shared/contracts.ts) |
| Native tabs, navigation, website profiles | [browser](../src/main/browser), [policies](../src/main/policies), [profiles](../src/main/profiles) |
| Local persistence and filesystem containment | [vault](../src/main/vault), [local workspace ADR](../docs/decisions/0024-desktop-local-workspaces.md) |
| Shell, state and visual conventions | [shell](../src/renderer/lattice-app.tsx), [styles](../src/renderer/styles.css), [renderer models/tests](../src/renderer) |
| Workspace direction and recovery | [Workspace Studio](../docs/WORKSPACE-STUDIO.md), [recovery](../docs/recovery-ux.md), [risks](../docs/unresolved-risks.md) |
| Tests and commands | [Vitest config](../vitest.config.ts), [package scripts](../package.json), [command registry](project.json) |
| Marketing frontend | [website guidance](../website/README.md), [frontend commands](../website/frontend/package.json), [source](../website/frontend/src) |
| Framework operation | [workflow](WORKFLOW.md), [helper](../scripts/ai/control-room.mjs), [framework tests](../scripts/ai/framework.test.mjs) |

For new durable knowledge, update its existing home when appropriate. Otherwise create one
small justified `.codex/knowledge/<topic>.md` entry with kind, scope, status, rationale,
supporting code/test references, and verified state. Add a map pointer only when useful.
Proposals, observations and approved decisions must remain distinguishable. Do not store diaries.
