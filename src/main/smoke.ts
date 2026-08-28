import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import type {
  BrowserBounds,
  SavedLinkRecord,
  SaveNoteResult,
  VaultInfo,
} from "../shared/contracts";
import { BrowserRuntime } from "./browser/browser-runtime";
import { registerIpc } from "./ipc";
import { installLatticeProtocol } from "./protocol";
import { VaultService } from "./vault/vault-service";

export interface PhaseFourSmokeEvidence {
  packaged: boolean;
  versions: { electron: string; chromium: string; node: string };
  shell: {
    url: string;
    title: string;
    domReady: boolean;
    bridgeVisible: boolean;
    contentSecurityPolicy: string | null;
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
  tabs: PhaseFourSmokeEvidence["tabs"];
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

interface SettingsDomResult {
  heading: string;
  privacyText: string;
  restoreTabsEnabled: boolean;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRendererBounds(runtime: BrowserRuntime): Promise<BrowserBounds> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const bounds = runtime.getBounds();
    if (bounds.width >= 100 && bounds.height >= 100 && bounds.x >= 0 && bounds.y >= 0) {
      return bounds;
    }
    await delay(25);
  }
  throw new Error("The packaged React renderer did not report usable native-view bounds.");
}

export async function runPhaseFourSmoke(
  rendererRoot: string,
  preloadPath: string,
): Promise<PhaseFourSmokeEvidence> {
  const smokeRoot = path.join(os.tmpdir(), "lattice-phase-four");
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

  const runtime = new BrowserRuntime(window, {
    partition: `lattice-remote-smoke-${randomUUID()}`,
  });
  const unregisterIpc = registerIpc(window, runtime, new VaultService());
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
    const rendererReportedBounds = await waitForRendererBounds(runtime);
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
        title: "Phase 4 packaged smoke",
        url: "https://example.com/phase-four",
        description: "Atomic Markdown written into a desktop folder and read back through the packaged library.",
        folder: "Research",
        desktopId: "research",
        readingStatus: "queued"
      });
      const markedRead = await window.lattice.vault.setReadingStatus({ id: note.id, status: "read" });
      const requeued = await window.lattice.vault.setReadingStatus({ id: note.id, status: "queued" });
      const links = await window.lattice.vault.listSavedLinks();
      return {
        domReady: Boolean(document.querySelector(".lattice-shell")),
        bridgeVisible: typeof window.lattice !== "undefined",
        nativeSlotBounds: readBounds(".native-view-slot"),
        vaultPanelBounds: readBounds(".vault-probe"),
        vault,
        note,
        links,
        reading: { markedRead, requeued },
        tabs: {
          initialCount: initialSnapshot.tabs.length,
          afterCreateCount: createdSnapshot.tabs.length,
          switchedBackToInitial: switchedSnapshot.activeTabId === initialSnapshot.activeTabId,
          afterCloseCount: closedSnapshot.tabs.length,
          closedTabAbsent: !closedSnapshot.tabs.some((tab) => tab.id === createdTabId)
        }
      };
    })()`)) as ShellProbeResult;

    const noteBytes = await readFile(shellProbe.note.absolutePath);
    const noteDirectoryEntries = await readdir(path.dirname(shellProbe.note.absolutePath));
    const obsidianStats = await stat(path.join(shellProbe.vault.displayPath, ".obsidian"));

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
      `localStorage.setItem("lattice.session.v1", ${JSON.stringify(JSON.stringify({ version: 1, tabs: sessionTabs }))})`,
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
    if (!sessionDom) throw new Error("The Phase 4 session UI did not become ready.");
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
    if (!queueDom) throw new Error("The Phase 4 reading queue UI did not become ready.");
    const nativeViewHiddenForQueue = !runtime.isVisible();

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
        privacyText: document.querySelectorAll(".settings-card p")[1]?.textContent?.trim() ?? "",
        restoreTabsEnabled: document.querySelector('[role="switch"][aria-label="Restore tabs on launch"]')?.getAttribute("aria-checked") === "true"
      }))()`)) as SettingsDomResult;
      if (settingsDom.heading === "Settings" && settingsDom.privacyText) break;
      await delay(25);
    }
    if (!settingsDom) throw new Error("The Phase 4 settings UI did not become ready.");
    const nativeViewHiddenForSettings = !runtime.isVisible();

    // Chromium only exposes composed surfaces while the owning window is shown. Keep
    // the smoke window out of the taskbar and avoid taking focus.
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);

    const shellImage = await window.webContents.capturePage();
    if (shellImage.isEmpty()) throw new Error("Electron returned an empty shell capture.");
    const shellScreenshot = shellImage.toPNG();
    const shellScreenshotPath = path.join(smokeRoot, "phase-4-shell.png");
    await writeFile(shellScreenshotPath, shellScreenshot);

    await window.webContents.executeJavaScript(`(async () => {
      await window.lattice.vault.disconnect();
    })()`);
    const disconnectedVault = await window.webContents.executeJavaScript(
      `window.lattice.vault.current()`,
    );
    const noteAfterDisconnect = await stat(shellProbe.note.absolutePath);

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
    const evidence: PhaseFourSmokeEvidence = {
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
        bytesReadBack: noteBytes.byteLength,
        sha256: createHash("sha256").update(noteBytes).digest("hex"),
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
