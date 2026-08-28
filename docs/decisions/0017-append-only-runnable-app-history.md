# ADR 0017: Append-only local runnable-app history

**Status: Accepted for Phase 13**

## Context

Lattice needs small tools that can be run inside the focus workspace. The first tool is Pomodoro:
the user names a task, runs a clock, and explicitly stops or completes it. Human corrections must be
possible without silently replacing what the application originally observed.

## Decision

- Introduce a trusted-shell **Runnable apps** surface backed by a typed local app catalog. Pomodoro is
  the first catalog entry; future apps must receive their own state model and verification.
- Store runnable-app state under the active local profile key. No runnable app gains remote-site,
  Node, filesystem, vault, or network authority.
- Reconstruct a running timer from its saved accumulated duration and last-resumed timestamp so it
  continues across navigation and application relaunch.
- Require explicit user action to pause, resume, stop, or complete. Reaching the planned duration
  does not infer completion.
- On stop or completion, append an immutable original record containing the task, planned duration,
  start time, observed elapsed duration, outcome, and end time.
- Model every correction as a new timestamped entry referencing that original. The latest correction
  is the effective display result, but the UI and persisted record retain the original outcome and
  every prior correction.
- Bound task length, duration, correction notes, elapsed values, and retained history. Malformed
  persisted entries fail closed rather than being interpreted as work records.

## Consequences

The user can honestly correct a forgotten or inaccurate timer—for example, from “Stopped at 12m” to
“Completed at 1h”—while keeping an inspectable record of both claims. Profile switching separates
work contexts. The records remain personal productivity data, not tamper-proof audit evidence: local
clock changes and a local actor can alter shell storage.

## Verification

Pure model tests cover start, pause, resume, stop, correction, original preservation, invalid-state
repair, and parallel-run rejection. Packaged and installed smoke exercise the rendered controls,
verify profile-scoped persistence, prove the original stopped result survives a completed one-hour
override, ensure no native website view overlays the trusted app, and capture visual evidence.
