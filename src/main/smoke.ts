import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import type {
  BrowserBounds,
  CanvasPageRecord,
  CanvasPageSummary,
  SavedLinkRecord,
  SaveNoteResult,
  VaultInfo,
} from "../shared/contracts";
import { registerIpc } from "./ipc";
import { ProfileRuntime } from "./profiles/profile-runtime";
import { ProfileStore } from "./profiles/profile-store";
import { installLatticeProtocol } from "./protocol";
import { VaultService } from "./vault/vault-service";

export interface PhaseNineSmokeEvidence {
  packaged: boolean;
  versions: { electron: string; chromium: string; node: string };
  shell: {
    url: string;
    title: string;
    domReady: boolean;
    bridgeVisible: boolean;
    contentSecurityPolicy: string | null;
    windowContentSize: { width: number; height: number };
    rendererReportedBounds: BrowserBounds;
    nativeSlotBounds: BrowserBounds;
    vaultPanelBounds: BrowserBounds;
    screenshotPath: string;
    screenshotBytes: number;
  };
  remote: {
    url: string;
    title: string;
    viewBounds: BrowserBounds;
    configuredPreferences: Record<string, boolean>;
    webContentsType: string;
    nativeViewConstructor: string;
    sessionSeparatedFromShell: boolean;
    isolation: {
      nodeProcessVisible: boolean;
      requireVisible: boolean;
      latticeBridgeVisible: boolean;
      webviewTagApiVisible: boolean;
      popupReturnedNull: boolean;
      popupHandlerTriggered: boolean;
      permissionCheckHandlerTriggered: boolean;
      geolocationPermissionState: string;
    };
    screenshotPath: string;
    screenshotBytes: number;
    screenshotMethod: "capture-page" | "devtools-protocol";
  };
  webContentsDestroyedAfterClose: boolean;
  tabs: {
    initialCount: number;
    afterCreateCount: number;
    switchedBackToInitial: boolean;
    afterCloseCount: number;
    closedTabAbsent: boolean;
  };
  session: {
    beforeReloadCount: number;
    afterReloadCount: number;
    restoredWithoutDuplicates: boolean;
    activeDesktop: string;
    activeDesktopSummary: string;
    tabTitle: string;
    commandPaletteVisible: boolean;
    nativeViewHiddenWhilePaletteOpen: boolean;
  };
  profiles: {
    profileCount: number;
    activeProfileName: string;
    profileMenuVisible: boolean;
    privacyExplanationVisible: boolean;
    nativeViewHiddenWhileMenuOpen: boolean;
    firstCookieRetained: boolean;
    secondCookieInitiallyAbsent: boolean;
    secondCookieRetained: boolean;
    partitionsDistinct: boolean;
    registryContainsNoCredentials: boolean;
    screenshotPath: string;
    screenshotBytes: number;
  };
  navigation: {
    heading: string;
    resumeCardCount: number;
    destinations: string[];
    intention: string;
    focusMode: boolean;
    chromeHidden: boolean;
    nativeViewHidden: boolean;
    escapeRestoredNavigation: boolean;
    shortcutRouteSequence: string[];
    browserRestoredAfterShortcuts: boolean;
    screenshotPath: string;
    screenshotBytes: number;
  };
  desktopLifecycle: {
    guardedDeleteBlockedForOpenTab: boolean;
    menuVisible: boolean;
    nativeViewHiddenWhileMenuOpen: boolean;
    movedToDesktop: string;
    movedTabRetained: boolean;
    emptiedSourceDesktop: boolean;
    deletionConfirmationVisible: boolean;
    deletedEmptyDesktop: boolean;
    adjacentDesktopActivated: boolean;
    savedResearchDesktopPreserved: boolean;
  };
  metadataEditing: {
    formVisible: boolean;
    title: string;
    description: string;
    pathPreserved: boolean;
    bodyPreserved: boolean;
    urlPreserved: boolean;
    readingStatePreserved: boolean;
    temporaryFilesRemaining: number;
    screenshotPath: string;
    screenshotBytes: number;
  };
  obsidianHandoff: {
    openActionVisible: boolean;
    revealActionVisible: boolean;
    openInvocations: number;
    revealInvocations: number;
    obsidianUri: string;
    decodedPathMatches: boolean;
    revealedPathMatches: boolean;
    notePathNotRendered: boolean;
    screenshotPath: string;
    screenshotBytes: number;
  };
  readingQueue: {
    capturedAsQueued: boolean;
    markedRead: boolean;
    requeued: boolean;
    heading: string;
    summary: string;
    itemTitle: string;
    markReadVisible: boolean;
    nativeViewHidden: boolean;
  };
  canvas: {
    pageCount: number;
    title: string;
    folder: string;
    nodeCount: number;
    nodeKinds: string[];
    typedLinkKinds: string[];
    jsonCanvasShape: boolean;
    pageLinkNavigated: boolean;
    objectLinkFocused: boolean;
    websiteOpenedInIsolatedView: boolean;
    localRevealInvocations: number;
    revealedPathMatches: boolean;
    nativeViewHidden: boolean;
    pathNotRendered: boolean;
    unresolvedReferenceCount: number;
    repairDiagnosticsVisible: boolean;
    backlinkSourceVisible: boolean;
    privateReferencePathHidden: boolean;
    temporaryFilesRemaining: number;
    absolutePath: string;
    sha256: string;
    screenshotPath: string;
    screenshotBytes: number;
  };
  privacy: {
    before: { cookieCount: number; cacheBytes: number };
    after: { cookieCount: number; cacheBytes: number };
    cookieSeeded: boolean;
    localStorageSeeded: boolean;
    cacheStorageSeeded: boolean;
    cookieCleared: boolean;
    localStorageCleared: boolean;
    cacheStorageCleared: boolean;
    settingsHeading: string;
    settingsPrivacyText: string;
    restoreTabsEnabled: boolean;
    nativeViewHidden: boolean;
  };
  note: {
    vaultPath: string;
    disposableVault: boolean;
    obsidianDirectoryPresent: boolean;
    absolutePath: string;
    relativePath: string;
    bytesWritten: number;
    bytesReadBack: number;
    sha256: string;
    temporaryFilesRemaining: number;
    libraryCount: number;
    libraryRoundTrip: boolean;
    disconnectedWithoutDeleting: boolean;
  };
  evidencePath: string;
}

interface ShellProbeResult {
  domReady: boolean;
  bridgeVisible: boolean;
  nativeSlotBounds: BrowserBounds;
  vaultPanelBounds: BrowserBounds;
  vault: VaultInfo;
  note: SaveNoteResult;
  links: SavedLinkRecord[];
  reading: {
    markedRead: SavedLinkRecord;
    requeued: SavedLinkRecord;
  };
  canvas: {
    parent: CanvasPageRecord;
    child: CanvasPageRecord;
    pages: CanvasPageSummary[];
  };
  tabs: PhaseNineSmokeEvidence["tabs"];
}

interface SessionDomResult {
  status: string;
  activeDesktop: string;
  activeDesktopSummary: string;
  tabTitle: string;
}

interface QueueDomResult {
  heading: string;
  summary: string;
  itemTitle: string;
  markReadVisible: boolean;
}

interface MetadataDomResult {
  title: string;
  description: string;
}

interface SettingsDomResult {
  heading: string;
  privacyText: string;
  restoreTabsEnabled: boolean;
}

