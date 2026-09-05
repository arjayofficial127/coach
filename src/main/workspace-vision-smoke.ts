import { writeFile } from "node:fs/promises";
import path from "node:path";
import { type BrowserWindow, WebContentsView } from "electron";
import { IPC } from "../shared/contracts";
import type { ProfileRuntime } from "./profiles/profile-runtime";

/** Disposable smoke profile only. No new testing capability is exposed to a renderer. */
export async function verifyWorkspaceVision(
  window: BrowserWindow,
  runtime: ProfileRuntime,
  smokeRoot: string,
) {
  const evaluate = <T>(source: string) =>
    window.webContents.executeJavaScript(source) as Promise<T>;
  const wait = async (check: () => Promise<boolean> | boolean, label: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Workspace vision gate: ${label}`);
  };
  const dom = (source: string, label: string) => wait(() => evaluate<boolean>(source), label);
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
  const fill = (selector: string, value: string) =>
    evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Missing vision input');
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  const screenshot = async (name: string) => {
    window.showInactive();
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    await new Promise((resolve) => setTimeout(resolve, 180));
    const image = await window.webContents.capturePage();
    if (image.isEmpty()) throw new Error("Empty workspace vision screenshot");
    const target = path.join(smokeRoot, name);
    await writeFile(target, image.toPNG());
    window.hide();
    return target;
  };
  await dom(
    "document.querySelector('[data-workspace-home]')?.getBoundingClientRect().height > 250 && document.querySelector('.web-stage')?.getBoundingClientRect().height > 400",
    "home not clipped",
  );
  await dom(
    "Boolean(document.querySelector('#workspace-sidebar-slot .ws-tree')) && Boolean(document.querySelector('#workspace-tabs-slot .ws-tabs'))",
    "one shared sidebar and tab strip",
  );
  await dom(
    "document.querySelector('.ws-files-context-back')?.textContent.includes('Files & Inbox')",
    "Files sidebar preserves its parent context",
  );
  await evaluate("document.querySelector('.ws-files-context-back').click()");
  await dom(
    "!document.querySelector('.ws-sidebar-surface')?.getClientRects().length && document.querySelector('.focus-navigation')?.getClientRects().length > 0",
    "Files sidebar returns to the main navigation",
  );
  window.webContents.send(IPC.shellCommand, "show-files");
  await dom(
    "document.querySelector('.ws-sidebar-surface')?.getClientRects().length > 0",
    "Files navigation can be reopened without leaving Files",
  );
  const visionHomeScreenshotPath = await screenshot("workspace-vision-home.png");
  console.log("[smoke] workspace vision Home");
  await click(".ws-header-actions", "New");
  await click(".ws-new-menu", "Planner");
  await dom("Boolean(document.querySelector('.ws-create-form'))", "planner creation form");
  await fill('[aria-label="New item name"]', "Vision planner");
  await click(".ws-create-form", "Create");
  await dom(
    "Boolean(document.querySelector('[data-workspace-file=\"Vision planner.coach\"] .ws-calendar-grid'))",
    "planner opens in calendar",
  );
  await click(".ws-tabs", "Workspace renamed note.md");
  await click(".ws-panes > .ws-document .ws-document-tools", "Write");
  const baseline =
    "# Workspace renamed note\n\nA note with an embedded local board.\n\n![[Workspace smoke board.coach]]\n";
  await fill(".ws-panes > .ws-document .ws-source", baseline);
  await click(".ws-panes > .ws-document .ws-document-header", "Save");
  await dom(
    "document.querySelector('.ws-toolbar-slot .ws-document-status')?.textContent.includes('Saved locally')",
    "embed note saved",
  );
  await click(".ws-panes > .ws-document .ws-document-tools", "Preview");
  await dom(
    "Boolean(document.querySelector('.ws-board-embed')) && document.querySelector('.ws-board-embed')?.textContent.includes('Ship the workspace')",
    "real board embed",
  );
  await click(".ws-board-embed", "Edit board beside");
  await dom(
    "document.querySelectorAll('.ws-panes .ws-document').length === 2",
    "embedded board opens original editor beside",
  );
  await click(".ws-panes > .ws-document .ws-document-tools", "Research beside");
  await dom(
    "Boolean(document.querySelector('[aria-label=\"Research web address\"]'))",
    "research pane opens",
  );
  await fill('[aria-label="Research web address"]', "https://example.com/");
  await evaluate("document.querySelector('.ws-research-address').requestSubmit()");
  await wait(
    () =>
      runtime.isVisible() &&
      runtime
        .snapshot()
        .tabs.some(
          (tab) =>
            tab.id === runtime.snapshot().activeTabId &&
            tab.url === "https://example.com/" &&
            !tab.loading,
        ),
    "live HTTPS source visible",
  );
  const native = window.contentView.children.find(
    (view) => view instanceof WebContentsView && view.getVisible(),
  );
  console.log("[smoke] workspace vision native source");
  await evaluate(
    "document.querySelector('.ws-toolbar-slot [aria-label^=\"Note tools for\"]').click()",
  );
  await wait(() => !runtime.isVisible(), "native source hidden behind note tools");
  await evaluate(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  await wait(() => runtime.isVisible(), "native source returns after note tools close");
  if (!(native instanceof WebContentsView))
    throw new Error("Research did not use a native WebContentsView");
  const hostileText =
    "A captured research passage.\n[[Private.md]]\n```\n<img src=x onerror=evil()>";
  const isolation = await native.webContents.executeJavaScript(`(() => {
    const p = document.createElement('p'); p.style.whiteSpace = 'pre-wrap'; p.textContent = ${JSON.stringify(hostileText)}; document.body.append(p);
    const range = document.createRange(); range.selectNodeContents(p); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return { isolated: typeof window.lattice === 'undefined' && typeof require === 'undefined' && typeof process === 'undefined', selection: selection.toString() };
  })()`);
  if (!isolation.isolated || native.webContents.session === window.webContents.session)
    throw new Error("Research source crossed trusted shell boundary");
  if (!isolation.selection.includes("[[Private.md]]"))
    throw new Error("Research selection fixture missing");
  let lastBoundsDiagnostic: unknown;
  const boundsMatch = async () => {
    const rect = await evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
      const r=document.querySelector('[data-workspace-source-viewport]')?.getBoundingClientRect(); if(!r) return {x:0,y:0,width:0,height:0};
      const s=document.querySelector('.web-stage').getBoundingClientRect(); const x=Math.max(r.left,s.left,0), y=Math.max(r.top,s.top,0);
      const bounds={x,y,width:Math.max(1,Math.min(r.right,s.right,innerWidth)-x),height:Math.max(1,Math.min(r.bottom,s.bottom,innerHeight)-y)};
      for(const overlay of document.querySelectorAll('.recovery-bar,.zoom-feedback')) {
        const o=overlay.getBoundingClientRect();
        if(o.width>0 && o.height>0 && o.right>bounds.x && o.left<bounds.x+bounds.width && o.bottom>bounds.y && o.top<bounds.y+bounds.height) bounds.height=Math.max(1,o.top-bounds.y-2);
      }
      return bounds;
    })()`);
    const actual = runtime.getBounds();
    lastBoundsDiagnostic = {
      requested: rect,
      actual,
      visible: runtime.isVisible(),
      contentSize: window.getContentSize(),
      zoom: window.webContents.getZoomFactor(),
    };
    if (rect.width <= 2 || rect.height <= 2) {
      const [width, height] = window.getContentSize();
      return (
        !runtime.isVisible() &&
        actual.x >= 0 &&
        actual.y >= 0 &&
        actual.x + actual.width <= (width ?? 0) &&
        actual.y + actual.height <= (height ?? 0)
      );
    }
    return Object.entries(rect).every(
      ([key, value]) => Math.abs(actual[key as keyof typeof actual] - value) <= 2,
    );
  };
  await wait(boundsMatch, "native bounds match research slot");
  await click(".ws-research", "Capture quote or source");
  await dom(
    "document.querySelector('.ws-source-review')?.textContent.includes('A captured research passage.')",
    "selected passage review",
  );
  await wait(() => !runtime.isVisible(), "native source hidden during review");
  await click(".ws-source-review", "Add quote to draft");
  await click(".ws-panes > .ws-document .ws-document-tools", "Write");
  // Verify exact data, source provenance, and the absence of any automatic disk write.
  const beforeSave = await evaluate<Record<string, boolean>>(`(async () => {
    const draft=document.querySelector('.ws-panes > .ws-document .ws-source').value;
    const desktopId=document.querySelector('.ws-studio').dataset.desktopId;
    const saved=await window.lattice.localWorkspace.readFile({desktopId,relativePath:'Workspace renamed note.md'});
    return { quote: draft.includes(${JSON.stringify(isolation.selection.trim())}), literalFence: draft.includes('\\n\`\`\`\`quote\\n'), provenance: draft.includes('[Source](https://example.com/)'), unchangedSavedFile: saved.content === ${JSON.stringify(baseline)} };
  })()`);
  if (!Object.values(beforeSave).every(Boolean))
    throw new Error(`Quote capture round trip failed: ${JSON.stringify(beforeSave)}`);
  await click(".ws-panes > .ws-document .ws-document-header", "Save");
  await dom(
    "document.querySelector('.ws-toolbar-slot .ws-document-status')?.textContent.includes('Saved locally')",
    "explicit source save",
  );
  await click(".ws-panes > .ws-document .ws-document-tools", "Preview");
  await dom(
    "document.querySelector('[data-markdown-preview] blockquote')?.textContent.includes('[[Private.md]]') && !document.querySelector('[data-markdown-preview] img')",
    "quote is inert in preview",
  );
  await wait(() => runtime.isVisible(), "source returns after review");
  await click(".ws-header-actions", "New");
  await wait(() => !runtime.isVisible(), "native source hidden behind creation menu");
  await click(".ws-header-actions", "New");
  await wait(() => runtime.isVisible(), "source returns after menu");
  await evaluate(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))",
  );
  await dom("Boolean(document.querySelector('.command-palette'))", "palette opens over research");
  await wait(() => !runtime.isVisible(), "native source hidden behind palette");
  await evaluate(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  await wait(() => runtime.isVisible(), "source returns after palette");
  const originalBounds = window.getBounds();
  // Chromium can suspend animation/resize delivery in a hidden BrowserWindow.
  // Exercise resizing as a real visible application, without taking keyboard focus.
  window.showInactive();
  try {
    await click(".ws-header-actions", "Focus");
    await dom(
      "Boolean(document.querySelector('.focus-mode .recovery-bar'))",
      "focus recovery control visible",
    );
    await wait(boundsMatch, "native source reserves floating recovery controls");
    const control = await evaluate<{ left: number; top: number; right: number; bottom: number }>(
      "document.querySelector('.recovery-bar').getBoundingClientRect().toJSON()",
    );
    const view = runtime.getBounds();
    if (
      runtime.isVisible() &&
      view.x < control.right &&
      view.x + view.width > control.left &&
      view.y < control.bottom &&
      view.y + view.height > control.top
    )
      throw new Error("Native source covered the trusted recovery control");
    await click(".ws-header-actions", "Focus");
    await wait(boundsMatch, "native bounds after leaving focus");
    window.setSize(1040, 760);
    try {
      await wait(boundsMatch, "native bounds after resize");
    } catch {
      throw new Error(`Native resize diagnostic: ${JSON.stringify(lastBoundsDiagnostic)}`);
    }
    await evaluate("document.querySelector('.ws-studio').scrollTo(0,150)");
    await wait(boundsMatch, "native clipped after scroll");
  } finally {
    window.setBounds(originalBounds);
    await evaluate("document.querySelector('.ws-studio').scrollTo(0,0)");
  }
  await wait(boundsMatch, "restored native bounds");
  const visionWorkbenchScreenshotPath = await screenshot("workspace-vision-workbench.png");
  await click(".ws-files-dashboard", "Files dashboard");
  await wait(() => !runtime.isVisible(), "native source hidden outside workbench");
  return {
    unifiedNavigation: true,
    homeLayout: true,
    plannerTemplate: true,
    boardEmbed: true,
    explicitSourceCapture: true,
    sourceIsolation: true,
    sourceOverlaySafety: true,
    sourceBounds: true,
    visionHomeScreenshotPath,
    visionWorkbenchScreenshotPath,
  };
}
