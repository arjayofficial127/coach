# Repository workflow

- Work in implementation/code mode unless the user explicitly requests planning, diagnosis, or
  review only.
- Complete phases and queued implementation tasks sequentially.
- After a phase or task passes its relevant gates, create a focused Git commit with a concise,
  descriptive message before moving to the next queued task.
- After that commit, continue to the next already-defined task without asking for routine
  confirmation. Stop only when the next scope needs a material product choice, new authority, or
  cannot pass its gates safely.
- Do not commit incomplete or failing work. If a gate cannot pass, document the blocker and stop
  rather than hiding it in a commit.
- Preserve unrelated user changes and keep each commit scoped to the phase or task it completes.
