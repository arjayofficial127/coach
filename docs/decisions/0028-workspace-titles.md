# ADR 0028: Explicit workspace file and folder titles

## Plan and Definition of Done

- Add trusted, desktop-relative rename IPC; preserve bytes, extension, and existing destinations.
- Expose Rename in the file tree and editor heading. Remove the redundant full-path subtitle.
- Keep dirty drafts, tabs, split selection, and nested folder navigation after a rename.
- Preserve the logical Inbox/Notes/Files/Planner roles when their physical folders are renamed.
- Warn that source links are not automatically rewritten. Never rename from a background action.
- Cover collisions, invalid paths/names, stale entries, junctions, nested folders, role persistence,
  and draft remapping. Run source, packaged, installer and browser interaction checks before commit.
- Preserve unrelated main-branch work and make one focused commit.

## Boundaries

File names are filesystem names. File extensions remain fixed, and renaming does not rewrite a
Markdown heading, frontmatter, or a Coach object's internal title. Existing Coach document/board
title fields continue to edit object content explicitly. No deletion or general file-moving UI is
introduced. The desktop root continues to use the existing sidebar desktop-name control.

## Decisions

- Rename is a strict, trusted-shell IPC command with desktop-relative paths, kind, new name, and
  expected modification time. The renderer never receives an absolute path or filesystem handle.
  Existing trusted-frame checks and remote WebContentsView isolation are unchanged.
- File destinations use exclusive hard-link creation followed by removal of the old directory
  entry. This retains bytes and modification time, rejects occupied destinations, and lets the
  existing draft revision be saved under its new name. Bounded Windows lock retries and identity-
  checked rollback handle failures. There is no copy/delete fallback on unsupported filesystems.
- Windows folder renames retain their subtree. Non-Windows folder rename is refused until an
  equivalent non-replacing primitive is available. Case-insensitive sibling checks match Windows.
- `.coach/workspace.json` optionally maps each logical area to its physical folder. Old manifests
  retain defaults. An explicit top-level area rename updates this map; metadata-write failure
  attempts to restore the original name without replacing an occupant.
- Workspace mutations are serialized per canonical connected root. Renderer sessions remap cached
  paths while keeping contents, unsaved drafts, and session history. Saves and other operations are
  blocked while the current rename is pending.
- The tree exposes visible pencils; file and folder headings also open the explicit rename form.
  Names and content titles remain separate, and a warning explains manual link repair.

## Risks and limits

- This is not a cross-process filesystem transaction. External programs can race a check, and a
  process or power failure between filesystem and metadata steps may require manual inspection.
  A crash during file rename can leave both names referring to the same unchanged file. A crash
  during an area rename can leave its role metadata out of sync; no automatic content repair is
  attempted. Backups remain the user's responsibility.
- File renaming requires hard-link support, normally NTFS on Windows; some removable or network
  filesystems will refuse it. Folder renaming is Windows-only. Locked items can require a retry.
- There is no automatic link, heading, frontmatter, or internal Coach-object title rewrite. Existing
  references may become unresolved. General moves and all note deletion remain out of scope.
- Directory reads can race mutations and require Refresh. Dirty drafts remain session-only, not
  durable crash recovery. Names are validated against existing path/name limits.

## Verification

- App-scoped Biome, TypeScript, build, and all 176 tests across 35 files passed.
- Browser-preview interaction checks passed: heading rename, unsaved draft retention, save after
  rename, visible tree pencils, name-collision rejection, cancel, and capture after Inbox rename.
  Visual inspection confirmed a focused title form and removal of the repeated full-path subtitle.
- Packaged smoke passed, including file/folder rename, unchanged on-disk bytes until explicit Save,
  retained unsaved text, renamed Inbox capture, and the existing security/isolation checks.
- Installer build and guarded install/smoke/uninstall lifecycle passed. Installed rename checks
  passed, the hardened package was unchanged, and the disposable installation/registry/shortcut
  were removed without configuring user-data deletion. The installer remains unsigned.
- Source manifest matched the tested package (`ad1bfe368d55f55d346ac34db4fd5352a99395b7454bb94cc9fe9044835e8869`).
  Current evidence is retained locally under ignored `artifacts/workspace-titles/`; historical
  tracked phase artifacts are restored so this commit contains only the title-editing work.
- Root-wide `pnpm run package` still includes unrelated untracked `website/frontend/public/coach-mark.svg`
  with a pre-existing Biome SVG accessibility error. A post-build root check also flags generated
  `release/installer-build-evidence.json` line endings. App-scoped lint plus the same type/test/build/
  packaging stages are used; no unrelated website or browser/dashboard edits are included here.
