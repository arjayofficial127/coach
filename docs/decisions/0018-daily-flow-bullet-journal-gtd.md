# ADR 0018: Daily Flow combines bullet journaling with a bounded GTD funnel

**Status: Accepted for Phase 14**

## Context

Lattice needs a second runnable app for a user who is rebuilding focus. A traditional task manager
can create another backlog to maintain, while a plain journal does not make the next action clear.
The useful overlap is a fast bullet-journal capture stream feeding a deliberately small GTD funnel.

## Decision

- Add **Daily Flow** as the second trusted-shell runnable app. It captures a task, note, or event in
  one field; notes and events go directly to the log, while tasks enter Inbox for clarification.
- Use the explicit task lanes Inbox, Today, Next, Waiting, and Someday. Waiting requires a named
  person or dependency. Completed and cancelled entries remain visible in the Log.
- Limit Today to three open tasks and Now to one. These are model invariants, not only presentation
  hints, so malformed or scripted input cannot silently create an unlimited focus list.
- Never roll unfinished Today tasks forward automatically. Daily Flow shows carryover and requires
  an explicit choice to migrate to today, move to Next or Someday, or cancel.
- Preserve the original capture as immutable data. Organizing, migrating, choosing Now, completing,
  cancelling, reopening, and correcting text append timestamped activity entries. The latest valid
  activity determines the effective view without erasing the earlier record.
- Starting focus from Now creates a 25-minute Pomodoro linked by the journal item ID. Stopping or
  completing that timer does **not** complete the journal task; task completion remains a separate,
  explicit action.
- Evolve runnable-app storage from schema version 1 to version 2 under the existing profile-scoped
  key. A valid version-1 Pomodoro migrates losslessly and receives an empty Daily Flow journal.
- Keep the feature inside the existing trusted renderer boundary. It receives no new IPC, network,
  filesystem, vault, notification, or remote-site capability. State remains local to the active
  named profile and is bounded to 1,000 items with 64 activities per item.

## Consequences

The user gets a calm daily decision surface rather than an infinitely prioritized task database.
Captures and corrections are inspectable, and the timer can support focus without inventing work
outcomes. The local log is personal productivity data, not tamper-proof evidence. Projects,
recurrence, calendars, reminders, Obsidian export, cross-device sync, and automated weekly review
remain separate product decisions.

## Verification

Pure model tests cover capture types, Waiting validation, the Today/Now limits, explicit carryover,
append-only completion/reopen/correction/cancellation, malformed-state repair, and version-1
Pomodoro migration. Development, packaged, and installed Electron smoke capture a task, clarify it
into Today, choose Now, start and stop a linked Pomodoro, explicitly complete the journal task,
append corrected wording, read the profile-scoped version-2 state back, and verify the remote native
view is hidden throughout the trusted Daily Flow surface.