interface CanvasDomResult {
  title: string;
  objectCount: number;
  iframeActionVisible: boolean;
  typedLinkKinds: string[];
  pathNotRendered: boolean;
}

interface DesktopLifecycleDomResult {
  activeDesktop: string;
  activeDesktopSummary: string;
  activeTabTitle: string;
  buildPresent: boolean;
  researchSummary: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRendererBounds(runtime: ProfileRuntime): Promise<BrowserBounds> {
  const deadline = Date.now() + 5_000;
  let previousBounds: BrowserBounds | null = null;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const bounds = runtime.getBounds();
    if (bounds.width >= 100 && bounds.height >= 100 && bounds.x >= 0 && bounds.y >= 0) {
      if (previousBounds && JSON.stringify(bounds) === JSON.stringify(previousBounds)) {
        stableSamples += 1;
      } else {
        previousBounds = bounds;
        stableSamples = 1;
      }
      if (stableSamples >= 4) return bounds;
    }
    await delay(25);
  }
  throw new Error("The packaged React renderer did not report stable native-view bounds.");
}

export async function runPhaseNineSmoke(
  rendererRoot: string,
  preloadPath: string,
): Promise<PhaseNineSmokeEvidence> {
  const smokeRoot = path.join(os.tmpdir(), "lattice-phase-nine");
  await mkdir(smokeRoot, { recursive: true });

  const window = new BrowserWindow({
    show: false,
    width: 1_000,
    height: 720,
    webPreferences: {
      partition: `lattice-shell-smoke-${randomUUID()}`,
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
    },
  });
  installLatticeProtocol(window.webContents.session, rendererRoot);

  const profileRoot = path.join(smokeRoot, `profiles-${randomUUID()}`);
  const profileStore = new ProfileStore(
    path.join(profileRoot, "profiles.json"),
    path.join(profileRoot, "avatars"),
  );
  await profileStore.initialize();
  const runtime = new ProfileRuntime(window, profileStore);
  const openedExternalUris: string[] = [];
  const revealedFilePaths: string[] = [];
  const unregisterIpc = registerIpc(window, runtime, new VaultService(), runtime, {
    openExternal: async (uri) => {
      openedExternalUris.push(uri);
    },
    showItemInFolder: (absolutePath) => {
      revealedFilePaths.push(absolutePath);
    },
  });
  let ipcRegistered = true;
  const cleanup = () => {
    runtime.close();
    if (ipcRegistered) {
      unregisterIpc();
      ipcRegistered = false;
    }
    if (!window.isDestroyed()) {
      window.destroy();
    }
  };

  try {
    await window.loadURL("lattice://app/index.html");
    const shellUrl = window.webContents.getURL();
    const shellTitle = window.webContents.getTitle();
    let rendererReportedBounds = await waitForRendererBounds(runtime);
    const shellResponse = await window.webContents.session.fetch("lattice://app/index.html");
    const contentSecurityPolicy = shellResponse.headers.get("content-security-policy");

    const shellProbe = (await window.webContents.executeJavaScript(`(async () => {
      const readBounds = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error("Missing smoke element: " + selector);
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      };
      const initialSnapshot = await window.lattice.browser.snapshot();
      const createdSnapshot = await window.lattice.browser.createTab();
      const createdTabId = createdSnapshot.activeTabId;
      const switchedSnapshot = await window.lattice.browser.switchTab(initialSnapshot.activeTabId);
      const closedSnapshot = await window.lattice.browser.closeTab(createdTabId);
      const vault = await window.lattice.vault.createDisposable();
      const note = await window.lattice.vault.saveProbeNote({
        title: "Phase 8 packaged smoke",
        url: "https://example.com/phase-eight",
        description: "Atomic Markdown written into a desktop folder and read back through the packaged library.",
        folder: "Research",
        desktopId: "research",
        readingStatus: "queued"
      });
      const markedRead = await window.lattice.vault.setReadingStatus({ id: note.id, status: "read" });
      const requeued = await window.lattice.vault.setReadingStatus({ id: note.id, status: "queued" });
      const links = await window.lattice.vault.listSavedLinks();
      const child = await window.lattice.vault.createCanvasPage({
        title: "Phase 9 child page",
        description: "A page linked from another page.",
        folder: "Projects/Browser/Lists"
      });
      const noteNodeId = crypto.randomUUID();
      const websiteNodeId = crypto.randomUUID();
      const linksNodeId = crypto.randomUUID();
      const parentDraft = await window.lattice.vault.createCanvasPage({
        title: "Phase 9 research canvas",
        description: "A connected collection of pages, objects, websites, and files.",
        folder: "Projects/Browser"
      });
      const parent = await window.lattice.vault.saveCanvasPage({
        id: parentDraft.id,
        title: parentDraft.title,
        description: parentDraft.description,
        nodes: [
          {
            id: noteNodeId,
            type: "text",
            x: 40,
            y: 40,
            width: 350,
            height: 240,
            text: "A Markdown description stored as a standard JSON Canvas text node.",
            latticeKind: "note",
            latticeTitle: "Description"
          },
          {
            id: websiteNodeId,
            type: "link",
            x: 430,
            y: 40,
            width: 350,
            height: 240,
            url: "https://example.com/",
            latticeKind: "iframe",
            latticeTitle: "Reference website",
            latticeDescription: "Opens through the isolated native website view."
          },
          {
            id: linksNodeId,
            type: "text",
            x: 820,
            y: 40,
            width: 430,
            height: 330,
            text: "A typed list of related things.",
            latticeKind: "links",
            latticeTitle: "Connected things",
            latticeLinks: [
              { id: crypto.randomUUID(), label: "Child page", kind: "page", target: child.id },
              { id: crypto.randomUUID(), label: "Key description", kind: "object", target: noteNodeId },
              { id: crypto.randomUUID(), label: "Primary source", kind: "url", target: "https://example.com/source" },
              { id: crypto.randomUUID(), label: "Local brief", kind: "document", target: "Files/brief.md" },
              { id: crypto.randomUUID(), label: "Missing image", kind: "image", target: "Files/missing.png" },
              { id: crypto.randomUUID(), label: "Local data", kind: "file", target: "Files/data.bin" }
            ]
          }
        ],
        edges: []
      });
      const pages = await window.lattice.vault.listCanvasPages();
      return {
        domReady: Boolean(document.querySelector(".lattice-shell")),
        bridgeVisible: typeof window.lattice !== "undefined",
        nativeSlotBounds: readBounds(".native-view-slot"),
        vaultPanelBounds: readBounds(".vault-probe"),
        vault,
        note,
        links,
        reading: { markedRead, requeued },
        canvas: { parent, child, pages },
        tabs: {
          initialCount: initialSnapshot.tabs.length,
          afterCreateCount: createdSnapshot.tabs.length,
          switchedBackToInitial: switchedSnapshot.activeTabId === initialSnapshot.activeTabId,
          afterCloseCount: closedSnapshot.tabs.length,
          closedTabAbsent: !closedSnapshot.tabs.some((tab) => tab.id === createdTabId)
        }
      };
    })()`)) as ShellProbeResult;
    // Hidden BrowserWindow content bounds can settle once after the first renderer
    // probe. Re-sample the IPC-published native slot after that work so the evidence
    // compares two values from the same stable layout generation.
    await delay(100);
    rendererReportedBounds = await waitForRendererBounds(runtime);
    const [windowContentWidth = 1, windowContentHeight = 1] = window.getContentSize();

    const initialNoteBytes = await readFile(shellProbe.note.absolutePath);
    const obsidianStats = await stat(path.join(shellProbe.vault.displayPath, ".obsidian"));
    const referencedFilesDirectory = path.join(shellProbe.vault.displayPath, "Files");
    await mkdir(referencedFilesDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(referencedFilesDirectory, "brief.md"), "# Phase 9 local brief\n", "utf8"),
      writeFile(
        path.join(referencedFilesDirectory, "image.png"),
        Buffer.from("89504e470d0a1a0a", "hex"),
      ),
      writeFile(path.join(referencedFilesDirectory, "data.bin"), Buffer.from([0, 1, 2, 3])),
    ]);
    const parentCanvasDirectory = path.join(
      shellProbe.vault.displayPath,
      "Lattice Pages",
      "Projects",
      "Browser",
    );
    const parentCanvasFilename = (await readdir(parentCanvasDirectory)).find((entry) =>
      entry.endsWith(`${shellProbe.canvas.parent.id.slice(0, 8)}.canvas`),
    );
    if (!parentCanvasFilename) throw new Error("The Phase 9 canvas file could not be found.");
    const parentCanvasPath = path.join(parentCanvasDirectory, parentCanvasFilename);
    const parentCanvasBytes = await readFile(parentCanvasPath);
    const parentCanvasDocument = JSON.parse(parentCanvasBytes.toString("utf8"));

    // Seed a realistic two-tab session, reload only the trusted renderer, and prove
    // it reconnects to the existing native views instead of creating duplicates.
    await runtime.createTab();
    await runtime.navigate("https://example.com/");
    const beforeReload = runtime.snapshot();
    const sessionTabs = beforeReload.tabs.map((tab) => ({
      url: tab.url,
      desktopId: tab.id === beforeReload.activeTabId ? "build" : "research",
      active: tab.id === beforeReload.activeTabId,
    }));
    await window.webContents.executeJavaScript(
      `(async () => {
        const profiles = await window.lattice.profiles.state();
        localStorage.setItem(
          "lattice.session.v1.profile." + profiles.activeProfileId,
          ${JSON.stringify(JSON.stringify({ version: 1, tabs: sessionTabs }))}
        );
      })()`,
    );
    const reloaded = new Promise<void>((resolve) =>
      window.webContents.once("did-finish-load", () => resolve()),
    );
    window.webContents.reload();
    await reloaded;

    const restoreDeadline = Date.now() + 5_000;
    let sessionDom: SessionDomResult | null = null;
    while (Date.now() < restoreDeadline) {
      sessionDom = (await window.webContents.executeJavaScript(`(() => {
        const status = document.querySelector(".status-bar span")?.textContent?.trim() ?? "";
        const activeDesktop = document.querySelector(".desktop-item.active strong")?.textContent?.trim() ?? "";
        const activeDesktopSummary = document.querySelector(".desktop-item.active small")?.textContent?.trim() ?? "";
        const tabTitle = document.querySelector(".browser-tab.active .tab-title")?.textContent?.trim() ?? "";
        return { status, activeDesktop, activeDesktopSummary, tabTitle };
      })()`)) as SessionDomResult;
      if (sessionDom?.status.includes("Restored 2 tabs") && sessionDom.tabTitle) break;
      await delay(25);
    }
    if (!sessionDom) throw new Error("The Phase 8 session UI did not become ready.");
    const afterReload = runtime.snapshot();
    const privacyProbe = await runtime.collectPrivacyClearProbe();

    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))`,
    );
    const commandDeadline = Date.now() + 2_000;
    let commandPaletteVisible = false;
    while (Date.now() < commandDeadline) {
      commandPaletteVisible = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector(".command-palette"))`,
      )) as boolean;
      if (commandPaletteVisible && !runtime.isVisible()) break;
      await delay(25);
    }
    const nativeViewHiddenWhilePaletteOpen = commandPaletteVisible && !runtime.isVisible();

    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
    );

    // Phase 10 adds a calm return point and a reversible distraction-free view.
    // Exercise it through the same trusted renderer used by the packaged app, then
    // restore Browse before continuing the long-running Phase 9 regression.
    const navigationDom = (await window.webContents.executeJavaScript(`(async () => {
      const focus = document.querySelector('button[aria-label="Focus"]');
      if (!(focus instanceof HTMLButtonElement)) throw new Error("Focus destination missing");
      focus.click();
      await new Promise((resolve) => setTimeout(resolve, 75));
      const intention = document.querySelector('.focus-intention input');
      if (!(intention instanceof HTMLInputElement)) throw new Error("Focus intention missing");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(intention, "Finish one meaningful thread");
      intention.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const focusView = document.querySelector('.surface-toolbar .focus-toolbar-button');
      if (!(focusView instanceof HTMLButtonElement)) throw new Error("Focus view action missing");
      focusView.click();
      await new Promise((resolve) => setTimeout(resolve, 75));
      return {
        heading: document.querySelector('.home-hero h1')?.textContent?.trim() ?? "",
        resumeCardCount: document.querySelectorAll('.resume-card').length,
        destinations: [...document.querySelectorAll('.home-destination-strip button')]
          .map((button) => button.textContent?.replace(/\\s+/g, " ").trim() ?? ""),
        intention: document.querySelector('.focus-session-copy strong')?.textContent?.trim() ?? "",
        focusMode: document.querySelector('.lattice-shell')?.classList.contains('focus-mode') ?? false,
        chromeHidden: getComputedStyle(document.querySelector('.activity-rail')).display === 'none' &&
          getComputedStyle(document.querySelector('.workspace-panel')).display === 'none' &&
          getComputedStyle(document.querySelector('.tab-strip')).display === 'none'
      };
    })()`)) as {
      heading: string;
      resumeCardCount: number;
      destinations: string[];
      intention: string;
      focusMode: boolean;
      chromeHidden: boolean;
    };
    const nativeViewHiddenForFocus = !runtime.isVisible();
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const focusNavigationImage = await window.webContents.capturePage();
    if (focusNavigationImage.isEmpty()) {
      throw new Error("Electron returned an empty focus-navigation capture.");
    }
    const focusNavigationScreenshot = focusNavigationImage.toPNG();
    const focusNavigationScreenshotPath = path.join(smokeRoot, "phase-10-focus-navigation.png");
    await writeFile(focusNavigationScreenshotPath, focusNavigationScreenshot);
    window.hide();

    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
    );
    await delay(75);
    const escapeRestoredNavigation = (await window.webContents.executeJavaScript(
      `!document.querySelector('.lattice-shell')?.classList.contains('focus-mode') &&
        getComputedStyle(document.querySelector('.activity-rail')).display !== 'none'`,
    )) as boolean;
    const shortcutRouteSequence = (await window.webContents.executeJavaScript(`(async () => {
      const routes = [];
      for (const key of ["3", "4", "5", "6", "1", "2"]) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key, altKey: true, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 75));
        routes.push(document.querySelector('.surface-location strong')?.textContent?.trim() ??
          (document.querySelector('.browser-toolbar') ? "Browse" : ""));
      }
      return routes;
    })()`)) as string[];
    const browserRestoreDeadline = Date.now() + 2_000;
    while (Date.now() < browserRestoreDeadline && !runtime.isVisible()) await delay(25);
    const browserRestoredAfterShortcuts = runtime.isVisible();

    // An occupied desktop cannot be deleted. Move its live native tab to the next
    // desktop, then prove the now-empty desktop needs confirmation and can be
    // removed without disturbing the Research desktop's saved Markdown.
    await window.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('button[aria-label="Workspace menu"]');
      if (!(menu instanceof HTMLButtonElement)) throw new Error("Workspace menu missing");
      menu.click();
    })()`);
    const occupiedDeleteDeadline = Date.now() + 2_000;
    let occupiedDeleteVisible = false;
    while (Date.now() < occupiedDeleteDeadline) {
      occupiedDeleteVisible = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-delete-desktop="build"]'))`,
      )) as boolean;
      if (occupiedDeleteVisible) break;
      await delay(25);
    }
    if (!occupiedDeleteVisible) throw new Error("Desktop delete action missing");
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-delete-desktop="build"]').click()`,
    );
    let guardedDeleteBlockedForOpenTab = false;
    const guardDeadline = Date.now() + 2_000;
    while (Date.now() < guardDeadline) {
      guardedDeleteBlockedForOpenTab = (await window.webContents.executeJavaScript(`(() => {
        const status = document.querySelector(".status-bar span")?.textContent ?? "";
        const buildPresent = [...document.querySelectorAll(".desktop-item strong")]
          .some((item) => item.textContent?.trim() === "Build");
        return buildPresent && status.includes("Move or close this desktop's tabs first");
      })()`)) as boolean;
      if (guardedDeleteBlockedForOpenTab) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('button[aria-label="Workspace menu"]');
      if (!(menu instanceof HTMLButtonElement)) throw new Error("Workspace menu missing");
      menu.click();
      const actions = document.querySelector('button[aria-label="More browser actions"]');
      if (!(actions instanceof HTMLButtonElement)) throw new Error("Browser actions missing");
      actions.click();
    })()`);
    const browserMenuDeadline = Date.now() + 2_000;
    let browserMenuVisible = false;
    while (Date.now() < browserMenuDeadline) {
      browserMenuVisible = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector(".browser-actions-menu"))`,
      )) as boolean;
      if (browserMenuVisible && !runtime.isVisible()) break;
      await delay(25);
    }
    const nativeViewHiddenWhileMenuOpen = browserMenuVisible && !runtime.isVisible();
    const movedTabId = runtime.snapshot().activeTabId;
    await window.webContents.executeJavaScript(`(() => {
      const target = document.querySelector('[data-move-tab-to="inspiration"]');
      if (!(target instanceof HTMLButtonElement)) throw new Error("Inspiration move target missing");
      target.click();
    })()`);
    const movedDeadline = Date.now() + 2_000;
    let movedDom: DesktopLifecycleDomResult | null = null;
    while (Date.now() < movedDeadline) {
      movedDom = (await window.webContents.executeJavaScript(`(() => ({
        activeDesktop: document.querySelector(".desktop-item.active strong")?.textContent?.trim() ?? "",
        activeDesktopSummary: document.querySelector(".desktop-item.active small")?.textContent?.trim() ?? "",
        activeTabTitle: document.querySelector(".browser-tab.active .tab-title")?.textContent?.trim() ?? "",
        buildPresent: [...document.querySelectorAll(".desktop-item strong")]
          .some((item) => item.textContent?.trim() === "Build"),
        researchSummary: [...document.querySelectorAll(".desktop-item")]
          .find((item) => item.querySelector("strong")?.textContent?.trim() === "Research")
          ?.querySelector("small")?.textContent?.trim() ?? ""
      }))()`)) as DesktopLifecycleDomResult;
      if (movedDom.activeDesktop === "Inspiration" && movedDom.activeTabTitle) break;
      await delay(25);
    }
    if (!movedDom) throw new Error("The Phase 8 tab move UI did not become ready.");
    const movedTabRetained = runtime.snapshot().activeTabId === movedTabId;

    await window.webContents.executeJavaScript(`(() => {
      const build = [...document.querySelectorAll(".desktop-item")]
        .find((item) => item.querySelector("strong")?.textContent?.trim() === "Build");
      if (!(build instanceof HTMLButtonElement)) throw new Error("Build desktop missing");
      build.click();
    })()`);
    const emptyDeadline = Date.now() + 2_000;
    let emptiedSourceDesktop = false;
    while (Date.now() < emptyDeadline) {
      emptiedSourceDesktop = (await window.webContents.executeJavaScript(`(() => {
        const active = document.querySelector(".desktop-item.active");
        return active?.querySelector("strong")?.textContent?.trim() === "Build" &&
          active?.querySelector("small")?.textContent?.trim().startsWith("0 tabs");
      })()`)) as boolean;
      if (emptiedSourceDesktop) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('button[aria-label="Workspace menu"]');
      if (!(menu instanceof HTMLButtonElement)) throw new Error("Workspace menu missing");
      menu.click();
    })()`);
    const emptyDeleteDeadline = Date.now() + 2_000;
    let emptyDeleteVisible = false;
    while (Date.now() < emptyDeleteDeadline) {
      emptyDeleteVisible = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-delete-desktop="build"]'))`,
      )) as boolean;
      if (emptyDeleteVisible) break;
      await delay(25);
    }
    if (!emptyDeleteVisible) throw new Error("Desktop delete action missing");
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-delete-desktop="build"]').click()`,
    );
    const confirmationDeadline = Date.now() + 2_000;
    let deletionConfirmationVisible = false;
    while (Date.now() < confirmationDeadline) {
      deletionConfirmationVisible = (await window.webContents.executeJavaScript(`(() => {
        const remove = document.querySelector('[data-delete-desktop="build"]');
        return remove?.textContent?.includes("Confirm delete empty desktop") ?? false;
      })()`)) as boolean;
      if (deletionConfirmationVisible) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const remove = document.querySelector('[data-delete-desktop="build"]');
      if (!(remove instanceof HTMLButtonElement)) throw new Error("Desktop confirmation missing");
      remove.click();
    })()`);
    const deleteDeadline = Date.now() + 2_000;
    let deletedDom: DesktopLifecycleDomResult | null = null;
    while (Date.now() < deleteDeadline) {
      deletedDom = (await window.webContents.executeJavaScript(`(() => ({
        activeDesktop: document.querySelector(".desktop-item.active strong")?.textContent?.trim() ?? "",
        activeDesktopSummary: document.querySelector(".desktop-item.active small")?.textContent?.trim() ?? "",
        activeTabTitle: document.querySelector(".browser-tab.active .tab-title")?.textContent?.trim() ?? "",
        buildPresent: [...document.querySelectorAll(".desktop-item strong")]
          .some((item) => item.textContent?.trim() === "Build"),
        researchSummary: [...document.querySelectorAll(".desktop-item")]
          .find((item) => item.querySelector("strong")?.textContent?.trim() === "Research")
          ?.querySelector("small")?.textContent?.trim() ?? ""
      }))()`)) as DesktopLifecycleDomResult;
      if (!deletedDom.buildPresent && deletedDom.activeDesktop === "Inspiration") break;
      await delay(25);
    }
    if (!deletedDom) throw new Error("The Phase 8 desktop delete UI did not become ready.");

    await window.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll("button.library-row")]
        .find((candidate) => candidate.textContent?.includes("Reading queue"));
      if (!(button instanceof HTMLButtonElement)) throw new Error("Reading queue button missing");
      button.click();
    })()`);
    const queueDeadline = Date.now() + 2_000;
    let queueDom: QueueDomResult | null = null;
    while (Date.now() < queueDeadline) {
      queueDom = (await window.webContents.executeJavaScript(`(() => ({
        heading: document.querySelector(".library-header h1")?.textContent?.trim() ?? "",
        summary: document.querySelector(".library-header p")?.textContent?.trim() ?? "",
        itemTitle: document.querySelector(".link-card h2")?.textContent?.trim() ?? "",
        markReadVisible: [...document.querySelectorAll(".link-card-actions button")]
          .some((button) => button.textContent?.includes("Mark read"))
      }))()`)) as QueueDomResult;
      if (queueDom.heading === "Reading queue" && queueDom.itemTitle) break;
      await delay(25);
    }
    if (!queueDom) throw new Error("The Phase 8 reading queue UI did not become ready.");
    const nativeViewHiddenForQueue = !runtime.isVisible();

    await window.webContents.executeJavaScript(`(() => {
      const edit = [...document.querySelectorAll(".link-card-actions button")]
        .find((button) => button.textContent?.includes("Edit"));
      if (!(edit instanceof HTMLButtonElement)) throw new Error("Saved-link edit action missing");
      edit.click();
    })()`);
    const editFormDeadline = Date.now() + 2_000;
    let editFormVisible = false;
    while (Date.now() < editFormDeadline) {
      editFormVisible = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector(".link-edit-form"))`,
      )) as boolean;
      if (editFormVisible) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('input[aria-label="Saved link title"]');
      const description = document.querySelector('textarea[aria-label="Saved link description"]');
      const form = document.querySelector(".link-edit-form");
      if (!(title instanceof HTMLInputElement) ||
          !(description instanceof HTMLTextAreaElement) ||
          !(form instanceof HTMLFormElement)) {
        throw new Error("Saved-link edit form missing");
      }
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      inputSetter?.call(title, "Phase 8 edited research note");
      title.dispatchEvent(new Event("input", { bubbles: true }));
      textareaSetter?.call(description, "Refined after capture without replacing the Obsidian note body.");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const metadataEditorImage = await window.webContents.capturePage();
    if (metadataEditorImage.isEmpty()) {
      throw new Error("Electron returned an empty metadata-editor capture.");
    }
    const metadataEditorScreenshot = metadataEditorImage.toPNG();
    const metadataEditorScreenshotPath = path.join(smokeRoot, "phase-9-metadata-editor.png");
    await writeFile(metadataEditorScreenshotPath, metadataEditorScreenshot);
    window.hide();
    await window.webContents.executeJavaScript(`(() => {
      const form = document.querySelector(".link-edit-form");
      if (!(form instanceof HTMLFormElement)) throw new Error("Saved-link edit form missing");
      form.requestSubmit();
    })()`);
    const metadataDeadline = Date.now() + 2_000;
    let metadataDom: MetadataDomResult | null = null;
    while (Date.now() < metadataDeadline) {
      metadataDom = (await window.webContents.executeJavaScript(`(() => ({
        title: document.querySelector(".link-card h2")?.textContent?.trim() ?? "",
        description: document.querySelector(".link-card p")?.textContent?.trim() ?? ""
      }))()`)) as MetadataDomResult;
      if (
        metadataDom.title === "Phase 8 edited research note" &&
        metadataDom.description.startsWith("Refined after capture")
      ) {
        break;
      }
      await delay(25);
    }
    if (
      metadataDom?.title !== "Phase 8 edited research note" ||
      !metadataDom.description.startsWith("Refined after capture")
    ) {
      throw new Error("The Phase 8 metadata edit UI did not become ready.");
    }
    const editedLinks = (await window.webContents.executeJavaScript(
      `window.lattice.vault.listSavedLinks()`,
    )) as SavedLinkRecord[];
    const editedLink = editedLinks.find((link) => link.id === shellProbe.note.id);
    const finalNoteBytes = await readFile(shellProbe.note.absolutePath);
    const noteDirectoryEntries = await readdir(path.dirname(shellProbe.note.absolutePath));
    const initialMarkdown = initialNoteBytes.toString("utf8");
    const finalMarkdown = finalNoteBytes.toString("utf8");
    const initialBody = initialMarkdown.slice(initialMarkdown.indexOf("\n---\n", 4) + 5);
    const finalBody = finalMarkdown.slice(finalMarkdown.indexOf("\n---\n", 4) + 5);

    const handoffUi = (await window.webContents.executeJavaScript(`(() => ({
      openActionVisible: Boolean(document.querySelector('button[aria-label="Open saved link in Obsidian"]')),
      revealActionVisible: Boolean(document.querySelector('button[aria-label="Show saved note in folder"]')),
      notePathNotRendered: !document.body.innerText.includes(${JSON.stringify(shellProbe.note.relativePath)}) &&
        !document.body.innerText.includes(${JSON.stringify(shellProbe.note.absolutePath)})
    }))()`)) as {
      openActionVisible: boolean;
      revealActionVisible: boolean;
      notePathNotRendered: boolean;
    };
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const handoffImage = await window.webContents.capturePage();
    if (handoffImage.isEmpty()) throw new Error("Electron returned an empty handoff capture.");
    const handoffScreenshot = handoffImage.toPNG();
    const handoffScreenshotPath = path.join(smokeRoot, "phase-9-obsidian-handoff.png");
    await writeFile(handoffScreenshotPath, handoffScreenshot);
    window.hide();

    await window.webContents.executeJavaScript(`(() => {
      const open = document.querySelector('button[aria-label="Open saved link in Obsidian"]');
      if (!(open instanceof HTMLButtonElement)) throw new Error("Obsidian handoff action missing");
      open.click();
    })()`);
    const openHandoffDeadline = Date.now() + 2_000;
    while (Date.now() < openHandoffDeadline && openedExternalUris.length === 0) await delay(25);
    await window.webContents.executeJavaScript(`(() => {
      const reveal = document.querySelector('button[aria-label="Show saved note in folder"]');
      if (!(reveal instanceof HTMLButtonElement)) throw new Error("Reveal handoff action missing");
      reveal.click();
    })()`);
    const revealHandoffDeadline = Date.now() + 2_000;
    while (Date.now() < revealHandoffDeadline && revealedFilePaths.length === 0) await delay(25);
    const canonicalNotePath = await realpath(shellProbe.note.absolutePath);
    const handoffRevealInvocations = revealedFilePaths.length;
    const decodedObsidianPath = openedExternalUris[0]
      ? new URL(openedExternalUris[0]).searchParams.get("path")
      : null;

    await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('button[aria-label="Settings"]');
      if (!(button instanceof HTMLButtonElement)) throw new Error("Settings button missing");
      button.click();
    })()`);
    const settingsDeadline = Date.now() + 2_000;
    let settingsDom: SettingsDomResult | null = null;
    while (Date.now() < settingsDeadline) {
      settingsDom = (await window.webContents.executeJavaScript(`(() => ({
        heading: document.querySelector(".settings-header h1")?.textContent?.trim() ?? "",
        privacyText: document.querySelector("[data-settings-privacy] p")?.textContent?.trim() ?? "",
        restoreTabsEnabled: document.querySelector('[role="switch"][aria-label="Restore tabs on launch"]')?.getAttribute("aria-checked") === "true"
      }))()`)) as SettingsDomResult;
      if (settingsDom.heading === "Settings" && settingsDom.privacyText) break;
      await delay(25);
    }
    if (!settingsDom) throw new Error("The Phase 8 settings UI did not become ready.");
    const nativeViewHiddenForSettings = !runtime.isVisible();

    // Chromium only exposes composed surfaces while the owning window is shown. Keep
    // the smoke window out of the taskbar and avoid taking focus.
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);

    const shellImage = await window.webContents.capturePage();
    if (shellImage.isEmpty()) throw new Error("Electron returned an empty shell capture.");
    const shellScreenshot = shellImage.toPNG();
    const shellScreenshotPath = path.join(smokeRoot, "phase-9-shell.png");
    await writeFile(shellScreenshotPath, shellScreenshot);

    await window.webContents.executeJavaScript(`(() => {
      const pages = [...document.querySelectorAll("button.library-row")]
        .find((button) => button.textContent?.includes("Canvas pages"));
      if (!(pages instanceof HTMLButtonElement)) throw new Error("Canvas pages action missing");
      pages.click();
    })()`);
    const canvasIndexDeadline = Date.now() + 2_000;
    while (Date.now() < canvasIndexDeadline) {
      const ready = (await window.webContents.executeJavaScript(
        `document.querySelector(".canvas-index-header h1")?.textContent === "Pages"`,
      )) as boolean;
      if (ready) break;
      await delay(25);
    }
    const referenceUi = (await window.webContents.executeJavaScript(`(() => ({
      unresolvedReferenceCount: document.querySelectorAll(".reference-diagnostics article").length,
      repairDiagnosticsVisible: document.querySelector(".reference-overview")?.textContent?.includes("Lattice will not change the source file automatically") ?? false,
      backlinkSourceVisible: [...document.querySelectorAll(".canvas-page-card")].some((card) => card.textContent?.includes("from Phase 9 research canvas")),
      privatePathHidden: !document.body.innerText.includes("Files/missing.png") && !document.body.innerText.includes(${JSON.stringify(shellProbe.vault.displayPath)})
    }))()`)) as {
      unresolvedReferenceCount: number;
      repairDiagnosticsVisible: boolean;
      backlinkSourceVisible: boolean;
      privatePathHidden: boolean;
    };
    await window.webContents.executeJavaScript(`(() => {
      const page = [...document.querySelectorAll("button.canvas-page-card")]
        .find((button) => button.querySelector("strong")?.textContent?.trim() === "Phase 9 research canvas");
      if (!(page instanceof HTMLButtonElement)) throw new Error("Phase 9 canvas card missing");
      page.click();
    })()`);
    const canvasEditorDeadline = Date.now() + 2_000;
    let canvasUi: CanvasDomResult | null = null;
    while (Date.now() < canvasEditorDeadline) {
      canvasUi = (await window.webContents.executeJavaScript(`(() => ({
        title: document.querySelector('input[aria-label="Edit canvas page title"]')?.value ?? "",
        objectCount: document.querySelectorAll(".canvas-object").length,
        iframeActionVisible: Boolean(document.querySelector(".canvas-open-live")),
        typedLinkKinds: [...document.querySelectorAll('select[aria-label="Canvas link type"]')]
          .map((select) => select.value),
        pathNotRendered: !document.body.innerText.includes(${JSON.stringify(parentCanvasPath)}) &&
          !document.body.innerText.includes("Lattice Pages/Projects/Browser")
      }))()`)) as CanvasDomResult;
      if (canvasUi.title === "Phase 9 research canvas" && canvasUi.objectCount === 3) break;
      await delay(25);
    }
    if (canvasUi?.title !== "Phase 9 research canvas") {
      throw new Error("The Phase 9 canvas editor did not become ready.");
    }
    const nativeViewHiddenForCanvas = !runtime.isVisible();
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const canvasImage = await window.webContents.capturePage();
    if (canvasImage.isEmpty()) throw new Error("Electron returned an empty canvas capture.");
    const canvasScreenshot = canvasImage.toPNG();
    const canvasScreenshotPath = path.join(smokeRoot, "phase-9-canvas.png");
    await writeFile(canvasScreenshotPath, canvasScreenshot);
    window.hide();

    await window.webContents.executeJavaScript(`(() => {
      const objectLink = document.querySelector('button[aria-label="Open Key description"]');
      if (!(objectLink instanceof HTMLButtonElement)) throw new Error("Object link action missing");
      objectLink.click();
    })()`);
    await delay(50);
    const objectLinkFocused = (await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(".canvas-object.note.selected"))`,
    )) as boolean;
    await window.webContents.executeJavaScript(`(() => {
      const fileLink = document.querySelector('button[aria-label="Open Local brief"]');
      if (!(fileLink instanceof HTMLButtonElement)) throw new Error("File link action missing");
      fileLink.click();
    })()`);
    const canvasRevealDeadline = Date.now() + 2_000;
    while (Date.now() < canvasRevealDeadline && revealedFilePaths.length < 2) await delay(25);
    const canonicalBriefPath = await realpath(path.join(referencedFilesDirectory, "brief.md"));
    await window.webContents.executeJavaScript(`(() => {
      const pageLink = document.querySelector('button[aria-label="Open Child page"]');
      if (!(pageLink instanceof HTMLButtonElement)) throw new Error("Page link action missing");
      pageLink.click();
    })()`);
    const pageLinkDeadline = Date.now() + 2_000;
    let pageLinkNavigated = false;
    while (Date.now() < pageLinkDeadline) {
      pageLinkNavigated = (await window.webContents.executeJavaScript(
        `document.querySelector('input[aria-label="Edit canvas page title"]')?.value === "Phase 9 child page"`,
      )) as boolean;
      if (pageLinkNavigated) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const back = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Pages");
      if (!(back instanceof HTMLButtonElement)) throw new Error("Canvas back action missing");
      back.click();
    })()`);
    await delay(50);
    await window.webContents.executeJavaScript(`(() => {
      const page = [...document.querySelectorAll("button.canvas-page-card")]
        .find((button) => button.querySelector("strong")?.textContent?.trim() === "Phase 9 research canvas");
      if (!(page instanceof HTMLButtonElement)) throw new Error("Phase 9 canvas card missing");
      page.click();
    })()`);
    await delay(50);
    const tabsBeforeWebsiteOpen = runtime.snapshot().tabs.length;
    await window.webContents.executeJavaScript(`(() => {
      const website = document.querySelector(".canvas-open-live");
      if (!(website instanceof HTMLButtonElement)) throw new Error("Website object action missing");
      website.click();
    })()`);
    const websiteDeadline = Date.now() + 2_000;
    let websiteOpenedInIsolatedView = false;
    while (Date.now() < websiteDeadline) {
      const websiteSnapshot = runtime.snapshot();
      websiteOpenedInIsolatedView =
        websiteSnapshot.tabs.length === tabsBeforeWebsiteOpen + 1 &&
        websiteSnapshot.tabs.find((tab) => tab.id === websiteSnapshot.activeTabId)?.url ===
          "https://example.com/";
      if (websiteOpenedInIsolatedView) break;
      await delay(25);
    }
    const websiteSnapshot = runtime.snapshot();
    if (websiteSnapshot.tabs.length > tabsBeforeWebsiteOpen) {
      await runtime.closeTab(websiteSnapshot.activeTabId);
    }

    await window.webContents.executeJavaScript(`(() => {
      const profileButton = document.querySelector(".profile-button");
      if (!(profileButton instanceof HTMLButtonElement)) throw new Error("Profile button missing");
      profileButton.click();
    })()`);
    const profileActionsDeadline = Date.now() + 2_000;
    while (Date.now() < profileActionsDeadline) {
      const ready = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector(".profile-actions"))`,
      )) as boolean;
      if (ready) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const newProfile = [...document.querySelectorAll(".profile-actions button")]
        .find((button) => button.textContent?.includes("New profile"));
      if (!(newProfile instanceof HTMLButtonElement)) throw new Error("New profile action missing");
      newProfile.click();
    })()`);
    const profileEditorDeadline = Date.now() + 2_000;
    while (Date.now() < profileEditorDeadline) {
      const ready = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector("#profile-name"))`,
      )) as boolean;
      if (ready) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector("#profile-name");
      if (!(input instanceof HTMLInputElement)) throw new Error("Profile name field missing");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Work");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.closest("form")?.requestSubmit();
    })()`);
    const workProfileDeadline = Date.now() + 4_000;
    while (Date.now() < workProfileDeadline) {
      const ready = (await window.webContents.executeJavaScript(
        `document.querySelector(".workspace-title strong")?.textContent === "Work research"`,
      )) as boolean;
      if (ready) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const profileButton = document.querySelector(".profile-button");
      if (!(profileButton instanceof HTMLButtonElement)) throw new Error("Profile button missing");
      profileButton.click();
    })()`);
    const personalActionDeadline = Date.now() + 2_000;
    while (Date.now() < personalActionDeadline) {
      const ready = (await window.webContents.executeJavaScript(`(() => {
        const button = [...document.querySelectorAll(".profile-list > button")]
          .find((candidate) => candidate.querySelector("strong")?.textContent === "Personal");
        return button instanceof HTMLButtonElement && !button.disabled;
      })()`)) as boolean;
      if (ready) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const personal = [...document.querySelectorAll(".profile-list > button")]
        .find((button) => button.querySelector("strong")?.textContent === "Personal");
      if (!(personal instanceof HTMLButtonElement)) throw new Error("Personal profile missing");
      personal.click();
    })()`);
    const personalProfileDeadline = Date.now() + 4_000;
    while (Date.now() < personalProfileDeadline) {
      const ready = (await window.webContents.executeJavaScript(
        `document.querySelector(".workspace-title strong")?.textContent === "Personal research"`,
      )) as boolean;
      if (ready) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(
      `document.querySelector(".profile-button")?.click()`,
    );
    const profileMenuDeadline = Date.now() + 2_000;
    while (Date.now() < profileMenuDeadline && runtime.isVisible()) await delay(25);
    const profilesDom = (await window.webContents.executeJavaScript(`(() => ({
      profileCount: document.querySelectorAll(".profile-list > button").length,
      activeProfileName: document.querySelector(".profile-menu-header strong")?.textContent ?? "",
      profileMenuVisible: Boolean(document.querySelector(".profile-menu")),
      privacyExplanationVisible: document.querySelector(".profile-privacy-note")?.textContent?.includes("never stores your Google") ?? false
    }))()`)) as {
      profileCount: number;
      activeProfileName: string;
      profileMenuVisible: boolean;
      privacyExplanationVisible: boolean;
    };
    const nativeViewHiddenWhileProfileMenuOpen = !runtime.isVisible();
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const profileImage = await window.webContents.capturePage();
    if (profileImage.isEmpty()) throw new Error("Electron returned an empty profile-menu capture.");
    const profileScreenshot = profileImage.toPNG();
    const profileScreenshotPath = path.join(smokeRoot, "phase-12-profiles.png");
    await writeFile(profileScreenshotPath, profileScreenshot);
    window.hide();
    await window.webContents.executeJavaScript(
      `document.querySelector(".profile-menu-backdrop")?.click()`,
    );
    const profileIsolation = await runtime.collectProfileIsolationProbe();
    const profileRegistry = await readFile(path.join(profileRoot, "profiles.json"), "utf8");
    const registryContainsNoCredentials =
      !/(password|access[_-]?token|refresh[_-]?token|id[_-]?token|google[_-]?id)/i.test(
        profileRegistry,
      );

    await window.webContents.executeJavaScript(`(async () => {
      await window.lattice.vault.disconnect();
    })()`);
    const disconnectedVault = await window.webContents.executeJavaScript(
      `window.lattice.vault.current()`,
    );
    const noteAfterDisconnect = await stat(shellProbe.note.absolutePath);
    const canvasAfterDisconnect = await stat(parentCanvasPath);

    const securityCandidate = runtime
      .snapshot()
      .tabs.find((tab) => tab.url.startsWith("https://example.com/"));
    if (!securityCandidate) {
      throw new Error(
        `No HTTPS tab remained for the final security probe: ${JSON.stringify({
          activeProfileId: runtime.state().activeProfileId,
          firstProfileId: profileIsolation.firstProfileId,
          secondProfileId: profileIsolation.secondProfileId,
          snapshot: runtime.snapshot(),
        })}`,
      );
    }
    runtime.switchTab(securityCandidate.id);
    const stableSecurityDeadline = Date.now() + 5_000;
    let stableSecurityTab = runtime
      .snapshot()
      .tabs.find((tab) => tab.id === securityCandidate.id && !tab.loading);
    while (!stableSecurityTab && Date.now() < stableSecurityDeadline) {
      await delay(25);
      stableSecurityTab = runtime
        .snapshot()
        .tabs.find((tab) => tab.id === securityCandidate.id && !tab.loading);
    }
    if (!stableSecurityTab) {
      throw new Error("No fully loaded HTTPS tab remained for the final security probe.");
    }
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    runtime.setVisible(true);
    const probe = await runtime.collectSecurityProbe();
    window.hide();

    const screenshotPath = path.join(smokeRoot, "remote-example-com.png");
    await writeFile(screenshotPath, probe.screenshot);
    const remoteBounds = runtime.getBounds();

    runtime.close();
    await delay(50);
    const webContentsDestroyedAfterClose = runtime.isDestroyed();

    const evidencePath = path.join(
      smokeRoot,
      app.isPackaged ? "packaged-smoke-evidence.json" : "dev-smoke-evidence.json",
    );
    const evidence: PhaseNineSmokeEvidence = {
      packaged: app.isPackaged,
      versions: {
        electron: process.versions.electron ?? "unknown",
        chromium: process.versions.chrome ?? "unknown",
        node: process.versions.node,
      },
      shell: {
        url: shellUrl,
        title: shellTitle,
        domReady: shellProbe.domReady,
        bridgeVisible: shellProbe.bridgeVisible,
        contentSecurityPolicy,
        windowContentSize: { width: windowContentWidth, height: windowContentHeight },
        rendererReportedBounds,
        nativeSlotBounds: shellProbe.nativeSlotBounds,
        vaultPanelBounds: shellProbe.vaultPanelBounds,
        screenshotPath: shellScreenshotPath,
        screenshotBytes: shellScreenshot.byteLength,
      },
      remote: {
        url: probe.url,
        title: probe.title,
        viewBounds: remoteBounds,
        configuredPreferences: probe.configuredPreferences,
        webContentsType: probe.webContentsType,
        nativeViewConstructor: probe.nativeViewConstructor,
        sessionSeparatedFromShell: probe.sessionSeparatedFromShell,
        isolation: probe.isolation,
        screenshotPath,
        screenshotBytes: probe.screenshot.byteLength,
        screenshotMethod: probe.screenshotMethod,
      },
      webContentsDestroyedAfterClose,
      tabs: shellProbe.tabs,
      session: {
        beforeReloadCount: beforeReload.tabs.length,
        afterReloadCount: afterReload.tabs.length,
        restoredWithoutDuplicates:
          beforeReload.tabs.length === 2 && afterReload.tabs.length === beforeReload.tabs.length,
        activeDesktop: sessionDom.activeDesktop,
        activeDesktopSummary: sessionDom.activeDesktopSummary,
        tabTitle: sessionDom.tabTitle,
        commandPaletteVisible,
        nativeViewHiddenWhilePaletteOpen,
      },
      profiles: {
        ...profilesDom,
        nativeViewHiddenWhileMenuOpen: nativeViewHiddenWhileProfileMenuOpen,
        firstCookieRetained: profileIsolation.firstCookieRetained,
        secondCookieInitiallyAbsent: profileIsolation.secondCookieInitiallyAbsent,
        secondCookieRetained: profileIsolation.secondCookieRetained,
        partitionsDistinct: profileIsolation.partitionsDistinct,
        registryContainsNoCredentials,
        screenshotPath: profileScreenshotPath,
        screenshotBytes: profileScreenshot.byteLength,
      },
      navigation: {
        ...navigationDom,
        nativeViewHidden: nativeViewHiddenForFocus,
        escapeRestoredNavigation,
        shortcutRouteSequence,
        browserRestoredAfterShortcuts,
        screenshotPath: focusNavigationScreenshotPath,
        screenshotBytes: focusNavigationScreenshot.byteLength,
      },
      desktopLifecycle: {
        guardedDeleteBlockedForOpenTab,
        menuVisible: browserMenuVisible,
        nativeViewHiddenWhileMenuOpen,
        movedToDesktop: movedDom.activeDesktop,
        movedTabRetained,
        emptiedSourceDesktop,
        deletionConfirmationVisible,
        deletedEmptyDesktop: !deletedDom.buildPresent,
        adjacentDesktopActivated: deletedDom.activeDesktop === "Inspiration",
        savedResearchDesktopPreserved: deletedDom.researchSummary.includes("1 saved"),
      },
      metadataEditing: {
        formVisible: editFormVisible,
        title: metadataDom.title,
        description: metadataDom.description,
        pathPreserved: editedLink?.relativePath === shellProbe.note.relativePath,
        bodyPreserved: initialBody === finalBody,
        urlPreserved: editedLink?.url === shellProbe.note.url,
        readingStatePreserved:
          editedLink?.readingStatus === "queued" &&
          editedLink.queuedAt === shellProbe.reading.requeued.queuedAt,
        temporaryFilesRemaining: noteDirectoryEntries.filter((entry) => entry.endsWith(".tmp"))
          .length,
        screenshotPath: metadataEditorScreenshotPath,
        screenshotBytes: metadataEditorScreenshot.byteLength,
      },
      obsidianHandoff: {
        ...handoffUi,
        openInvocations: openedExternalUris.length,
        revealInvocations: handoffRevealInvocations,
        obsidianUri: openedExternalUris[0] ?? "",
        decodedPathMatches: decodedObsidianPath === canonicalNotePath.split(path.sep).join("/"),
        revealedPathMatches: revealedFilePaths[0] === canonicalNotePath,
        screenshotPath: handoffScreenshotPath,
        screenshotBytes: handoffScreenshot.byteLength,
      },
      readingQueue: {
        capturedAsQueued:
          shellProbe.note.readingStatus === "queued" && Boolean(shellProbe.note.queuedAt),
        markedRead:
          shellProbe.reading.markedRead.readingStatus === "read" &&
          Boolean(shellProbe.reading.markedRead.readAt),
        requeued:
          shellProbe.reading.requeued.readingStatus === "queued" &&
          Boolean(shellProbe.reading.requeued.queuedAt) &&
          !shellProbe.reading.requeued.readAt,
        heading: queueDom.heading,
        summary: queueDom.summary,
        itemTitle: queueDom.itemTitle,
        markReadVisible: queueDom.markReadVisible,
        nativeViewHidden: nativeViewHiddenForQueue,
      },
      canvas: {
        pageCount: shellProbe.canvas.pages.length,
        title: canvasUi.title,
        folder: shellProbe.canvas.parent.folder,
        nodeCount: canvasUi.objectCount,
        nodeKinds: parentCanvasDocument.nodes.map(
          (node: { type: string; latticeKind?: string }) =>
            `${node.type}:${node.latticeKind ?? "standard"}`,
        ),
        typedLinkKinds: canvasUi.typedLinkKinds,
        jsonCanvasShape:
          Array.isArray(parentCanvasDocument.nodes) &&
          Array.isArray(parentCanvasDocument.edges) &&
          parentCanvasDocument.lattice?.id === shellProbe.canvas.parent.id &&
          canvasAfterDisconnect.isFile(),
        pageLinkNavigated,
        objectLinkFocused,
        websiteOpenedInIsolatedView,
        localRevealInvocations: Math.max(0, revealedFilePaths.length - 1),
        revealedPathMatches: revealedFilePaths[1] === canonicalBriefPath,
        nativeViewHidden: nativeViewHiddenForCanvas,
        pathNotRendered: canvasUi.pathNotRendered,
        unresolvedReferenceCount: referenceUi.unresolvedReferenceCount,
        repairDiagnosticsVisible: referenceUi.repairDiagnosticsVisible,
        backlinkSourceVisible: referenceUi.backlinkSourceVisible,
        privateReferencePathHidden: referenceUi.privatePathHidden,
        temporaryFilesRemaining: (await readdir(parentCanvasDirectory)).filter((entry) =>
          entry.endsWith(".tmp"),
        ).length,
        absolutePath: parentCanvasPath,
        sha256: createHash("sha256").update(parentCanvasBytes).digest("hex"),
        screenshotPath: canvasScreenshotPath,
        screenshotBytes: canvasScreenshot.byteLength,
      },
      privacy: {
        ...privacyProbe,
        settingsHeading: settingsDom.heading,
        settingsPrivacyText: settingsDom.privacyText,
        restoreTabsEnabled: settingsDom.restoreTabsEnabled,
        nativeViewHidden: nativeViewHiddenForSettings,
      },
      note: {
        vaultPath: shellProbe.vault.displayPath,
        disposableVault: shellProbe.vault.disposable,
        obsidianDirectoryPresent: obsidianStats.isDirectory(),
        absolutePath: shellProbe.note.absolutePath,
        relativePath: shellProbe.note.relativePath,
        bytesWritten: shellProbe.note.bytesWritten,
        bytesReadBack: initialNoteBytes.byteLength,
        sha256: createHash("sha256").update(finalNoteBytes).digest("hex"),
        temporaryFilesRemaining: noteDirectoryEntries.filter((entry) => entry.endsWith(".tmp"))
          .length,
        libraryCount: shellProbe.links.length,
        libraryRoundTrip: shellProbe.links.some(
          (link) =>
            link.id === shellProbe.note.id &&
            link.folder === shellProbe.note.folder &&
            link.desktopId === shellProbe.note.desktopId &&
            link.description === shellProbe.note.description,
        ),
        disconnectedWithoutDeleting: disconnectedVault === null && noteAfterDisconnect.isFile(),
      },
      evidencePath,
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    cleanup();
    return evidence;
  } catch (error) {
    cleanup();
    throw error;
  }
}
