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
  const click = async (scope: string, text: string) => {
    await evaluate(
      `(() => { const button = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find(item => item.textContent?.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error(${JSON.stringify(`Missing enabled button: ${text}`)}); button.click(); })()`,
    );
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
  await wait(
    "Boolean(document.querySelector('[data-workspace-home]')) && !document.querySelector('.ws-header-actions button')?.disabled",
    "Home loaded",
  );
  await create("Markdown note", "Workspace smoke note", "[data-markdown-preview]");
  await click(".ws-document-tools", "Write");
  await wait("Boolean(document.querySelector('.ws-source'))", "Markdown source");
  const content =
    "# Living workspace\n\n- [ ] Review the board\n\n> Local and inspectable.\n\n[[Workspace smoke board.coach]]\n\n| Name | Status |\n| --- | --- |\n| Editor | Ready |\n";
  await fill(".ws-source", content);
  await click(".ws-navigation", "Home");
  await wait("Boolean(document.querySelector('[data-workspace-home]'))", "Home switch");
  await click(".ws-navigation", "Files");
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
  await click(".ws-tabs", "Workspace smoke note.md");
  await click(".ws-document-tools", "Open beside");
  await wait("Boolean(document.querySelector('.ws-split-picker'))", "split picker");
  await click(".ws-split-picker", "Workspace smoke board.coach");
  await wait(
    "document.querySelectorAll('.ws-panes.is-split .ws-document').length === 2",
    "two file panes",
  );
  const editorScreenshotPath = await capture("workspace-studio-editor.png");
  await click(".ws-navigation", "Home");
  await wait("Boolean(document.querySelector('[data-workspace-home]'))", "Home restored");
  await fill('[aria-label="Quick capture"]', "Workspace studio Inbox smoke");
  await click(".ws-capture", "Capture");
  await wait(
    "document.querySelector('[data-workspace-home]')?.textContent.includes('Workspace studio Inbox smoke')",
    "Inbox capture visible",
  );
  const homeScreenshotPath = await capture("workspace-studio-home.png");
  await click(".ws-navigation", "Files");
  await click(".ws-panes > .ws-document .ws-document-tools", "Write");
  const renamedDraft = `${content}\nDraft retained across an explicit rename.\n`;
  await fill(".ws-panes > .ws-document .ws-source", renamedDraft);
  await click(".ws-panes > .ws-document .ws-document-header", "Workspace smoke note");
  await wait("Boolean(document.querySelector('.ws-rename-form'))", "file rename form");
  await fill('[aria-label="New title"]', "Workspace renamed note");
  await click(".ws-rename-form", "Rename");
  await wait(
    "Boolean(document.querySelector('[data-workspace-file=\"Workspace renamed note.md\"]')) && !document.querySelector('.ws-rename-form')",
    "file renamed",
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
    "document.querySelector('.ws-panes > .ws-document .ws-document-status')?.textContent.includes('Saved locally')",
    "renamed draft saved",
  );
  const renameScreenshotPath = await capture("workspace-title-editing.png");
  await evaluate("document.querySelector('.ws-tree [aria-label=\"Rename folder Inbox\"]').click()");
  await wait("Boolean(document.querySelector('.ws-rename-form'))", "folder rename form");
  await fill('[aria-label="New title"]', "Incoming");
  await click(".ws-rename-form", "Rename");
  await wait(
    "Boolean(document.querySelector('.ws-tree [aria-label=\"Rename folder Incoming\"]')) && !document.querySelector('.ws-rename-form')",
    "Inbox folder renamed",
  );
  await click(".ws-navigation", "Home");
  await fill('[aria-label="Quick capture"]', "Captured after renaming Inbox");
  await click(".ws-capture", "Capture");
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
    renameScreenshotPath,
    homeScreenshotPath,
    editorScreenshotPath,
  };
}
