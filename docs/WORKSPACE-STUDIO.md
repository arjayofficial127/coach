# Work with local notes and boards in Coach

Open **Files & Inbox** for the selected desktop. The selected desktop stays highlighted in the
sidebar, and the workspace's folder name and **Manage in Settings** link identify its local home.
**Open in Explorer** is optional; creating, browsing, and editing happen inside Coach.

## Home and files

Home shows your latest files, an Inbox with quick capture, and board cards dated for today.
**Capture active browser tab** saves its title and HTTPS URL into this desktop's Inbox.
Nothing appears until it exists in your local workspace; there are no sample tasks to clean up.

Expand folder arrows to browse the tree. Click a folder name to enter it, then choose **New** to
create a folder, Markdown note, text file, Coach document, or Coach board there. A Markdown note
opens immediately as the first available **Untitled**, **Untitled 1**, **Untitled 2**, and so on;
gaps are reused. Files can sit at the desktop root or inside nested folders. The creation menu
states the destination explicitly.
**Recent** and **Find a file** search the indexed filenames and relative paths.

## Edit file and folder titles

The large editable line above a note is its filename without the extension. Moving upward from the
body's first line enters the title; moving downward returns to the body. Leaving the title renames
the physical file. A title already used in the same folder is rejected and the previous title is
restored. File extensions stay fixed.

Click the pencil beside a file or folder in the tree for the explicit rename form. Enter its new
name and choose **Rename**; **Cancel** leaves it unchanged.
Renaming preserves file contents, open drafts, and the files inside renamed folders. The editor
shows a readable title without repeating the filename as a subtitle; tabs retain the full filename.

Inbox, Notes, Files, and Planner folders can be renamed too. Their roles are stored in `.coach`
metadata, so quick captures continue into the renamed Inbox. The desktop's display name still uses
the sidebar pencil.

Markdown filenames and displayed note titles are one-to-one; a heading inside the Markdown body is
ordinary content. Coach object title fields remain object content. Renames do not rewrite links:
review **Connections** and update affected source links manually.
Occupied names and stale file revisions are rejected instead of replacing existing work.

## Notes and split view

Markdown opens in its calm editor with headings, checklists, tables, callouts, and links. Changes
save automatically after a short pause; Ctrl+S flushes the file pane immediately. **Markdown
source** exposes the original source, with **Insert block** (Ctrl+/) for common structures.

Use `[[Notes/Research.md]]` or `[Research](Notes/Research.md)` to connect files. **Connections**
shows incoming and outgoing links from the indexed files. Missing or ambiguous targets need an
explicit source edit; Coach does not guess a repair. HTTPS sources open in the browser on click.

Choose **Open beside** and select another file to place a board beside a note. On narrow layouts,
the files stack. Returning Home, changing folders, or closing the split does not discard drafts.

## Coach boards

Create a **Coach board** to work with Next, Doing, and Done columns. Rename columns, add cards,
edit titles, change status, set a due date, and link a note. **Table** shows editable rows;
**Calendar** places dated cards in the selected month. Save to persist the changes in `.coach` JSON.
**View JSON** exposes the underlying object. Unknown properties are preserved and unknown object
kinds use the JSON editor. Files never execute code.

## Save and recovery boundaries

**Saved locally**, **Saving**, and **Unsaved changes** distinguish disk state from a draft. A file changed outside
Coach cannot be overwritten using an old revision. **Reload saved file** asks before discarding your
draft. Copy important draft text elsewhere first if you need to merge competing edits.

**Session history** restores one of the last five saved versions and autosaves it after the normal
short pause. These copies last only while Coach stays open. They are not permanent version history
or crash recovery. Back up the connected folder independently.

Refresh after editing files outside Coach. Large workspaces show a partial-index notice when the
preview/index budget is exceeded; direct folder navigation remains available. The current editor
supports `.md`, `.text`, and `.coach`; use Explorer for other file formats. Notes are never deleted
here, and moving files between folders is not yet supported. Archiving a desktop never deletes its
notes. Folder renaming currently targets the Windows app; file renaming requires a filesystem that
supports hard links (such as NTFS). Unsupported operations fail without a copy/delete fallback.
