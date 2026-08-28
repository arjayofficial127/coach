# Phase 3 unresolved risks

Phase 3 is a strong personal prototype, not a production general-purpose browser. The original
deny-by-default security posture remains; new capabilities must be accepted and designed
deliberately rather than enabled as compatibility shortcuts.

| Priority | Risk | Current Phase 3 position | Exit criterion |
| --- | --- | --- | --- |
| Critical | Arbitrary-site browser security | Electron is hardened, but Lattice does not claim Chrome-equivalent site isolation, anti-exploitation, Safe Browsing, extension review, or patch response. | Threat model, Electron upgrade SLA, security regression suite, incident/update process, and explicit product-claim boundary. |
| Critical | Unsigned distribution | The portable executable is intentionally `NotSigned`; there is no installer or updater. | Protected signing identity, signed installer and update metadata, rollback/recovery, and release-channel design. |
| High | OAuth and popup compatibility | All popups are denied, so many login flows fail. | Brokered child-view design with opener isolation, strict rules, lifecycle tests, and clear consent. |
| High | Downloads | All downloads are canceled. | Intent-driven download manager, safe destinations, filename handling, quarantine/reputation integration, progress/cancel, and cleanup tests. |
| High | Permissions and devices | Camera, microphone, location, notifications, MIDI, USB, serial, Bluetooth, and screen capture are denied. | Per-origin policy store and UX, narrow grants, revocation, indicators, privacy review, and tests. |
| High | External protocols and credentials | Non-HTTPS navigation, external schemes, and client certificates are denied; passkeys, DRM, mail links, and enterprise authentication are unsupported or unproven. | Explicit broker designs and adversarial integration tests for each supported capability. |
| High | Vault reparse/TOCTOU safety | Canonical containment and link checks exist, but a local actor may race filesystem changes between checks and publication. | Handle-based Windows validation or documented local-attacker assumption, plus reparse-point adversarial tests. |
| High | Atomic-write portability | Hard-link publication is proven on local Windows storage, not network, FAT, cloud, or virtual filesystems. | Capability detection, safe fallback contract, startup cleanup, OneDrive/network tests, and fault injection. |
| High | Persistent browsing data | Website cookies/cache persist with no profile, incognito, retention, export, or secure-delete model. | Privacy model and tested profile lifecycle. |
| Medium | Session restoration depth | Versioned, bounded URL/desktop restoration and explicit session reset pass; history stacks, scroll, form state, crash-loop suppression, and stale-origin diagnostics are not persisted. | Crash recovery policy, failure counters, stale-origin UX, and explicit privacy/retention controls. |
| Medium | Desktop delete/move semantics | Create and safe rename work; delete, tab move, and optional folder migration are not implemented. Rename intentionally leaves existing Obsidian folders unchanged. | UX and transactional rules that never silently orphan, overwrite, or bulk-move Obsidian notes. |
| Medium | Multi-window routing | One window owns multiple views, but IPC handlers remain process-global and multi-window ownership is not designed. | Window-scoped routing, idempotent protocol setup, ownership tests, crash recovery, and macOS reopen coverage. |
| Medium | Native-view composition | Default and 920 px layouts plus packaged bounds passed. Multi-monitor moves, DPI matrix, zoom, minimize, resize storms, GPU failure, and accessibility zoom remain untested. | Automated viewport/DPI matrix and transition/overlay visual regression tests. |
| Medium | Obsidian integration depth | Foldered Markdown, stable desktop IDs, atomic reading-state transitions, and library read-back pass, but Obsidian itself, plugins, sync providers, backlinks, conflicts, and external rename behavior are untested. | Real-vault and sync-provider matrix, schema versioning, conflict policy, and Obsidian launch/open-note integration. |
| Medium | Public-network smoke dependency | Packaged integration requires `https://example.com`, so offline, proxy, interception, or DNS failures can fail it. | Split deterministic local package checks from a networked integration gate and add proxy diagnostics. |
| Medium | Trusted-shell stored data | Desktop preferences and the vault display path persist locally. Packaged CSP blocks network egress, but future shell networking could widen exposure. | Minimize stored/displayed paths, add clear/reset controls, preserve CSP, and threat-review every shell network capability. |
| Medium | Runtime preference observability | Electron exposes no public getter for fully resolved view preferences. The gate proves constructor intent and effective isolation behavior instead. | Retain behavioral probes, use upstream introspection if added, and require review for preference construction changes. |
| Medium | Supply chain | Versions and lockfile are pinned and the package source manifest is verified, but there is no CI audit, SBOM, signed provenance, or update bot. | CI audit/SBOM/provenance checks and dependency-update ownership. |
| Low | Product quality attributes | Broader accessibility, localization, large-tab performance, memory pressure, battery use, telemetry, backup, and recovery are not characterized. | Define measurable NFRs and test them before beta. |

Phase 4 must preserve the trusted-shell/remote-site separation and treat each relaxation of a
denied browser capability as a separate security and product decision.
