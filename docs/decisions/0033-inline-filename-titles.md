# ADR 0033: Inline filename titles and automatic note saving

## Decision

Markdown notes use one title: the editable line above the body and the physical filename stem are
the same value. The Markdown body's first line is content, not hidden title metadata. New notes are
empty and take the smallest available local name: `Untitled.md`, `Untitled 1.md`, `Untitled 2.md`,
and so on, reusing gaps without overwriting an existing file.

Leaving the inline title or pressing Enter attempts an exclusive rename. A same-folder collision
restores the last saved title and shows the existing safe rename error. Arrow Up from the first
body line moves to the title at the same approximate column; Arrow Down moves back to the body.

Content changes save after a 600 ms quiet period. Ctrl+S remains an immediate flush. Existing
revision checks still reject external edits, drafts remain open after a failed save, and tab close
does not discard a pending draft.

## Boundaries

File extensions remain fixed. Matching titles in different folders and matching document contents
are allowed. Existing generated capture filenames retain their legacy readable presentation, while
new captures and notes use collision-numbered readable filenames. Renaming still does not rewrite
Markdown links; Connections identifies references that need an explicit edit.
