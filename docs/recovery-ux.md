# Recovery and undo UX

Lattice uses layered recovery so a person rebuilding focus does not need to remember a different
escape route for every surface.

## Consistent controls

- `Esc` exits Focus view and closes transient overlays where applicable.
- A bottom-right recovery bar appears for 10 seconds after a reversible shell action. Its action is
  explicit, and `Ctrl+Z` invokes it when focus is not inside an editable field.
- Only the newest global recovery action is retained. Starting another reversible action replaces
  the previous bar.
- Canvas has its own visible Undo and Redo controls and a 100-step draft history. `Ctrl+Z` and
  `Ctrl+Shift+Z` operate on Canvas while the editor is open.
- Leaving a dirty Canvas asks before discarding the draft.

## Covered actions

| Area | Recovery behavior |
| --- | --- |
| Focus | `Esc` exits; entering Focus also offers **Exit focus** |
| Browser tabs | Closing one or all tabs offers URL-and-desktop restoration |
| Desktops | Rename, tab move, and deletion of an already-empty desktop offer Undo |
| Profiles and settings | Profile rename and restore-tabs preference changes offer Undo; vault disconnect offers Reconnect |
| Saved links | Save, metadata/status changes, and removal are recoverable |
| Canvas | Draft edits have Undo/Redo; creation and removal are recoverable; a completed save offers **Restore version** |
| Pomodoro, Daily Flow, Wealth Lab | State mutations offer immediate Undo; correction/audit records remain the long-term history model |

## Vault file safety

Removing a Lattice Markdown capture or Canvas page atomically renames the original file into the
selected vault's hidden `.lattice-trash` folder. Undo restores the same file to the same location.
The app refuses to overwrite a new file that appears at the original location.

The one-click restore token is intentionally process-local and offered for 10 seconds. A file left
in `.lattice-trash` survives app restart for manual recovery; Lattice does not automatically purge
that folder.

## Explicitly irreversible boundaries

Website-data clearing and profile-picture deletion require an explicit confirmation because their
underlying Electron operations cannot be truthfully undone. Lattice does not claim to restore a
closed page's navigation stack, scroll position, form state, media state, or in-page application
state. It restores only the bounded shell state it owns.
