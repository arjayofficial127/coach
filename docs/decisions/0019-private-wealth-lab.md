# ADR 0019: Wealth Lab records private money decisions without financial authority

**Status: Accepted for Phase 15**

## Context

Lattice needs a third runnable app that helps the user understand money, create ways to earn more,
invest more consistently, and measure whether net worth is improving. A personal tracker is useful;
a browser feature that impersonates a bank, predicts returns, or gives security-specific advice
would introduce materially different risk and authority.

## Decision

- Add **Wealth Lab** as a trusted-shell, active-profile-local runnable app with four calm sections:
  Overview, Money, Earn more, and Net worth.
- Use one explicit currency for Phase 15: Philippine pesos. Store all values as bounded safe integer
  centavos, parse at most two decimal places, and perform no foreign-exchange conversion.
- Record income, spending, and investment contributions as distinct ledger kinds. Net cash is income
  minus spending; contributions are reported separately as allocation, not counted again as an
  expense. Savings and investment rates are descriptive ratios, not forecasts.
- Keep every ledger original. Corrections append a complete corrected value, while void and restore
  append state transitions. No entry is silently replaced or deleted.
- Treat an earning idea as an experiment with a hypothesis, smallest next test, optional unverified
  monthly upside, and explicit Idea, Testing, Earning, Paused, or Retired status. The first idea is
  featured so the overview presents one money move rather than an idea backlog.
- Let the featured idea start a linked 25-minute Pomodoro. A timer outcome never changes the idea’s
  status or creates income; real earning evidence must be recorded separately.
- Record occasional assets-minus-liabilities snapshots. Corrections append and retain the original
  snapshot. The product does not fetch live prices or value assets on the user’s behalf.
- Evolve runnable-app storage from version 2 to version 3 under the same profile-scoped key. Existing
  Pomodoro and Daily Flow data migrate losslessly with an empty Wealth Lab state.
- Add no bank or brokerage connection, credentials, transaction import, market feed, network access,
  filesystem or vault access, trade execution, tax calculation, investment recommendation, or
  performance promise.

## Consequences

The user gets a truthful monthly picture, an explicit investing habit, and a small experiment loop
for improving income. The data remains manually entered personal planning data—not audited
accounting, tax reporting, financial advice, or tamper-proof evidence. One-currency tracking avoids
fake precision until a reviewed multi-currency/FX model exists.

## Verification

Pure tests cover precise PHP parsing, monthly summaries, contribution separation, append-only ledger
correction, void/restore, targets, earning-idea status and correction, net-worth correction,
malformed-state repair, and version-2 migration. Development, packaged, and installed Electron smoke
set targets; record income, spending, and a contribution; correct spending while preserving the
original; move one earning idea to Testing; record a net-worth snapshot; run and explicitly stop a
linked Pomodoro; verify version-3 profile storage and the visible safety boundary; and capture the
real overview with the remote website view hidden.
