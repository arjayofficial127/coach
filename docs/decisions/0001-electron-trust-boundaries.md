# ADR 0001: Separate the trusted shell from website content

Status: Accepted; amended for Phase 1  
Date: 2026-08-28

## Context

Lattice needs both privileged local-vault operations and the ability to display arbitrary websites.
Giving a website access to Electron or filesystem capabilities would turn a normal web compromise
into local code or data access.

## Decision

Use two explicit trust domains:

- The trusted React shell runs in its own `persist:lattice-shell` session so validated desktop
  preferences can survive restart. Packaged assets are served only from `lattice://app` by a
  handler installed on that session. A response CSP denies network connections and framing.
  Packaged builds never honor the Vite development URL.
- Websites run in a separate `persist:lattice-remote` session inside a native
  `WebContentsView`. The site gets no preload. Sandbox and context isolation are enabled; Node,
  workers/subframe Node integration, `<webview>`, insecure content, and experimental features are
  disabled.

The only privileged renderer API is the narrow shell `contextBridge`. Main-process IPC rejects
calls unless the sender is the expected `BrowserWindow`, the frame is its main frame, the parsed
origin is trusted, and the payload passes a task-specific Zod schema. Vault paths remain owned by
the main process.

Remote navigation is HTTPS-only. Permissions, device permissions, popups, downloads, client
certificate selection, non-HTTPS redirects, and external protocols remain denied in Phase 1.

Smoke runs use unique in-memory shell and remote sessions so tests cannot alter the real persistent
browsing profile.

## Consequences

- A remote website cannot call the vault API even if it knows the IPC channel names.
- Shell compromise remains important, but its network egress is restricted in packaged builds.
- OAuth popups, downloads, permission grants, client-certificate authentication, external handlers,
  and HTTP-only sites do not work yet.
- The production website partition intentionally retains cookies and cache; privacy controls are a
  future design decision.
- The trusted shell now retains desktop preferences, but packaged CSP still prevents it from
  transmitting them over the network.

## Verification

The packaged smoke observes separate sessions, no remote Node/bridge/`<webview>` APIs, exercised
popup and permission denials, the strict shell CSP, and an end-to-end privileged call originating
from the trusted shell.

References: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security),
[session permissions](https://www.electronjs.org/docs/latest/api/session), and
[custom protocols](https://www.electronjs.org/docs/latest/api/protocol).
