import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { IPC } from "../shared/contracts";

export interface WorkspaceStudioEvidence {
  home: boolean;
  markdown: boolean;
  board: boolean;
  split: boolean;
  inbox: boolean;
  draftRetained: boolean;
  table: boolean;
  calendar: boolean;
  fileRename: boolean;
  folderRename: boolean;
  renameDraftRetained: boolean;
  renamedInboxCapture: boolean;
  readableCaptureTitles: boolean;
  calmNote: boolean;
  calmNoteScreenshotPath: string;
  renameScreenshotPath: string;
  homeScreenshotPath: string;
  editorScreenshotPath: string;
}

/** Runs only in the disposable packaged/installer smoke profile, never the user's desktop. */
export async function verifyWorkspaceStudio(
  window: BrowserWindow,
  smokeRoot: string,
): Promise<WorkspaceStudioEvidence> {
  const evaluate = <T>(source: string) =>
    window.webContents.executeJavaScript(source) as Promise<T>;
  const wait = async (source: string, label: string) => {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(source)) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`Workspace studio gate: ${label}`);
  };
  const click = async (scope: string, label: string) => {
    const isNote = await evaluate<boolean>(
      "Boolean(document.querySelector('.ws-studio[data-calm-note=\\\"true\\\"]'))",
    );
    if (
      isNote &&
      (scope.includes(".ws-files-dashboard") ||
        scope.includes(".ws-tree") ||
        (scope === ".ws-header-actions" && label === "New"))
    ) {
      await evaluate(
        "(() => { const toggle = document.querySelector('[aria-label=\\\"Toggle folders and search\\\"]'); if(toggle?.getAttribute('aria-expanded') === 'false') toggle.click(); })()",
      );
      if (scope === ".ws-header-actions") scope = ".ws-folder-tools";
    }
    if (scope.includes(".ws-document-tools")) {
      scope = ".ws-toolbar-slot .ws-document-tools";
      await evaluate(
        "(() => { const toggle = document.querySelector('.ws-toolbar-slot [aria-label^=\\\"Note tools for\\\"]'); if(toggle?.getAttribute('aria-expanded') === 'false') toggle.click(); })()",
      );
      if (label === "Write") label = "Markdown source";
    } else if (scope.includes(".ws-document-header") && label === "Save")
      scope = ".ws-toolbar-slot";
    await evaluate(`(() => {
      const button = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find(item => item.textContent?.trim() === ${JSON.stringify(label)});
      if (!button || button.disabled || !button.getClientRects().length) throw new Error('Missing visible enabled workspace control: ' + ${JSON.stringify(label)});
      button.click();
    })()`);
  };
  const fill = async (selector: string, value: string) => {
    await evaluate(
      `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Missing workspace input'); const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
  };
  const create = async (label: string, name: string, selector: string) => {
    await click(".ws-header-actions", "New");
    await wait("Boolean(document.querySelector('.ws-new-menu'))", "creation menu");
    await click(".ws-new-menu", label);
    await wait("Boolean(document.querySelector('.ws-create-form'))", "creation form");
    await fill('[aria-label="New item name"]', name);
    await wait("Boolean(document.querySelector('.ws-create-form input')?.value)", "name accepted");
    await click(".ws-create-form", "Create");
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, `${label} created`);
  };
  const capture = async (name: string) => {
    window.setSkipTaskbar(true);
    window.showInactive();
    try {
      // Hidden windows can return stale compositor pixels even after the DOM is ready.
      await evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      const captured = await window.webContents.capturePage();
      const size = captured.getSize();
      if (captured.isEmpty() || size.width < 900 || size.height < 600)
        throw new Error("Workspace screenshot did not capture the full application window");
      const target = path.join(smokeRoot, name);
      await writeFile(target, captured.toPNG());
      return target;
    } finally {
      window.hide();
    }
  };
  window.webContents.send(IPC.shellCommand, "show-files");
  console.log("[smoke] workspace waiting for Home");
  await wait(
    "Boolean(document.querySelector('[data-workspace-home]')) && !document.querySelector('.ws-header-actions button')?.disabled",
    "Home loaded",
  );
  const navigationModeBeforeNote = await evaluate<string>(
    "document.querySelector('.lattice-shell')?.classList.contains('navigation-expanded') ? 'expanded' : 'compact'",
  );
  await create("Markdown note", "Workspace smoke note", ".ws-page-input");
  console.log("[smoke] workspace note created");
  await wait(
    `document.querySelector('[aria-label="Toggle folders and search"]')?.getAttribute('aria-expanded') === 'true' && document.querySelector('.ws-sidebar-surface')?.getClientRects().length > 0 && (document.querySelector('.lattice-shell')?.classList.contains('navigation-expanded') ? 'expanded' : 'compact') === ${JSON.stringify(navigationModeBeforeNote)}`,
    "opening a note preserves both sidebar state and the visible file sidebar",
  );
  await click(".ws-document-tools", "Write");
  await wait("Boolean(document.querySelector('.ws-source'))", "Markdown source");
  const content =
    "# Living workspace\n\n- [ ] Review the board\n\n> Local and inspectable.\n\n[[Workspace smoke board.coach]]\n\n| Name | Status |\n| --- | --- |\n| Editor | Ready |\n";
  await fill(".ws-source", content);
  await click(".ws-files-dashboard", "Files dashboard");
  await wait("Boolean(document.querySelector('[data-workspace-home]'))", "Home switch");
  await click(".ws-tree", "Workspace smoke note");
  await wait("Boolean(document.querySelector('.ws-document'))", "editor return");
  await click(".ws-document-tools", "Write");
  const draftRetained = await evaluate<boolean>(
    `document.querySelector('.ws-source')?.value === ${JSON.stringify(content)}`,
  );
  if (!draftRetained) throw new Error("Workspace draft lost across Home navigation");
  await click(".ws-document-header", "Save");
  await wait(
    "document.querySelector('.ws-document-status')?.textContent.includes('Saved locally')",
    "Markdown saved",
  );
  await click(".ws-document-tools", "Preview");
  await wait(
    "Boolean(document.querySelector('[data-markdown-preview] table')) && Boolean(document.querySelector('[data-markdown-preview] input[type=checkbox]'))",
    "rich Markdown rendered",
  );
  await create("Coach board", "Workspace smoke board", "[data-coach-board]");
  console.log("[smoke] workspace board created");
  await click(".ws-board-column", "Add card");
  await wait("Boolean(document.querySelector('[aria-label=\"Card title\"]'))", "card created");
  await fill('[aria-label="Card title"]', "Ship the workspace");
  await click(".ws-document-header", "Save");
  await wait(
    "document.querySelector('.ws-document-status')?.textContent.includes('Saved locally')",
    "board saved",
  );
  const roundTrip = await evaluate<{ board: boolean; markdown: boolean }>(
    `(async () => { const desktopId = document.querySelector('.ws-studio[data-desktop-id]').dataset.desktopId; const note = await window.lattice.localWorkspace.readFile({ desktopId, relativePath: 'Workspace smoke note.md' }); const board = await window.lattice.localWorkspace.readFile({ desktopId, relativePath: 'Workspace smoke board.coach' }); const object = JSON.parse(board.content); return { markdown: note.content === ${JSON.stringify(content)}, board: object.kind === 'board' && object.cards[0]?.title === 'Ship the workspace' }; })()`,
  );
  if (!roundTrip.board || !roundTrip.markdown)
    throw new Error("Workspace broker save/read round trip failed");
  await click(".ws-segmented", "Table");
  await wait("Boolean(document.querySelector('.ws-board-table'))", "table view");
  await click(".ws-segmented", "Calendar");
  await wait("Boolean(document.querySelector('.ws-calendar-grid'))", "calendar view");
  await click(".ws-tabs", "Workspace smoke note");
  await click(".ws-document-tools", "Open beside");
  await wait("Boolean(document.querySelector('.ws-split-picker'))", "split picker");
  await click(".ws-split-picker", "Workspace smoke board.coach");
  await wait(
    "document.querySelectorAll('.ws-panes.is-split .ws-document').length === 2",
    "two file panes",
  );
  const editorScreenshotPath = await capture("workspace-studio-editor.png");
  console.log("[smoke] workspace editor captured");
  await click(".ws-files-dashboard", "Files dashboard");
  await wait("Boolean(document.querySelector('[data-workspace-home]'))", "Home restored");
  await fill('[aria-label="Quick capture"]', "Workspace studio Inbox smoke");
  await click(".ws-capture", "Capture to Inbox");
  await wait(
    "document.querySelector('[data-workspace-home]')?.textContent.includes('Workspace studio Inbox smoke')",
    "Inbox capture visible",
  );
  const homeScreenshotPath = await capture("workspace-studio-home.png");
  console.log("[smoke] workspace Home captured");
  await wait(
    "document.querySelector('.ws-preview-card strong')?.textContent === 'Workspace studio Inbox smoke'",
    "capture card has a human title",
  );
  await wait(
    "(() => { const card = document.querySelector('.ws-preview-card'); return card?.textContent.split('Workspace studio Inbox smoke').length === 2 && !card.querySelector('p'); })()",
    "capture text appears exactly once on the card, without a filler preview",
  );
  const capturedNote = await evaluate<{
    name: string;
    relativePath: string;
    content: string;
    updatedAt: string;
  }>(`(async () => {
    const desktopId = document.querySelector('.ws-studio').dataset.desktopId;
    const listing = await window.lattice.localWorkspace.listDirectory({desktopId, relativePath: 'Inbox'});
    const entry = listing.entries.find(item => item.name.includes('Workspace studio Inbox smoke'));
    if (!entry) throw new Error('Missing captured note');
    return window.lattice.localWorkspace.readFile({desktopId, relativePath: entry.relativePath});
  })()`);
  await evaluate(
    "document.querySelector('.ws-preview-card[aria-label=\"Open Workspace studio Inbox smoke\"]').click()",
  );
  await wait(
    "document.querySelector('.ws-panes > .ws-document [aria-label=\"Document title\"]')?.value === 'Workspace studio Inbox smoke' && [...document.querySelectorAll('.ws-tabs button')].some(item => item.textContent.trim() === 'Workspace studio Inbox smoke')",
    "capture editor and tab have human titles",
  );
  await wait(
    "!document.querySelector('.ws-file-details') && !document.querySelector('.ws-document-tools') && document.querySelector('.ws-page-input')?.value === ''",
    "technical details closed and duplicate heading hidden",
  );
  await click(".ws-document-tools", "File details");
  await wait(
    `document.querySelector('.ws-panes > .ws-document .ws-file-details').textContent.includes(${JSON.stringify(capturedNote.name)})`,
    "exact filename available on demand",
  );
  await capture("workspace-readable-title.png");
  await wait(
    `document.querySelector('[aria-label="Document title"]')?.value === ${JSON.stringify(capturedNote.name.slice(0, -3))} && !document.querySelector('.ws-rename-form')`,
    "inline title shows the real filename stem without a rename form",
  );
  const readableCaptureTitles = await evaluate<boolean>(`(async () => {
    const desktopId = document.querySelector('.ws-studio').dataset.desktopId;
    const saved = await window.lattice.localWorkspace.readFile({desktopId, relativePath: ${JSON.stringify(capturedNote.relativePath)}});
    return saved.name === ${JSON.stringify(capturedNote.name)} && saved.content === ${JSON.stringify(capturedNote.content)} && saved.updatedAt === ${JSON.stringify(capturedNote.updatedAt)};
  })()`);
  if (!readableCaptureTitles) throw new Error("Title presentation changed the saved file");
  await click(".ws-file-details", "");
  // The title-only capture opens as one editable page, without changing its source or sidebars.
  await wait(
    "!document.querySelector('.ws-file-details') && !document.querySelector('.ws-document-tools') && !document.querySelector('.ws-link-context') && !document.querySelector('.ws-toolbar-slot .primary-action') && document.querySelector('.ws-sidebar-surface')?.getClientRects().length > 0",
    "quiet default note surface",
  );
  const calmNoteScreenshotPath = await capture("workspace-calm-note.png");
  await wait(
    "(() => { const stage = document.querySelector('.web-stage').getBoundingClientRect(); const page = document.querySelector('.ws-document').getBoundingClientRect(); const source = document.querySelector('.ws-page-input').getBoundingClientRect(); const header = document.querySelector('.ws-header').getBoundingClientRect(); return page.width >= 650 && source.width >= 500 && page.right <= stage.right + 1 && header.height < 90; })()",
    "readable note column with compact header and persistent sidebars",
  );
  await click(".ws-document-tools", "Markdown source");
  await wait(
    `document.querySelector('.ws-panes > .ws-document .ws-source')?.value === ${JSON.stringify(capturedNote.content)}`,
    "complete source still accessible",
  );
  await click(".ws-document-tools", "Edit note");
  await fill(".ws-panes > .ws-document .ws-page-input", "One new thought.");
  await evaluate(
    "document.querySelector('.ws-page-input').dispatchEvent(new KeyboardEvent('keydown', {key:'s',ctrlKey:true,bubbles:true}))",
  );
  await wait(
    "document.querySelector('.ws-toolbar-slot .ws-document-status')?.textContent.includes('Saved locally') && !document.querySelector('.ws-toolbar-slot .primary-action') && !document.querySelector('.ws-studio > .ws-notice')",
    "Ctrl+S saves page and hides idle Save",
  );
  const pageSaved = await evaluate<boolean>(`(async () => {
    const desktopId = document.querySelector('.ws-studio').dataset.desktopId;
    const saved = await window.lattice.localWorkspace.readFile({desktopId, relativePath: ${JSON.stringify(capturedNote.relativePath)}});
    return saved.content.startsWith(${JSON.stringify(capturedNote.content)}) && saved.content.endsWith('One new thought.');
  })()`);
  if (!pageSaved) throw new Error("Clean page save lost source prefix or body");
  await click(".ws-document-tools", "Session history");
  await evaluate("document.querySelector('.ws-history button:not(:first-of-type)').click()");
  await wait(
    "document.querySelector('.ws-toolbar-slot .ws-document-status')?.textContent.includes('Unsaved changes')",
    "history restore remains an unsaved draft",
  );
  await click(".ws-history", "Close history");
  await click(".ws-document-tools", "Reload saved file");
  await click(".ws-notice", "Keep editing");
  await wait(
    "document.querySelector('.ws-toolbar-slot .ws-document-status')?.textContent.includes('Unsaved changes')",
    "reload cancellation retains draft",
  );
  await click(".ws-document-tools", "Reload saved file");
  await click(".ws-notice", "Discard draft and reload");
  await wait(
    "document.querySelector('.ws-page-input')?.value.includes('One new thought.')",
    "explicit reload restores saved body",
  );
  await click(".ws-document-tools", "Connections");
  await wait(
    "Boolean(document.querySelector('.ws-link-context'))",
    "connections available on demand",
  );
  await click(".ws-link-context", "Close connections");
  await evaluate(
    "document.querySelector('.ws-toolbar-slot [aria-label^=\"Note tools for\"]').click()",
  );
  await evaluate(
    "document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}))",
  );
  await wait(
    "!document.querySelector('.ws-document-tools') && document.activeElement?.getAttribute('aria-label')?.startsWith('Note tools for')",
    "Escape closes tools and returns focus",
  );
  await click(".ws-tabs", "Workspace smoke note.md");
  await click(".ws-tree", "Workspace smoke note");
  await click(".ws-panes > .ws-document .ws-document-tools", "Write");
  const renamedDraft = `${content}\nDraft retained across an inline title rename.\n`;
  await fill(".ws-panes > .ws-document .ws-source", renamedDraft);
  await fill('[aria-label="Document title"]', "Workspace renamed note");
  await evaluate(
    "document.querySelector('[aria-label=\"Document title\"]').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true}))",
  );
  await wait(
    "Boolean(document.querySelector('[data-workspace-file=\"Workspace renamed note.md\"]')) && !document.querySelector('.ws-rename-form') && !document.querySelector('.ws-studio > .ws-notice')",
    "inline title renamed the file without a form or success banner",
  );
  await click(".ws-panes > .ws-document .ws-document-tools", "Write");
  const renameDraftRetained = await evaluate<boolean>(
    `document.querySelector('.ws-panes > .ws-document .ws-source')?.value === ${JSON.stringify(renamedDraft)}`,
  );
  const fileRename = await evaluate<boolean>(`(async () => {
    const desktopId = document.querySelector('.ws-studio').dataset.desktopId;
    const note = await window.lattice.localWorkspace.readFile({ desktopId, relativePath: 'Workspace renamed note.md' });
    const listing = await window.lattice.localWorkspace.listDirectory({ desktopId, relativePath: '' });
    return note.content === ${JSON.stringify(content)} && !listing.entries.some(item => item.name === 'Workspace smoke note.md');
  })()`);
  if (!fileRename || !renameDraftRetained)
    throw new Error("File rename changed the saved bytes or lost its open draft");
  await click(".ws-panes > .ws-document .ws-document-header", "Save");
  await wait(
    "document.querySelector('.ws-toolbar-slot .ws-document-status')?.textContent.includes('Saved locally')",
    "renamed draft saved",
  );
  const renameScreenshotPath = await capture("workspace-title-editing.png");
  await evaluate(
    "document.querySelector('.ws-tree [aria-label=\"More actions for folder Inbox\"]').click()",
  );
  await click(".ws-folder-menu", "Rename");
  await wait("Boolean(document.querySelector('.ws-rename-form'))", "folder rename form");
  await fill('[aria-label="New title"]', "Incoming");
  await click(".ws-rename-form", "Rename");
  await wait(
    "Boolean(document.querySelector('.ws-tree [aria-label=\"More actions for folder Incoming\"]')) && !document.querySelector('.ws-rename-form')",
    "Inbox folder renamed",
  );
  await click(".ws-files-dashboard", "Files dashboard");
  await fill('[aria-label="Quick capture"]', "Captured after renaming Inbox");
  await click(".ws-capture", "Capture to Inbox");
  await wait(
    "document.querySelector('[data-workspace-home]')?.textContent.includes('Captured after renaming Inbox')",
    "renamed Inbox still captures",
  );
  const renamedInboxCapture = await evaluate<boolean>(`(async () => {
    const desktopId = document.querySelector('.ws-studio').dataset.desktopId;
    const listing = await window.lattice.localWorkspace.listDirectory({ desktopId, relativePath: '' });
    const incoming = await window.lattice.localWorkspace.listDirectory({ desktopId, relativePath: 'Incoming' });
    return listing.areaFolders.Inbox === 'Incoming' && !listing.entries.some(item => item.name === 'Inbox') && incoming.entries.some(item => item.name.includes('Captured after renaming Inbox'));
  })()`);
  if (!renamedInboxCapture) throw new Error("Renamed Inbox lost its capture role");
  return {
    home: true,
    markdown: roundTrip.markdown,
    board: roundTrip.board,
    split: true,
    inbox: true,
    draftRetained,
    table: true,
    calendar: true,
    fileRename,
    folderRename: true,
    renameDraftRetained,
    renamedInboxCapture,
    readableCaptureTitles,
    calmNote: true,
    calmNoteScreenshotPath,
    renameScreenshotPath,
    homeScreenshotPath,
    editorScreenshotPath,
  };
}
