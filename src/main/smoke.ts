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
    brandLogoVisible: boolean;
    svgFaviconPresent: boolean;
    pngFaviconPresent: boolean;
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
    loadingLabelAbsent: boolean;
    createActionEnabled: boolean;
    menuActionsLookEnabled: boolean;
    identityTilesThemed: boolean;
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
    dashboardCards: string[];
    desktopNames: string[];
    desktopsBeforeNavigate: boolean;
    inlineRenameRoundTrip: boolean;
    todayTaskCount: number;
    readingPreviewCount: number;
    privacyPromise: string;
    filesDestinationVisible: boolean;
    activeDesktopIndicated: boolean;
    focusBarThemed: boolean;
    intention: string;
    focusMode: boolean;
    chromeHidden: boolean;
    nativeViewHidden: boolean;
    escapeRestoredNavigation: boolean;
    shortcutRouteSequence: string[];
    browserRestoredAfterShortcuts: boolean;
    newTabHeading: string;
    newTabShortcutCount: number;
    newTabContinueItemCount: number;
    newTabQuickAccessCount: number;
    newTabLatticeBarCount: number;
    newTabQuickCaptureAbsent: boolean;
    newTabBrowserToolbarHidden: boolean;
    capturedInboxCount: number;
    capturedNoteVisibleInInbox: boolean;
    newTabNativeViewHidden: boolean;
    newTabNativeViewHiddenAfterReactivation: boolean;
    newTabReactivationPreservedLayout: boolean;
    newTabScreenshotPath: string;
    newTabScreenshotBytes: number;
    screenshotPath: string;
    screenshotBytes: number;
  };
  runnableApps: {
    heading: string;
    appName: string;
    originalResult: string;
    correctedResult: string;
    overridden: boolean;
    originalPreserved: boolean;
    persisted: boolean;
    activeRunCleared: boolean;
    profileScoped: boolean;
    adaptiveLightSurface: boolean;
    nativeViewHidden: boolean;
    screenshotPath: string;
    screenshotBytes: number;
  };
  dailyFlow: {
    heading: string;
    catalogCount: number;
    nowTask: string;
    todaySummary: string;
    originalText: string;
    effectiveText: string;
    activityTypes: string[];
    originalPreserved: boolean;
    explicitlyCompleted: boolean;
    linkedPomodoro: boolean;
    linkedTimerStopped: boolean;
    persisted: boolean;
    profileScoped: boolean;
    activeRunCleared: boolean;
    adaptiveLightSurface: boolean;
    nativeViewHidden: boolean;
    screenshotPath: string;
    screenshotBytes: number;
  };
  wealthLab: {
    heading: string;
    catalogCount: number;
    incomeTargetMinor: number;
    investmentTargetMinor: number;
    incomeMinor: number;
    expenseMinor: number;
    investmentMinor: number;
    netCashMinor: number;
    originalExpenseMinor: number;
    correctedExpenseMinor: number;
    originalExpensePreserved: boolean;
    ideaTitle: string;
    ideaNextStep: string;
    ideaStatus: string;
    ideaFeatured: boolean;
    netWorthMinor: number;
    linkedPomodoro: boolean;
    linkedTimerStopped: boolean;
    safetyBoundaryVisible: boolean;
    persisted: boolean;
    profileScoped: boolean;
    activeRunCleared: boolean;
    adaptiveLightSurface: boolean;
    nativeViewHidden: boolean;
    screenshotPath: string;
    screenshotBytes: number;
  };
  desktopLifecycle: {
    occupiedArchiveOptionsVisible: boolean;
    menuVisible: boolean;
    nativeViewHiddenWhileMenuOpen: boolean;
    movedToDesktop: string;
    movedTabRetained: boolean;
    emptiedSourceDesktop: boolean;
    archivePopoverVisible: boolean;
    archivedEmptyDesktop: boolean;
    adjacentDesktopActivated: boolean;
    restoredArchivedDesktop: boolean;
    hardDeleteAvailableOnlyInArchive: boolean;
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
  themes: {
    optionCount: number;
    defaultTheme: string;
    feltApplied: boolean;
    feltTextureVisible: boolean;
    feltRecoveryThemed: boolean;
    feltProfileTilesThemed: boolean;
    customName: string;
    customApplied: boolean;
    customPersisted: boolean;
    customProfileScoped: boolean;
    undoRestored: boolean;
    returnedToDark: boolean;
    nativeTitleBarSynced: boolean;
  };
  note: {
    vaultPath: string;
    disposableVault: boolean;
    coachDirectoryPresent: boolean;
    desktopFoldersPresent: boolean;
    inboxCapturePresent: boolean;
    localPathsHidden: boolean;
    nestedWorkspaceRoundTrip: boolean;
    extensibleCoachObjectRoundTrip: boolean;
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
  brandLogoVisible: boolean;
  svgFaviconPresent: boolean;
  pngFaviconPresent: boolean;
  nativeSlotBounds: BrowserBounds;
  vaultPanelBounds: BrowserBounds;
  vault: VaultInfo;
  note: SaveNoteResult;
  localWorkspace: {
    rootName: string;
    desktops: Array<{
      desktopId: string;
      inboxCount: number;
      fileCount: number;
      items: Array<{ name: string; area: string }>;
    }>;
  };
  interactiveWorkspace: {
    listing: {
      relativePath: string;
      entries: Array<{ name: string; fileType: string }>;
    };
    saved: { relativePath: string; content: string };
  };
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
  themeOptionCount: number;
  activeTheme: string;
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

interface LayeredActionPopoverEvidence {
  description: string;
  overflowX: string;
  placement: string;
  topLayer: boolean;
  topmost: boolean;
  zIndex: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runNewTabReactivationSmoke(
  rendererRoot: string,
  preloadPath: string,
): Promise<{
  initialHomeHeight: number;
  reactivatedSurfaceHeight: number;
  rendererReportedHeight: number;
  windowHeight: number;
  browserToolbarHidden: boolean;
  nativeViewHidden: boolean;
  screenshotPath: string;
  screenshotBytes: number;
  newTabLaunchpad: {
    heading: string;
    shortcutCount: number;
    continuePanel: boolean;
    quickAccessCount: number;
    latticeBarCount: number;
    quickCaptureAbsent: boolean;
    searchPlaceholder: string;
  };
  intentChecks: {
    googleSearch: boolean;
    youtubeSearch: boolean;
    saveAsNote: boolean;
    oneControlInNoteMode: boolean;
  };
  restoreStormRecovery: {
    restoredDuplicateCount: number;
    failedTabRemovedFromSession: boolean;
  };
  reactivatedLaunchpadVisible: boolean;
  actionPopovers: {
    compactNavigation: string;
    searchEverything: string;
    desktopRow: string;
    navigationDashboard: string;
    navigationBrowse: string;
    navigationCanvas: string;
    navigationApps: string;
    navigationSettings: string;
    navigationSavedLinks: string;
    navigationReadingQueue: string;
    desktopDashboard: string;
    dashboardTab: LayeredActionPopoverEvidence;
    dashboardTabPin: LayeredActionPopoverEvidence;
    dashboardTabFavorite: LayeredActionPopoverEvidence;
    dashboardTabMove: LayeredActionPopoverEvidence;
    dashboardTabOpen: LayeredActionPopoverEvidence;
    dashboardTabClose: LayeredActionPopoverEvidence;
    openTabs: LayeredActionPopoverEvidence;
    customize: LayeredActionPopoverEvidence;
    sectionTab: LayeredActionPopoverEvidence;
    sectionToggle: LayeredActionPopoverEvidence;
    sectionDrag: LayeredActionPopoverEvidence;
    tab: LayeredActionPopoverEvidence;
  };
}> {
  const window = new BrowserWindow({
    show: false,
    width: 1_000,
    height: 720,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#101017",
      symbolColor: "#e9e9f2",
      height: 43,
    },
    backgroundColor: "#101017",
    webPreferences: {
      partition: `lattice-new-tab-smoke-${randomUUID()}`,
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
  const profileRoot = path.join(os.tmpdir(), "lattice-new-tab-reactivation", randomUUID());
  const profileStore = new ProfileStore(
    path.join(profileRoot, "profiles.json"),
    path.join(profileRoot, "avatars"),
  );
  await profileStore.initialize();
  const runtime = new ProfileRuntime(window, profileStore);
  const unregisterIpc = registerIpc(window, runtime, new VaultService(), runtime);

  try {
    await window.loadURL("lattice://app/index.html");
    await window.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 3000;
      while (!window.lattice && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (!window.lattice) throw new Error('Lattice bridge did not initialize');
      const profiles = await window.lattice.profiles.state();
      localStorage.setItem(
        'lattice.session.v1.profile.' + profiles.activeProfileId,
        JSON.stringify({
          version: 1,
          tabs: Array.from({ length: 24 }, (_, index) => ({
            url: 'https://test/',
            desktopId: 'research',
            active: index === 23
          }))
        })
      );
    })()`);
    await window.loadURL("lattice://app/index.html");
    const restoreStormRecovery = (await window.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 6000;
      let snapshot = await window.lattice.browser.snapshot();
      while (Date.now() < deadline) {
        const duplicates = snapshot.tabs.filter((tab) => tab.url === 'https://test/');
        if (duplicates.length === 1 && duplicates[0]?.error) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
        snapshot = await window.lattice.browser.snapshot();
      }
      const restoredDuplicateCount = snapshot.tabs.filter(
        (tab) => tab.url === 'https://test/'
      ).length;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const profiles = await window.lattice.profiles.state();
      const serialized = localStorage.getItem(
        'lattice.session.v1.profile.' + profiles.activeProfileId
      );
      const saved = serialized ? JSON.parse(serialized) : { tabs: [] };
      const failedTabRemovedFromSession =
        Array.isArray(saved.tabs) && !saved.tabs.some((tab) => tab.url === 'https://test/');
      for (const tab of snapshot.tabs.filter((candidate) => candidate.url === 'https://test/')) {
        await window.lattice.browser.closeTab(tab.id);
      }
      return { restoredDuplicateCount, failedTabRemovedFromSession };
    })()`)) as {
      restoredDuplicateCount: number;
      failedTabRemovedFromSession: boolean;
    };
    await window.loadURL("lattice://app/index.html");
    const result = (await window.webContents.executeJavaScript(`(async () => {
      const waitFor = async (predicate, message) => {
        const deadline = Date.now() + 3000;
        while (!predicate() && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (!predicate()) throw new Error(message);
      };
      await waitFor(
        () => document.querySelectorAll('.browser-tab').length > 0 &&
          Boolean(document.querySelector('.new-tab-surface')),
        'Initial New Tab did not render'
      );
      const initialHomeHeight = document.querySelector('.new-tab-surface')
        ?.getBoundingClientRect().height ?? 0;
      const newTabLaunchpad = {
        heading: document.querySelector('.new-tab-heading h1')?.textContent?.trim() ?? '',
        shortcutCount: document.querySelectorAll('.new-tab-shortcut').length,
        continuePanel: Boolean(document.querySelector('.new-tab-continue-card')),
        quickAccessCount: document.querySelectorAll('.new-tab-quick-access-grid > button').length,
        latticeBarCount: document.querySelectorAll('.new-tab-search input, .new-tab-search textarea').length,
        quickCaptureAbsent: !document.querySelector('.quick-note'),
        searchPlaceholder: document.querySelector('.new-tab-search input')
          ?.getAttribute('placeholder') ?? ''
      };
      const popoverFor = async (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) throw new Error('Missing popover target: ' + selector);
        element.dispatchEvent(new PointerEvent('pointerover', {
          bubbles: true,
          pointerType: 'mouse'
        }));
        await waitFor(
          () => Boolean(document.querySelector('.action-popover-description')),
          'Action popover did not appear for ' + selector
        );
        const description = document.querySelector('.action-popover-description')
          ?.textContent?.trim() ?? '';
        element.dispatchEvent(new PointerEvent('pointerout', {
          bubbles: true,
          pointerType: 'mouse',
          relatedTarget: document.body
        }));
        await waitFor(
          () => !document.querySelector('.action-popover-description'),
          'Action popover did not close for ' + selector
        );
        return description;
      };
      const sidebarActionPopovers = {
        compactNavigation: await popoverFor('.navigation-collapse-button'),
        searchEverything: await popoverFor('.panel-search'),
        desktopRow: await popoverFor('.desktop-item[data-desktop-id]'),
        navigationDashboard: await popoverFor('.focus-navigation .navigation-row:nth-of-type(1)'),
        navigationBrowse: await popoverFor('.focus-navigation .navigation-row:nth-of-type(2)'),
        navigationCanvas: await popoverFor('.focus-navigation .navigation-row:nth-of-type(3)'),
        navigationApps: await popoverFor('.focus-navigation .navigation-row:nth-of-type(4)'),
        navigationSettings: await popoverFor('.focus-navigation .navigation-row:nth-of-type(5)'),
        navigationSavedLinks: await popoverFor('.library-label + .library-row'),
        navigationReadingQueue: await popoverFor('.library-label + .library-row + .library-row'),
        desktopDashboard: await popoverFor('.desktop-context')
      };
      const dashboardButton = document.querySelector('.desktop-context');
      if (!(dashboardButton instanceof HTMLButtonElement)) {
        throw new Error('Dashboard tab was not available');
      }
      dashboardButton.click();
      await waitFor(
        () => dashboardButton.classList.contains('active') &&
          Boolean(document.querySelector('.dashboard-content-shell')),
        'Dashboard did not activate for the tab popover check'
      );
      const layeredPopoverFor = async (element, label) => {
        if (!(element instanceof HTMLElement)) throw new Error(label + ' target was not available');
        element.dispatchEvent(new PointerEvent('pointerover', {
          bubbles: true,
          pointerType: 'mouse'
        }));
        await waitFor(
          () => Boolean(document.querySelector('.action-popover')),
          label + ' action popover did not appear'
        );
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const popoverElement = document.querySelector('.action-popover');
        if (!(popoverElement instanceof HTMLElement)) {
          throw new Error(label + ' action popover was not measurable');
        }
        const bounds = popoverElement.getBoundingClientRect();
        const previousPointerEvents = popoverElement.style.pointerEvents;
        popoverElement.style.pointerEvents = 'auto';
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2
        );
        popoverElement.style.pointerEvents = previousPointerEvents;
        const evidence = {
          description: popoverElement.querySelector('.action-popover-description')
            ?.textContent?.trim() ?? '',
          overflowX: getComputedStyle(popoverElement).overflowX,
          placement: popoverElement.dataset.placement ?? '',
          topLayer: popoverElement.matches(':popover-open'),
          topmost: hit === popoverElement || popoverElement.contains(hit),
          zIndex: getComputedStyle(popoverElement).zIndex
        };
        element.dispatchEvent(new PointerEvent('pointerout', {
          bubbles: true,
          pointerType: 'mouse',
          relatedTarget: document.body
        }));
        await waitFor(
          () => !document.querySelector('.action-popover'),
          label + ' action popover did not close'
        );
        return evidence;
      };
      const openTabsPopover = await layeredPopoverFor(
        document.querySelector('[data-dashboard-section="open-tabs"]'),
        'Open tabs section tab'
      );
      const dashboardTabPopover = await layeredPopoverFor(
        document.querySelector('.dashboard-tab-card'),
        'Dashboard open tab card'
      );
      const dashboardTabPinPopover = await layeredPopoverFor(
        document.querySelector('.dashboard-tab-card [aria-label="Pin tab"]'),
        'Dashboard open tab pin action'
      );
      const dashboardTabFavoritePopover = await layeredPopoverFor(
        document.querySelector('.dashboard-tab-card [aria-label="Add favorite"]'),
        'Dashboard open tab favorite action'
      );
      const dashboardTabMovePopover = await layeredPopoverFor(
        document.querySelector('.dashboard-tab-card .dashboard-tab-drag'),
        'Dashboard open tab move action'
      );
      const dashboardTabOpenPopover = await layeredPopoverFor(
        document.querySelector('.dashboard-tab-card [aria-label="Open tab"]'),
        'Dashboard open tab open action'
      );
      const dashboardTabClosePopover = await layeredPopoverFor(
        document.querySelector('.dashboard-tab-card [aria-label="Close tab"]'),
        'Dashboard open tab close action'
      );
      const sectionTabPopover = await layeredPopoverFor(
        document.querySelector('[data-dashboard-section="history"]'),
        'History section tab'
      );
      const customizeButton = document.querySelector('.dashboard-toolbar-customize');
      const customizePopover = await layeredPopoverFor(customizeButton, 'Customize dashboard');
      if (!(customizeButton instanceof HTMLButtonElement)) {
        throw new Error('Customize dashboard button was not available');
      }
      customizeButton.click();
      await waitFor(
        () => Boolean(document.querySelector('.dashboard-customizer')),
        'Dashboard customizer did not open'
      );
      const sectionTogglePopover = await layeredPopoverFor(
        document.querySelector('[data-dashboard-section-toggle="history"]'),
        'History section toggle'
      );
      const sectionDragPopover = await layeredPopoverFor(
        document.querySelector('[data-dashboard-section-drag="history"]'),
        'History section drag handle'
      );
      const closeCustomizerButton = document.querySelector('.dashboard-customizer > header button');
      if (!(closeCustomizerButton instanceof HTMLButtonElement)) {
        throw new Error('Close dashboard customizer button was not available');
      }
      closeCustomizerButton.click();
      await waitFor(
        () => !document.querySelector('.dashboard-customizer'),
        'Dashboard customizer did not close'
      );
      const tabPopoverTarget = document.querySelector('.browser-tab .tab-select');
      const tabPopover = await layeredPopoverFor(tabPopoverTarget, 'Browser tab');
      if (!(tabPopoverTarget instanceof HTMLButtonElement)) {
        throw new Error('Browser tab popover target was not available');
      }
      tabPopoverTarget.click();
      await waitFor(
        () => Boolean(document.querySelector('.new-tab-surface')),
        'New Tab did not reopen after the tab popover check'
      );
      const setLatticeValue = (value) => {
        const control = document.querySelector('.new-tab-search input, .new-tab-search textarea');
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
          throw new Error('Lattice Bar control was not available');
        }
        const prototype = control instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!setter) throw new Error('Lattice Bar value setter was unavailable');
        setter.call(control, value);
        control.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setLatticeValue('test');
      await waitFor(
        () => document.querySelector('.lattice-web-primary strong')?.textContent?.includes('Google') &&
          Boolean(document.querySelector('.lattice-save-note-action')),
        'Plain text did not produce Google and note actions'
      );
      const googleSearch = document.querySelector('.lattice-web-primary strong')
        ?.textContent?.includes('Search Google for') ?? false;
      const saveAsNote = document.querySelector('.lattice-save-note-action strong')
        ?.textContent?.includes('Save “test” as a note') ?? false;
      setLatticeValue('youtube how to focus');
      await waitFor(
        () => document.querySelector('.lattice-web-primary strong')
          ?.textContent?.includes('Search YouTube for'),
        'Named YouTube intent did not appear'
      );
      const youtubeSearch = document.querySelector('.lattice-web-primary strong')
        ?.textContent?.includes('Search YouTube for “how to focus”') ?? false;
      setLatticeValue('remember this idea');
      await waitFor(
        () => Boolean(document.querySelector('.lattice-save-note-action')),
        'Save-as-note action did not appear'
      );
      const noteAction = document.querySelector('.lattice-save-note-action');
      if (!(noteAction instanceof HTMLButtonElement)) throw new Error('Save-as-note action missing');
      noteAction.click();
      await waitFor(
        () => Boolean(document.querySelector('.new-tab-search.note-mode textarea')),
        'The Lattice Bar did not enter note mode'
      );
      const oneControlInNoteMode =
        document.querySelectorAll('.new-tab-search input, .new-tab-search textarea').length === 1 &&
        !document.querySelector('.quick-note');
      const backToSearch = [...document.querySelectorAll('.lattice-note-context button')]
        .find((button) => button.textContent?.includes('Back to search'));
      if (!(backToSearch instanceof HTMLButtonElement)) throw new Error('Back to search missing');
      backToSearch.click();
      await waitFor(
        () => Boolean(document.querySelector('.new-tab-search input')),
        'The Lattice Bar did not leave note mode'
      );
      setLatticeValue('');
      await waitFor(
        () => Boolean(document.querySelector('.new-tab-overview-grid')),
        'The New Tab overview did not return after clearing the query'
      );
      const intentChecks = { googleSearch, youtubeSearch, saveAsNote, oneControlInNoteMode };
      const actionPopovers = {
        ...sidebarActionPopovers,
        dashboardTab: dashboardTabPopover,
        dashboardTabPin: dashboardTabPinPopover,
        dashboardTabFavorite: dashboardTabFavoritePopover,
        dashboardTabMove: dashboardTabMovePopover,
        dashboardTabOpen: dashboardTabOpenPopover,
        dashboardTabClose: dashboardTabClosePopover,
        openTabs: openTabsPopover,
        customize: customizePopover,
        sectionTab: sectionTabPopover,
        sectionToggle: sectionTogglePopover,
        sectionDrag: sectionDragPopover,
        tab: tabPopover
      };
      const initialTabCount = document.querySelectorAll('.browser-tab').length;
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
      );
      await waitFor(
        () => document.querySelectorAll('.browser-tab').length > initialTabCount &&
          Boolean(document.querySelector('.new-tab-surface')) &&
          !document.querySelector('.browser-toolbar'),
        'Ctrl+T did not create the one-input New Tab'
      );
      const activeTab = document.querySelector('.browser-tab.active');
      const returnButton = activeTab?.querySelector('.tab-select');
      const otherTab = [...document.querySelectorAll('.browser-tab')]
        .find((candidate) => candidate !== activeTab);
      const otherButton = otherTab?.querySelector('.tab-select');
      if (!(activeTab instanceof HTMLElement) ||
          !(returnButton instanceof HTMLButtonElement) ||
          !(otherButton instanceof HTMLButtonElement)) {
        throw new Error('New Tab reactivation controls were not available');
      }
      otherButton.click();
      await waitFor(
        () => !activeTab.classList.contains('active'),
        'The alternate tab did not activate'
      );
      returnButton.click();
      await waitFor(
        () => activeTab.classList.contains('active') &&
          Boolean(document.querySelector('.new-tab-surface')),
        'The New Tab did not reactivate'
      );
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        initialHomeHeight,
        reactivatedSurfaceHeight: document.querySelector('.new-tab-surface')
          ?.getBoundingClientRect().height ?? 0,
        windowHeight: window.innerHeight,
        browserToolbarHidden: !document.querySelector('.browser-toolbar'),
        newTabLaunchpad,
        intentChecks,
        reactivatedLaunchpadVisible:
          Boolean(document.querySelector('.new-tab-continue-card')) &&
          document.querySelectorAll('.new-tab-quick-access-grid > button').length === 6,
        actionPopovers,
      };
    })()`)) as {
      initialHomeHeight: number;
      reactivatedSurfaceHeight: number;
      windowHeight: number;
      browserToolbarHidden: boolean;
      newTabLaunchpad: {
        heading: string;
        shortcutCount: number;
        continuePanel: boolean;
        quickAccessCount: number;
        latticeBarCount: number;
        quickCaptureAbsent: boolean;
        searchPlaceholder: string;
      };
      intentChecks: {
        googleSearch: boolean;
        youtubeSearch: boolean;
        saveAsNote: boolean;
        oneControlInNoteMode: boolean;
      };
      reactivatedLaunchpadVisible: boolean;
      actionPopovers: {
        compactNavigation: string;
        searchEverything: string;
        desktopRow: string;
        navigationDashboard: string;
        navigationBrowse: string;
        navigationCanvas: string;
        navigationApps: string;
        navigationSettings: string;
        navigationSavedLinks: string;
        navigationReadingQueue: string;
        desktopDashboard: string;
        dashboardTab: LayeredActionPopoverEvidence;
        dashboardTabPin: LayeredActionPopoverEvidence;
        dashboardTabFavorite: LayeredActionPopoverEvidence;
        dashboardTabMove: LayeredActionPopoverEvidence;
        dashboardTabOpen: LayeredActionPopoverEvidence;
        dashboardTabClose: LayeredActionPopoverEvidence;
        openTabs: LayeredActionPopoverEvidence;
        customize: LayeredActionPopoverEvidence;
        sectionTab: LayeredActionPopoverEvidence;
        sectionToggle: LayeredActionPopoverEvidence;
        sectionDrag: LayeredActionPopoverEvidence;
        tab: LayeredActionPopoverEvidence;
      };
    };
    await delay(100);
    window.setContentSize(1_536, 1_024);
    await delay(100);
    await window.webContents.executeJavaScript(`(async () => {
      const input = document.querySelector('.new-tab-search input');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Lattice Bar input was unavailable for visual evidence');
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'youtube how to focus');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const deadline = Date.now() + 2000;
      while (!document.querySelector('.lattice-bar-results') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (!document.querySelector('.lattice-bar-results')) {
        throw new Error('Lattice Bar results were unavailable for visual evidence');
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const screenshotImage = await window.webContents.capturePage();
    window.hide();
    if (screenshotImage.isEmpty()) {
      throw new Error("Electron returned an empty New Tab launchpad capture.");
    }
    const screenshot = screenshotImage.toPNG();
    const screenshotPath = path.join(profileRoot, "new-tab-launchpad.png");
    await writeFile(screenshotPath, screenshot);
    const evidence = {
      ...result,
      restoreStormRecovery,
      rendererReportedHeight: runtime.getBounds().height,
      nativeViewHidden: !runtime.isVisible(),
      screenshotPath,
      screenshotBytes: screenshot.byteLength,
    };
    const minimumFullHeight = Math.max(300, evidence.windowHeight * 0.5);
    const layeredActionPopovers = [
      evidence.actionPopovers.dashboardTab,
      evidence.actionPopovers.dashboardTabPin,
      evidence.actionPopovers.dashboardTabFavorite,
      evidence.actionPopovers.dashboardTabMove,
      evidence.actionPopovers.dashboardTabOpen,
      evidence.actionPopovers.dashboardTabClose,
      evidence.actionPopovers.openTabs,
      evidence.actionPopovers.customize,
      evidence.actionPopovers.sectionTab,
      evidence.actionPopovers.sectionToggle,
      evidence.actionPopovers.sectionDrag,
      evidence.actionPopovers.tab,
    ];
    if (
      evidence.initialHomeHeight < minimumFullHeight ||
      evidence.reactivatedSurfaceHeight < minimumFullHeight ||
      evidence.rendererReportedHeight < minimumFullHeight ||
      !evidence.browserToolbarHidden ||
      !evidence.nativeViewHidden ||
      evidence.screenshotBytes < 100 ||
      !evidence.newTabLaunchpad.heading.includes("What will we explore today?") ||
      evidence.newTabLaunchpad.shortcutCount !== 5 ||
      !evidence.newTabLaunchpad.continuePanel ||
      evidence.newTabLaunchpad.quickAccessCount !== 6 ||
      evidence.newTabLaunchpad.latticeBarCount !== 1 ||
      !evidence.newTabLaunchpad.quickCaptureAbsent ||
      !evidence.newTabLaunchpad.searchPlaceholder.includes("Search this desk") ||
      !evidence.intentChecks.googleSearch ||
      !evidence.intentChecks.youtubeSearch ||
      !evidence.intentChecks.saveAsNote ||
      !evidence.intentChecks.oneControlInNoteMode ||
      evidence.restoreStormRecovery.restoredDuplicateCount !== 1 ||
      !evidence.restoreStormRecovery.failedTabRemovedFromSession ||
      !evidence.reactivatedLaunchpadVisible ||
      !evidence.actionPopovers.compactNavigation.includes("smaller icon menu") ||
      !evidence.actionPopovers.searchEverything.includes("Find a tab") ||
      !evidence.actionPopovers.desktopRow.includes("continue where you left off") ||
      evidence.actionPopovers.navigationDashboard !== "Open Dashboard." ||
      evidence.actionPopovers.navigationBrowse !== "Browse the web or type a website address." ||
      evidence.actionPopovers.navigationCanvas !== "Open your visual notes and connected pages." ||
      evidence.actionPopovers.navigationApps !==
        "Open Daily Flow, Pomodoro, Wealth Lab, and your other tools." ||
      evidence.actionPopovers.navigationSettings !== "Change how Coach Browser looks and works." ||
      evidence.actionPopovers.navigationSavedLinks !== "See webpages you have saved." ||
      evidence.actionPopovers.navigationReadingQueue !== "See webpages you want to read later." ||
      evidence.actionPopovers.desktopDashboard !== "Open Desk 1 Dashboard." ||
      evidence.actionPopovers.desktopDashboard.includes("Desk 10") ||
      evidence.actionPopovers.dashboardTab.description !== "Open New tab." ||
      evidence.actionPopovers.dashboardTab.description.includes("Ready to browse") ||
      evidence.actionPopovers.dashboardTabPin.description !==
        "Keep New tab pinned for quick access." ||
      evidence.actionPopovers.dashboardTabFavorite.description !== "Save New tab to Favorites." ||
      evidence.actionPopovers.dashboardTabMove.description !==
        "Drag New tab to change its position." ||
      evidence.actionPopovers.dashboardTabOpen.description !== "Open New tab." ||
      evidence.actionPopovers.dashboardTabClose.description !== "Close New tab." ||
      evidence.actionPopovers.openTabs.description !== "Show Open tabs on the dashboard." ||
      evidence.actionPopovers.openTabs.placement !== "bottom" ||
      !evidence.actionPopovers.customize.description.includes("Choose what appears") ||
      evidence.actionPopovers.sectionTab.description !== "Show History on the dashboard." ||
      evidence.actionPopovers.sectionTab.description.includes("History0") ||
      !evidence.actionPopovers.sectionToggle.description.includes("History from the dashboard") ||
      !evidence.actionPopovers.sectionDrag.description.includes("Drag History") ||
      !evidence.actionPopovers.tab.description.includes("New tab") ||
      evidence.actionPopovers.tab.placement !== "bottom" ||
      layeredActionPopovers.some(
        (popover) =>
          popover.overflowX !== "visible" ||
          !popover.topLayer ||
          !popover.topmost ||
          popover.zIndex !== "2147483647",
      )
    ) {
      throw new Error(`New Tab reactivation regression: ${JSON.stringify(evidence)}`);
    }
    return evidence;
  } finally {
    runtime.close();
    unregisterIpc();
    if (!window.isDestroyed()) window.destroy();
  }
}

async function waitForRendererBounds(
  runtime: ProfileRuntime,
  window: BrowserWindow,
): Promise<BrowserBounds> {
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
  const diagnostics = (await window.webContents.executeJavaScript(`(() => {
    const viewport = document.querySelector(".native-view-slot");
    const bounds = viewport?.getBoundingClientRect();
    return {
      readyState: document.readyState,
      bodyText: document.body?.textContent?.trim().slice(0, 180) ?? "",
      bridgeVisible: Boolean(window.lattice),
      viewportPresent: Boolean(viewport),
      viewportBounds: bounds
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        : null
    };
  })()`)) as unknown;
  throw new Error(
    `The packaged React renderer did not report stable native-view bounds: ${JSON.stringify({
      runtimeBounds: runtime.getBounds(),
      diagnostics,
    })}`,
  );
}

export async function runPhaseNineSmoke(
  rendererRoot: string,
  preloadPath: string,
): Promise<PhaseNineSmokeEvidence> {
  const smokeStage = (name: string) => console.log(`[smoke] ${name}`);
  const smokeRoot = path.join(os.tmpdir(), "lattice-phase-nine");
  await mkdir(smokeRoot, { recursive: true });

  const window = new BrowserWindow({
    show: false,
    width: 1_000,
    height: 720,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#101017",
      symbolColor: "#e9e9f2",
      height: 43,
    },
    backgroundColor: "#101017",
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
    window.webContents.on("console-message", (details) => {
      if (details.level === "error") console.error(`[renderer] ${details.message}`);
    });
    window.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
          console.error(`[renderer-load] ${errorCode} ${errorDescription} ${validatedURL}`);
        }
      },
    );
    await window.loadURL("lattice://app/index.html");
    const shellUrl = window.webContents.getURL();
    const shellTitle = window.webContents.getTitle();
    let rendererReportedBounds = await waitForRendererBounds(runtime, window);
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
      await window.lattice.localWorkspace.syncDesktops([{ id: "research", name: "Research" }]);
      const localWorkspace = await window.lattice.localWorkspace.captureInbox({
        desktopId: "research",
        title: "Phase 17 Inbox capture",
        content: "Durable local Inbox smoke note.",
        kind: "note"
      });
      await window.lattice.localWorkspace.createEntry({
        desktopId: "research",
        parentPath: "Notes",
        name: "Projects",
        kind: "folder"
      });
      await window.lattice.localWorkspace.createEntry({
        desktopId: "research",
        parentPath: "Notes/Projects",
        name: "Control room",
        kind: "file",
        fileType: "coach"
      });
      const workspaceListing = await window.lattice.localWorkspace.listDirectory({
        desktopId: "research",
        relativePath: "Notes/Projects"
      });
      const workspaceDraft = await window.lattice.localWorkspace.readFile({
        desktopId: "research",
        relativePath: "Notes/Projects/Control room.coach"
      });
      const workspaceSaved = await window.lattice.localWorkspace.saveFile({
        desktopId: "research",
        relativePath: workspaceDraft.relativePath,
        expectedUpdatedAt: workspaceDraft.updatedAt,
        content: JSON.stringify({ version: 1, kind: "planner", lanes: ["Now", "Next"] }, null, 2) + "\\n"
      });
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
        brandLogoVisible: (() => {
          const logo = document.querySelector(".brand-mark img");
          return logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth > 0;
        })(),
        svgFaviconPresent: Boolean(document.querySelector('link[rel="icon"][type="image/svg+xml"]')),
        pngFaviconPresent: Boolean(document.querySelector('link[rel="icon"][type="image/png"]')),
        nativeSlotBounds: readBounds(".native-view-slot"),
        vaultPanelBounds: readBounds(".vault-probe"),
        vault,
        localWorkspace,
        interactiveWorkspace: { listing: workspaceListing, saved: workspaceSaved },
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
    smokeStage("shell and local workspace");
    // Hidden BrowserWindow content bounds can settle once after the first renderer
    // probe. Re-sample the IPC-published native slot after that work so the evidence
    // compares two values from the same stable layout generation.
    await delay(100);
    rendererReportedBounds = await waitForRendererBounds(runtime, window);
    const [windowContentWidth = 1, windowContentHeight = 1] = window.getContentSize();

    const initialNoteBytes = await readFile(shellProbe.note.absolutePath);
    const coachStats = await stat(path.join(shellProbe.vault.displayPath, ".coach"));
    const localDesktop = shellProbe.localWorkspace.desktops.find(
      (desktop) => desktop.desktopId === "research",
    );
    const localDesktopRoot = path.join(
      shellProbe.vault.displayPath,
      "Desktops",
      "Research-research",
    );
    const localAreaStats = await Promise.all(
      ["Inbox", "Notes", "Files", "Planner"].map((area) => stat(path.join(localDesktopRoot, area))),
    );
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
    // Creation starts the real HTTPS navigation without awaiting Chromium's unbounded loadURL
    // promise. Later probes use explicit deadlines and report a useful failure instead of hanging
    // the entire packaged gate when public networking is slow or intercepted.
    await runtime.createTab("https://example.com/");
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
    const privacyReadyDeadline = Date.now() + 10_000;
    while (
      runtime.snapshot().tabs.some((tab) => tab.loading) &&
      Date.now() < privacyReadyDeadline
    ) {
      await delay(25);
    }
    if (runtime.snapshot().tabs.some((tab) => tab.loading)) {
      throw new Error("HTTPS tab did not settle before the bounded privacy probe.");
    }
    smokeStage("session restore");
    const privacyProbe = await runtime.collectPrivacyClearProbe();
    smokeStage("privacy clear");

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

    // Phase 10 adds a calm dashboard and a reversible distraction-free view.
    // Exercise it through the same trusted renderer used by the packaged app, then
    // restore Browse before continuing the long-running Phase 9 regression.
    const navigationDom = (await window.webContents.executeJavaScript(`(async () => {
      const desktopNames = [...document.querySelectorAll('.desktop-item strong')]
        .map((item) => item.textContent?.trim() ?? "");
      const sectionLabels = [...document.querySelectorAll('.workspace-panel .section-label')];
      const desktopsLabel = sectionLabels.find((item) => item.textContent?.includes('Desktops'));
      const navigateLabel = sectionLabels.find((item) => item.textContent?.includes('Navigate'));
      const desktopsBeforeNavigate = Boolean(
        desktopsLabel && navigateLabel &&
        (desktopsLabel.compareDocumentPosition(navigateLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
      const renameDeskOne = document.querySelector('button[aria-label="Rename Desk 1"]');
      if (!(renameDeskOne instanceof HTMLButtonElement)) throw new Error("Inline desktop rename missing");
      renameDeskOne.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const firstRenameInput = document.querySelector('input[aria-label="Rename Desk 1"]');
      if (!(firstRenameInput instanceof HTMLInputElement)) throw new Error("Desktop rename input missing");
      const nameSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      nameSetter?.call(firstRenameInput, "Focus Desk");
      firstRenameInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      firstRenameInput.form?.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const renamed = [...document.querySelectorAll('.desktop-item strong')]
        .some((item) => item.textContent?.trim() === "Focus Desk");
      const restoreName = document.querySelector('button[aria-label="Rename Focus Desk"]');
      if (!(restoreName instanceof HTMLButtonElement)) throw new Error("Renamed desktop action missing");
      restoreName.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const restoreInput = document.querySelector('input[aria-label="Rename Focus Desk"]');
      if (!(restoreInput instanceof HTMLInputElement)) throw new Error("Restore desktop name input missing");
      nameSetter?.call(restoreInput, "Desk 1");
      restoreInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      restoreInput.form?.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const restored = [...document.querySelectorAll('.desktop-item strong')]
        .some((item) => item.textContent?.trim() === "Desk 1");
      const dashboard = document.querySelector('button[aria-label="Dashboard"]');
      if (!(dashboard instanceof HTMLButtonElement)) throw new Error("Dashboard destination missing");
      dashboard.click();
      await new Promise((resolve) => setTimeout(resolve, 75));
      if (!document.querySelector('.dashboard-surface-v2')) throw new Error("Dashboard surface missing");
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "f",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true
      }));
      await new Promise((resolve) => setTimeout(resolve, 75));
      const focusBarColor = getComputedStyle(document.querySelector('.focus-session-bar')).backgroundColor;
      const focusBarCanvas = document.createElement('canvas');
      focusBarCanvas.width = 1;
      focusBarCanvas.height = 1;
      const focusBarContext = focusBarCanvas.getContext('2d', { willReadFrequently: true });
      let focusBarThemed = false;
      if (focusBarContext) {
        focusBarContext.fillStyle = focusBarColor;
        focusBarContext.fillRect(0, 0, 1, 1);
        const [red, green, blue] = focusBarContext.getImageData(0, 0, 1, 1).data;
        focusBarThemed = red > 200 && green > 200 && blue > 200;
      }
      return {
        heading: document.querySelector('.dashboard-toolbar-message h1')?.textContent?.trim() ?? "",
        dashboardCards: [...document.querySelectorAll('.dashboard-section-tabs button')]
          .map((button) => button.querySelector('span')?.textContent?.trim() ?? ""),
        desktopNames,
        desktopsBeforeNavigate,
        inlineRenameRoundTrip: renamed && restored,
        todayTaskCount: document.querySelectorAll('.home-task-row').length,
        readingPreviewCount: document.querySelectorAll('.dashboard-saved-link').length,
        privacyPromise: document.querySelector('.dashboard-surface-v2') ? "Dashboard ready" : "",
        filesDestinationVisible: [...document.querySelectorAll('.navigation-row strong')]
          .some((item) => item.textContent?.trim() === "Files & Inbox"),
        activeDesktopIndicated: Boolean(
          document.querySelector('.desktop-item.active .desktop-open-surface[aria-current="page"]')
        ),
        focusBarThemed,
        intention: document.querySelector('.focus-session-copy strong')?.textContent?.trim() ?? "",
        focusMode: document.querySelector('.lattice-shell')?.classList.contains('focus-mode') ?? false,
        chromeHidden: getComputedStyle(document.querySelector('.activity-rail')).display === 'none' &&
          getComputedStyle(document.querySelector('.workspace-panel')).display === 'none' &&
          getComputedStyle(document.querySelector('.tab-strip')).display === 'none'
      };
    })()`)) as {
      heading: string;
      dashboardCards: string[];
      desktopNames: string[];
      desktopsBeforeNavigate: boolean;
      inlineRenameRoundTrip: boolean;
      todayTaskCount: number;
      readingPreviewCount: number;
      privacyPromise: string;
      filesDestinationVisible: boolean;
      activeDesktopIndicated: boolean;
      focusBarThemed: boolean;
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
      for (const key of ["3", "4", "5", "6", "7", "8", "1", "2"]) {
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

    // The New Tab is a single intelligent launchpad: local and web search, shortcuts,
    // live continuation, and durable note capture into Daily Flow's Inbox.
    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "t", ctrlKey: true, bubbles: true }))`,
    );
    const newTabVisibilityDeadline = Date.now() + 2_000;
    while (Date.now() < newTabVisibilityDeadline && runtime.isVisible()) await delay(25);
    const newTabNativeViewHidden = !runtime.isVisible();
    const newTabReactivationPreservedLayout =
      (await window.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 2000;
      while (!document.querySelector('.new-tab-surface') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const activeTab = document.querySelector('.browser-tab.active');
      const returnButton = activeTab?.querySelector('.tab-select');
      const otherTab = [...document.querySelectorAll('.browser-tab')]
        .find((candidate) => candidate !== activeTab);
      const otherButton = otherTab?.querySelector('.tab-select');
      if (!(activeTab instanceof HTMLElement) ||
          !(returnButton instanceof HTMLButtonElement) ||
          !(otherButton instanceof HTMLButtonElement)) {
        throw new Error("New Tab reactivation needs another browser tab");
      }
      otherButton.click();
      const switchedAwayDeadline = Date.now() + 2000;
      while (activeTab.classList.contains('active') && Date.now() < switchedAwayDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      returnButton.click();
      const switchedBackDeadline = Date.now() + 2000;
      while ((!activeTab.classList.contains('active') || !document.querySelector('.new-tab-surface')) &&
        Date.now() < switchedBackDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      // This shell window is intentionally hidden during the smoke. Chromium may suspend
      // requestAnimationFrame indefinitely for hidden pages, so use a bounded layout turn.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const surface = document.querySelector('.new-tab-surface');
      const bounds = surface?.getBoundingClientRect();
      return Boolean(
        !document.querySelector('.browser-toolbar') &&
        bounds &&
        bounds.height >= Math.max(300, window.innerHeight * 0.5)
      );
    })()`)) as boolean;
    const reactivationVisibilityDeadline = Date.now() + 2_000;
    while (Date.now() < reactivationVisibilityDeadline && runtime.isVisible()) await delay(25);
    const newTabNativeViewHiddenAfterReactivation = !runtime.isVisible();
    smokeStage("dashboard and shortcuts");
    const newTabDom = (await window.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 2000;
      while (!document.querySelector('.new-tab-surface') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const input = document.querySelector('.new-tab-search input');
      if (!(input instanceof HTMLInputElement)) throw new Error("Lattice Bar input missing");
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      inputSetter?.call(input, "Review the browser inbox architecture");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const saveAsNote = document.querySelector('.lattice-save-note-action');
      if (!(saveAsNote instanceof HTMLButtonElement)) {
        throw new Error("Save as note action unavailable");
      }
      saveAsNote.click();
      const noteModeDeadline = Date.now() + 1000;
      while (!document.querySelector('.new-tab-search.note-mode textarea') &&
        Date.now() < noteModeDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const note = document.querySelector('.new-tab-search.note-mode textarea');
      if (!(note instanceof HTMLTextAreaElement) ||
          note.value !== "Review the browser inbox architecture") {
        throw new Error("Lattice Bar note mode did not preserve the thought");
      }
      const capture = document.querySelector('.lattice-bar-submit');
      if (!(capture instanceof HTMLButtonElement) || capture.disabled) {
        throw new Error("Save note action unavailable");
      }
      capture.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const storageKey = Object.keys(localStorage).find((key) =>
        key.startsWith('lattice.runnable-apps.v1.profile.')
      );
      const stored = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? '{}') : {};
      const items = Array.isArray(stored?.bulletJournal?.items)
        ? stored.bulletJournal.items
        : [];
      const capturedNoteVisibleInInbox = items.some((item) =>
        item?.original?.text === "Review the browser inbox architecture" &&
        item?.original?.kind === "note" &&
        Array.isArray(item?.activity) &&
        item.activity.some((event) => event?.type === "organized" && event?.lane === "inbox")
      );
      return {
        newTabHeading: document.querySelector('.new-tab-heading h1')?.textContent?.trim() ?? "",
        newTabShortcutCount: document.querySelectorAll('.new-tab-shortcut').length,
        newTabContinueItemCount: document.querySelectorAll('.new-tab-continue-list > button').length,
        newTabQuickAccessCount: document.querySelectorAll('.new-tab-quick-access-grid > button').length,
        newTabLatticeBarCount: document.querySelectorAll('.new-tab-search').length,
        newTabQuickCaptureAbsent: !document.querySelector('.quick-note'),
        newTabBrowserToolbarHidden: !document.querySelector('.browser-toolbar'),
        capturedInboxCount: items.length,
        capturedNoteVisibleInInbox
      };
    })()`)) as {
      newTabHeading: string;
      newTabShortcutCount: number;
      newTabContinueItemCount: number;
      newTabQuickAccessCount: number;
      newTabLatticeBarCount: number;
      newTabQuickCaptureAbsent: boolean;
      newTabBrowserToolbarHidden: boolean;
      capturedInboxCount: number;
      capturedNoteVisibleInInbox: boolean;
    };

    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const newTabImage = await window.webContents.capturePage();
    if (newTabImage.isEmpty()) throw new Error("Electron returned an empty New Tab capture.");
    const newTabScreenshot = newTabImage.toPNG();
    const newTabScreenshotPath = path.join(smokeRoot, "phase-16-new-tab.png");
    await writeFile(newTabScreenshotPath, newTabScreenshot);
    window.hide();

    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "w", ctrlKey: true, bubbles: true }))`,
    );
    await delay(100);

    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "7", altKey: true, bubbles: true }))`,
    );
    await delay(100);
    smokeStage("new tab");
    const runnableAppsDom = (await window.webContents.executeJavaScript(`(async () => {
      const setInput = (selector, value) => {
        const input = document.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) throw new Error(selector + " missing");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const clickButton = (label) => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.replace(/\\s+/g, " ").trim() === label,
        );
        if (!(button instanceof HTMLButtonElement)) throw new Error(label + " action missing");
        button.click();
      };
      setInput("[data-pomodoro-task]", "Finish Phase 13 runnable apps");
      setInput("[data-pomodoro-minutes]", "1");
      await new Promise((resolve) => setTimeout(resolve, 75));
      const starter = document.querySelector("[data-pomodoro-starter]");
      if (!(starter instanceof HTMLFormElement)) throw new Error("Pomodoro starter missing");
      starter.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 100));
      clickButton("Pause");
      await new Promise((resolve) => setTimeout(resolve, 50));
      clickButton("Resume");
      await new Promise((resolve) => setTimeout(resolve, 50));
      clickButton("Stop & save");
      await new Promise((resolve) => setTimeout(resolve, 100));
      clickButton("Correct result");
      await new Promise((resolve) => setTimeout(resolve, 50));
      const outcome = document.querySelector("[data-correction-outcome]");
      if (!(outcome instanceof HTMLSelectElement)) throw new Error("Correction outcome missing");
      const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      selectSetter?.call(outcome, "completed");
      outcome.dispatchEvent(new Event("change", { bubbles: true }));
      setInput("[data-correction-minutes]", "60");
      setInput("[data-correction-note]", "Corrected after reviewing the actual finish time");
      await new Promise((resolve) => setTimeout(resolve, 75));
      clickButton("Save correction");
      await new Promise((resolve) => setTimeout(resolve, 125));
      const run = document.querySelector("[data-pomodoro-run]");
      const storageKey = Object.keys(localStorage).find((key) =>
        key.startsWith("lattice.runnable-apps.v1.profile."),
      );
      const stored = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "null") : null;
      const record = stored?.pomodoro?.history?.[0];
      return {
        heading: document.querySelector("[data-runnable-apps] > .app-library h1")?.textContent?.trim() ?? "",
        appName: document.querySelector("#pomodoro-heading")?.textContent?.trim() ?? "",
        originalResult: run?.querySelector(".run-history-copy small")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        correctedResult: run?.querySelector("[data-effective-result]")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        overridden: Boolean(run?.querySelector(".override-badge")),
        originalPreserved: record?.original?.outcome === "stopped" && record?.corrections?.[0]?.outcome === "completed",
        persisted: record?.task === "Finish Phase 13 runnable apps" && record?.corrections?.[0]?.elapsedSeconds === 3600,
        activeRunCleared: stored?.pomodoro?.activeRun === null,
        profileScoped: Boolean(storageKey?.startsWith("lattice.runnable-apps.v1.profile.")),
      };
    })()`)) as {
      heading: string;
      appName: string;
      originalResult: string;
      correctedResult: string;
      overridden: boolean;
      originalPreserved: boolean;
      persisted: boolean;
      activeRunCleared: boolean;
      profileScoped: boolean;
    };
    const nativeViewHiddenForRunnableApps = !runtime.isVisible();
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const runnableAppsImage = await window.webContents.capturePage();
    if (runnableAppsImage.isEmpty())
      throw new Error("Electron returned an empty runnable-app capture.");
    let runnableAppsScreenshot = runnableAppsImage.toPNG();
    const runnableAppsScreenshotPath = path.join(smokeRoot, "phase-13-runnable-apps.png");
    await writeFile(runnableAppsScreenshotPath, runnableAppsScreenshot);
    let adaptiveLightSurface = false;
    window.hide();

    smokeStage("runnable apps");
    const dailyFlowBeforeFocus = (await window.webContents.executeJavaScript(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const setControlValue = (selector, value) => {
        const control = document.querySelector(selector);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
          throw new Error(selector + " missing");
        }
        const prototype = control instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        setter?.call(control, value);
        control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", {
          bubbles: true,
        }));
      };
      const clickExact = (label, root = document) => {
        const button = [...root.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.replace(/\\s+/g, " ").trim() === label,
        );
        if (!(button instanceof HTMLButtonElement)) throw new Error(label + " action missing");
        button.click();
      };
      const dailyFlowButton = document.querySelector('[data-runnable-app="daily-flow"]');
      if (!(dailyFlowButton instanceof HTMLButtonElement)) throw new Error("Daily Flow app missing");
      dailyFlowButton.click();
      await wait(75);
      setControlValue("[data-journal-capture]", "Prepare Phase 14 council synthesis");
      const captureForm = document.querySelector("[data-daily-capture]");
      if (!(captureForm instanceof HTMLFormElement)) throw new Error("Daily capture missing");
      captureForm.requestSubmit();
      await wait(100);
      const capturedItem = document.querySelector("[data-journal-item]");
      if (!(capturedItem instanceof HTMLElement)) throw new Error("Captured journal item missing");
      clickExact("Clarify", capturedItem);
      await wait(50);
      setControlValue("[data-clarify-lane]", "today");
      const clarifyForm = capturedItem.querySelector(".clarify-task");
      if (!(clarifyForm instanceof HTMLFormElement)) throw new Error("Clarify form missing");
      clarifyForm.requestSubmit();
      await wait(100);
      const todayItem = document.querySelector("[data-journal-item]");
      if (!(todayItem instanceof HTMLElement)) throw new Error("Today item missing");
      clickExact("Make now", todayItem);
      await wait(100);
      return {
        heading: document.querySelector("#daily-flow-heading")?.textContent?.trim() ?? "",
        catalogCount: document.querySelectorAll("[data-runnable-app]").length,
        nowTask: document.querySelector("[data-now-card] strong")?.textContent?.trim() ?? "",
        todaySummary: document.querySelector(".daily-flow-list > header p")?.textContent?.trim() ?? "",
      };
    })()`)) as {
      heading: string;
      catalogCount: number;
      nowTask: string;
      todaySummary: string;
    };
    const nativeViewHiddenForDailyFlow = !runtime.isVisible();
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const dailyFlowImage = await window.webContents.capturePage();
    if (dailyFlowImage.isEmpty()) throw new Error("Electron returned an empty Daily Flow capture.");
    let dailyFlowScreenshot = dailyFlowImage.toPNG();
    const dailyFlowScreenshotPath = path.join(smokeRoot, "phase-14-daily-flow.png");
    await writeFile(dailyFlowScreenshotPath, dailyFlowScreenshot);
    let dailyFlowAdaptiveLightSurface = false;
    window.hide();

    const dailyFlowAfterFocus = (await window.webContents.executeJavaScript(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const setInput = (selector, value) => {
        const input = document.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) throw new Error(selector + " missing");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const clickExact = (label, root = document) => {
        const button = [...root.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.replace(/\\s+/g, " ").trim() === label,
        );
        if (!(button instanceof HTMLButtonElement)) throw new Error(label + " action missing");
        button.click();
      };
      const focusButton = document.querySelector("[data-focus-journal-task]");
      if (!(focusButton instanceof HTMLButtonElement)) throw new Error("Focus action missing");
      focusButton.click();
      await wait(100);
      clickExact("Stop & save");
      await wait(100);
      const dailyFlowButton = document.querySelector('[data-runnable-app="daily-flow"]');
      if (!(dailyFlowButton instanceof HTMLButtonElement)) throw new Error("Daily Flow app missing");
      dailyFlowButton.click();
      await wait(75);
      const nowCard = document.querySelector("[data-now-card]");
      if (!(nowCard instanceof HTMLElement)) throw new Error("Now card missing");
      clickExact("Complete", nowCard);
      await wait(100);
      const logButton = [...document.querySelectorAll(".daily-flow-tabs button")].find((button) =>
        button.textContent?.trim().startsWith("Log"),
      );
      if (!(logButton instanceof HTMLButtonElement)) throw new Error("Daily log tab missing");
      logButton.click();
      await wait(75);
      const completedItem = document.querySelector("[data-journal-item]");
      if (!(completedItem instanceof HTMLElement)) throw new Error("Completed journal item missing");
      clickExact("Correct", completedItem);
      await wait(50);
      setInput("[data-journal-correction]", "Prepare and ship Phase 14 council synthesis");
      const correctionForm = completedItem.querySelector(".correct-journal-text");
      if (!(correctionForm instanceof HTMLFormElement)) throw new Error("Correction form missing");
      correctionForm.requestSubmit();
      await wait(150);
      const storageKey = Object.keys(localStorage).find((key) =>
        key.startsWith("lattice.runnable-apps.v1.profile."),
      );
      const stored = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "null") : null;
      const record = stored?.bulletJournal?.items?.find(
        (item) => item?.original?.text === "Prepare Phase 14 council synthesis",
      );
      const corrections = record?.activity?.filter((activity) => activity?.type === "text-corrected") ?? [];
      const latestCorrection = corrections.at(-1);
      const linkedRun = stored?.pomodoro?.history?.find(
        (run) => run?.sourceJournalItemId === record?.id,
      );
      return {
        originalText: record?.original?.text ?? "",
        effectiveText: latestCorrection?.text ?? record?.original?.text ?? "",
        activityTypes: record?.activity?.map((activity) => activity?.type).filter(Boolean) ?? [],
        originalPreserved: record?.original?.text === "Prepare Phase 14 council synthesis",
        explicitlyCompleted: record?.activity?.some((activity) => activity?.type === "completed") ?? false,
        linkedPomodoro: Boolean(linkedRun),
        linkedTimerStopped: linkedRun?.original?.outcome === "stopped",
        persisted: stored?.version === 3 && latestCorrection?.text === "Prepare and ship Phase 14 council synthesis",
        profileScoped: Boolean(storageKey?.startsWith("lattice.runnable-apps.v1.profile.")),
        activeRunCleared: stored?.pomodoro?.activeRun === null,
      };
    })()`)) as {
      originalText: string;
      effectiveText: string;
      activityTypes: string[];
      originalPreserved: boolean;
      explicitlyCompleted: boolean;
      linkedPomodoro: boolean;
      linkedTimerStopped: boolean;
      persisted: boolean;
      profileScoped: boolean;
      activeRunCleared: boolean;
    };

    smokeStage("daily flow");
    const wealthLabBeforeFocus = (await window.webContents.executeJavaScript(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const setControlValue = (selector, value, root = document) => {
        const control = root.querySelector(selector);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
          throw new Error(selector + " missing");
        }
        const prototype = control instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : control instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        setter?.call(control, value);
        control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
      };
      const clickExact = (label, root = document) => {
        const button = [...root.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.replace(/\\s+/g, " ").trim() === label,
        );
        if (!(button instanceof HTMLButtonElement)) throw new Error(label + " action missing");
        button.click();
      };
      const submit = (selector) => {
        const form = document.querySelector(selector);
        if (!(form instanceof HTMLFormElement)) throw new Error(selector + " missing");
        form.requestSubmit();
      };
      const wealthButton = document.querySelector('[data-runnable-app="wealth-lab"]');
      if (!(wealthButton instanceof HTMLButtonElement)) throw new Error("Wealth Lab app missing");
      wealthButton.click();
      await wait(100);

      setControlValue("[data-income-target]", "120000");
      setControlValue("[data-investment-target]", "25000");
      submit("[data-wealth-targets]");
      await wait(100);

      const moneyTab = document.querySelector('[data-wealth-view="money"]');
      if (!(moneyTab instanceof HTMLButtonElement)) throw new Error("Money tab missing");
      moneyTab.click();
      await wait(75);
      const addEntry = async (kind, label, amount, category) => {
        const kindButton = document.querySelector('[data-entry-kind="' + kind + '"]');
        if (!(kindButton instanceof HTMLButtonElement)) throw new Error(kind + " kind missing");
        kindButton.click();
        setControlValue("[data-entry-label]", label);
        setControlValue("[data-entry-amount]", amount);
        setControlValue("[data-entry-category]", category);
        await wait(25);
        submit("[data-wealth-entry-form]");
        await wait(100);
      };
      await addEntry("income", "Primary income", "100000", "Salary");
      await addEntry("expense", "Living costs", "40000", "Essentials");
      await addEntry("investment", "Long-term contribution", "20000", "Investment");
      const expense = [...document.querySelectorAll("[data-wealth-entry]")].find((entry) =>
        entry.querySelector(".wealth-entry-copy strong")?.textContent?.trim() === "Living costs",
      );
      if (!(expense instanceof HTMLElement)) throw new Error("Expense entry missing");
      clickExact("Correct", expense);
      await wait(50);
      setControlValue("[data-entry-correction-label]", "Corrected living costs", expense);
      setControlValue("[data-entry-correction-amount]", "35000", expense);
      const correctionForm = expense.querySelector(".wealth-correction-form");
      if (!(correctionForm instanceof HTMLFormElement)) throw new Error("Money correction form missing");
      correctionForm.requestSubmit();
      await wait(100);

      const earnTab = document.querySelector('[data-wealth-view="earn"]');
      if (!(earnTab instanceof HTMLButtonElement)) throw new Error("Earn-more tab missing");
      earnTab.click();
      await wait(75);
      setControlValue("[data-idea-title]", "Productized clinic launch audit");
      setControlValue("[data-idea-hypothesis]", "Independent clinics may pay for a fixed-scope launch review");
      setControlValue("[data-idea-next-step]", "Offer one paid pilot to a clinic owner");
      setControlValue("[data-idea-potential]", "50000");
      submit("[data-earning-idea-form]");
      await wait(100);
      const idea = document.querySelector("[data-earning-idea]");
      if (!(idea instanceof HTMLElement)) throw new Error("Earning idea missing");
      setControlValue("[data-idea-status]", "testing", idea);
      await wait(100);

      const netWorthTab = document.querySelector('[data-wealth-view="net-worth"]');
      if (!(netWorthTab instanceof HTMLButtonElement)) throw new Error("Net-worth tab missing");
      netWorthTab.click();
      await wait(75);
      setControlValue("[data-assets]", "500000");
      setControlValue("[data-liabilities]", "100000");
      setControlValue("[data-snapshot-note]", "Phase 15 baseline");
      submit("[data-net-worth-form]");
      await wait(100);

      const overviewTab = document.querySelector('[data-wealth-view="overview"]');
      if (!(overviewTab instanceof HTMLButtonElement)) throw new Error("Overview tab missing");
      overviewTab.click();
      await wait(100);
      return {
        heading: document.querySelector("#wealth-lab-heading")?.textContent?.trim() ?? "",
        catalogCount: document.querySelectorAll("[data-runnable-app]").length,
        safetyBoundaryVisible: document.querySelector(".wealth-safety-note")?.textContent?.includes("No bank connections") ?? false,
      };
    })()`)) as {
      heading: string;
      catalogCount: number;
      safetyBoundaryVisible: boolean;
    };
    const nativeViewHiddenForWealthLab = !runtime.isVisible();
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const wealthLabImage = await window.webContents.capturePage();
    if (wealthLabImage.isEmpty()) throw new Error("Electron returned an empty Wealth Lab capture.");
    let wealthLabScreenshot = wealthLabImage.toPNG();
    const wealthLabScreenshotPath = path.join(smokeRoot, "phase-15-wealth-lab.png");
    await writeFile(wealthLabScreenshotPath, wealthLabScreenshot);
    let wealthLabAdaptiveLightSurface = false;
    window.hide();

    const wealthLabAfterFocus = (await window.webContents.executeJavaScript(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const clickExact = (label, root = document) => {
        const button = [...root.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.replace(/\\s+/g, " ").trim() === label,
        );
        if (!(button instanceof HTMLButtonElement)) throw new Error(label + " action missing");
        button.click();
      };
      const focusButton = document.querySelector("[data-featured-idea] [data-focus-wealth-idea]");
      if (!(focusButton instanceof HTMLButtonElement)) throw new Error("Wealth focus action missing");
      focusButton.click();
      await wait(100);
      clickExact("Stop & save");
      await wait(125);
      const storageKey = Object.keys(localStorage).find((key) =>
        key.startsWith("lattice.runnable-apps.v1.profile."),
      );
      const stored = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? "null") : null;
      const wealth = stored?.wealthLab;
      const effectiveEntry = (entry) => {
        let amountMinor = entry?.original?.amountMinor ?? 0;
        let active = true;
        for (const activity of entry?.activity ?? []) {
          if (activity?.type === "corrected") amountMinor = activity.amountMinor;
          else if (activity?.type === "voided") active = false;
          else if (activity?.type === "restored") active = true;
        }
        return { amountMinor, active };
      };
      const totals = { income: 0, expense: 0, investment: 0 };
      for (const entry of wealth?.entries ?? []) {
        const effective = effectiveEntry(entry);
        if (effective.active && entry?.original?.kind in totals) {
          totals[entry.original.kind] += effective.amountMinor;
        }
      }
      const expense = wealth?.entries?.find((entry) => entry?.original?.label === "Living costs");
      const expenseCorrection = expense?.activity?.filter((activity) => activity?.type === "corrected").at(-1);
      const idea = wealth?.ideas?.find((candidate) => candidate?.original?.title === "Productized clinic launch audit");
      const ideaStatus = idea?.activity?.filter((activity) => activity?.type === "status-changed").at(-1)?.status ?? "idea";
      const snapshot = wealth?.netWorthSnapshots?.[0];
      const snapshotValue = snapshot?.corrections?.at(-1) ?? snapshot?.original;
      const linkedRun = stored?.pomodoro?.history?.find((run) => run?.sourceWealthIdeaId === idea?.id);
      return {
        incomeTargetMinor: wealth?.monthlyIncomeTargetMinor ?? 0,
        investmentTargetMinor: wealth?.monthlyInvestmentTargetMinor ?? 0,
        incomeMinor: totals.income,
        expenseMinor: totals.expense,
        investmentMinor: totals.investment,
        netCashMinor: totals.income - totals.expense,
        originalExpenseMinor: expense?.original?.amountMinor ?? 0,
        correctedExpenseMinor: expenseCorrection?.amountMinor ?? 0,
        originalExpensePreserved: expense?.original?.amountMinor === 4000000,
        ideaTitle: idea?.original?.title ?? "",
        ideaNextStep: idea?.original?.nextStep ?? "",
        ideaStatus,
        ideaFeatured: wealth?.featuredIdeaId === idea?.id,
        netWorthMinor: (snapshotValue?.assetsMinor ?? 0) - (snapshotValue?.liabilitiesMinor ?? 0),
        linkedPomodoro: Boolean(linkedRun),
        linkedTimerStopped: linkedRun?.original?.outcome === "stopped",
        persisted: stored?.version === 3 && Boolean(wealth),
        profileScoped: Boolean(storageKey?.startsWith("lattice.runnable-apps.v1.profile.")),
        activeRunCleared: stored?.pomodoro?.activeRun === null,
      };
    })()`)) as {
      incomeTargetMinor: number;
      investmentTargetMinor: number;
      incomeMinor: number;
      expenseMinor: number;
      investmentMinor: number;
      netCashMinor: number;
      originalExpenseMinor: number;
      correctedExpenseMinor: number;
      originalExpensePreserved: boolean;
      ideaTitle: string;
      ideaNextStep: string;
      ideaStatus: string;
      ideaFeatured: boolean;
      netWorthMinor: number;
      linkedPomodoro: boolean;
      linkedTimerStopped: boolean;
      persisted: boolean;
      profileScoped: boolean;
      activeRunCleared: boolean;
    };
    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", altKey: true, bubbles: true }))`,
    );
    const browserAfterAppsDeadline = Date.now() + 2_000;
    while (Date.now() < browserAfterAppsDeadline && !runtime.isVisible()) await delay(25);

    // Occupied desktops now offer a recoverable archive decision. Prove that the
    // compact action exposes move/close choices before continuing to exercise the
    // standalone tab-move menu.
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
    let occupiedArchiveOptionsVisible = false;
    const guardDeadline = Date.now() + 2_000;
    while (Date.now() < guardDeadline) {
      occupiedArchiveOptionsVisible = (await window.webContents.executeJavaScript(`(() => {
        const panel = document.querySelector('[data-archive-panel="build"]');
        return Boolean(panel?.textContent?.includes("open tab") &&
          panel.querySelector('[data-archive-move-target="build"]') &&
          panel.querySelector('[data-close-and-archive-desktop="build"]'));
      })()`)) as boolean;
      if (occupiedArchiveOptionsVisible) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const cancel = document.querySelector('button[aria-label="Cancel desktop archive"]');
      if (!(cancel instanceof HTMLButtonElement)) throw new Error("Desktop archive cancel missing");
      cancel.click();
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
       if (!(target instanceof HTMLButtonElement)) throw new Error("Desk 3 move target missing");
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
          .some((item) => item.textContent?.trim() === "Desk 2"),
        researchSummary: [...document.querySelectorAll(".desktop-item")]
          .find((item) => item.querySelector("strong")?.textContent?.trim() === "Desk 1")
          ?.querySelector("small")?.textContent?.trim() ?? ""
      }))()`)) as DesktopLifecycleDomResult;
      if (movedDom.activeDesktop === "Desk 3" && movedDom.activeTabTitle) break;
      await delay(25);
    }
    if (!movedDom) throw new Error("The Phase 8 tab move UI did not become ready.");
    const movedTabRetained = runtime.snapshot().activeTabId === movedTabId;

    await window.webContents.executeJavaScript(`(() => {
      const build = document.querySelector('[data-desktop-id="build"] .desktop-select');
      if (!(build instanceof HTMLButtonElement)) throw new Error("Desk 2 desktop missing");
      build.click();
    })()`);
    const emptyDeadline = Date.now() + 2_000;
    let emptiedSourceDesktop = false;
    while (Date.now() < emptyDeadline) {
      emptiedSourceDesktop = (await window.webContents.executeJavaScript(`(() => {
        const active = document.querySelector(".desktop-item.active");
        return active?.querySelector("strong")?.textContent?.trim() === "Desk 2" &&
          active?.querySelector("small")?.textContent?.trim().startsWith("0 tabs");
      })()`)) as boolean;
      if (emptiedSourceDesktop) break;
      await delay(25);
    }
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
    let archivePopoverVisible = false;
    while (Date.now() < confirmationDeadline) {
      archivePopoverVisible = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-archive-panel="build"]'))`,
      )) as boolean;
      if (archivePopoverVisible) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const archive = document.querySelector('[data-archive-desktop="build"]');
      if (!(archive instanceof HTMLButtonElement)) throw new Error("Desktop archive action missing");
      archive.click();
    })()`);
    const deleteDeadline = Date.now() + 2_000;
    let deletedDom: DesktopLifecycleDomResult | null = null;
    while (Date.now() < deleteDeadline) {
      deletedDom = (await window.webContents.executeJavaScript(`(() => ({
        activeDesktop: document.querySelector(".desktop-item.active strong")?.textContent?.trim() ?? "",
        activeDesktopSummary: document.querySelector(".desktop-item.active small")?.textContent?.trim() ?? "",
        activeTabTitle: document.querySelector(".browser-tab.active .tab-title")?.textContent?.trim() ?? "",
        buildPresent: [...document.querySelectorAll(".desktop-item strong")]
          .some((item) => item.textContent?.trim() === "Desk 2"),
        researchSummary: [...document.querySelectorAll(".desktop-item")]
          .find((item) => item.querySelector("strong")?.textContent?.trim() === "Desk 1")
          ?.querySelector("small")?.textContent?.trim() ?? ""
      }))()`)) as DesktopLifecycleDomResult;
      if (!deletedDom.buildPresent && deletedDom.activeDesktop === "Desk 3") break;
      await delay(25);
    }
    if (!deletedDom) throw new Error("The Phase 8 desktop delete UI did not become ready.");

    await window.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('button[aria-label="Open workspace menu"]');
      if (!(menu instanceof HTMLButtonElement)) throw new Error("Workspace menu missing");
      menu.click();
    })()`);
    const archivedActionDeadline = Date.now() + 2_000;
    let archivedActionVisible = false;
    while (Date.now() < archivedActionDeadline) {
      archivedActionVisible = (await window.webContents.executeJavaScript(`(() =>
        [...document.querySelectorAll(".workspace-menu button")]
          .some((button) => button.textContent?.includes("Archived desktops")))()`)) as boolean;
      if (archivedActionVisible) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const archived = [...document.querySelectorAll(".workspace-menu button")]
        .find((button) => button.textContent?.includes("Archived desktops"));
      if (!(archived instanceof HTMLButtonElement)) throw new Error("Archived desktops action missing");
      archived.click();
    })()`);
    const archivePanelDeadline = Date.now() + 2_000;
    let hardDeleteAvailableOnlyInArchive = false;
    while (Date.now() < archivePanelDeadline) {
      hardDeleteAvailableOnlyInArchive = (await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-archived-desktops] [data-hard-delete-desktop="build"]'))`,
      )) as boolean;
      if (hardDeleteAvailableOnlyInArchive) break;
      await delay(25);
    }
    await window.webContents.executeJavaScript(`(() => {
      const restore = document.querySelector('[data-restore-desktop="build"]');
      if (!(restore instanceof HTMLButtonElement)) throw new Error("Archived desktop restore missing");
      restore.click();
    })()`);
    const archiveRestoreDeadline = Date.now() + 2_000;
    let restoredArchivedDesktop = false;
    while (Date.now() < archiveRestoreDeadline) {
      restoredArchivedDesktop = (await window.webContents.executeJavaScript(`(() =>
        [...document.querySelectorAll(".desktop-item strong")]
          .some((item) => item.textContent?.trim() === "Desk 2"))()`)) as boolean;
      if (restoredArchivedDesktop) break;
      await delay(25);
    }

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
        restoreTabsEnabled: document.querySelector('[role="switch"][aria-label="Restore tabs on launch"]')?.getAttribute("aria-checked") === "true",
        themeOptionCount: document.querySelectorAll("[data-theme-option]").length,
        activeTheme: document.querySelector(".lattice-shell")?.getAttribute("data-theme") ?? ""
      }))()`)) as SettingsDomResult;
      if (settingsDom.heading === "Settings" && settingsDom.privacyText) break;
      await delay(25);
    }
    if (!settingsDom) throw new Error("The Phase 8 settings UI did not become ready.");
    const nativeViewHiddenForSettings = !runtime.isVisible();

    const feltTheme = (await window.webContents.executeJavaScript(`(async () => {
      const darkButton = document.querySelector('[data-theme-option="lattice-dark"]');
      const button = document.querySelector('[data-theme-option="paper-felt"]');
      if (!(darkButton instanceof HTMLButtonElement)) throw new Error("Lattice Dark theme missing");
      if (!(button instanceof HTMLButtonElement)) throw new Error("Felt White theme missing");
      darkButton.click();
      const darkDeadline = Date.now() + 2_000;
      while (
        Date.now() < darkDeadline &&
        document.querySelector(".lattice-shell")?.getAttribute("data-titlebar-theme") !== "lattice-dark"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      button.click();
      const deadline = Date.now() + 2_000;
      while (
        Date.now() < deadline &&
        document.querySelector(".lattice-shell")?.getAttribute("data-titlebar-theme") !== "paper-felt"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const shell = document.querySelector(".lattice-shell");
      const surface = document.querySelector(".trusted-surface");
      const recovery = document.querySelector(".recovery-bar");
      const recoveryAction = recovery?.querySelector("button:not(.recovery-dismiss)");
      const recoveryDismiss = recovery?.querySelector(".recovery-dismiss");
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      let recoveryIsLight = false;
      if (recovery instanceof HTMLElement && context) {
        context.fillStyle = getComputedStyle(recovery).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        recoveryIsLight = red > 220 && green > 220 && blue > 220;
      }
      const identityTileIsThemed = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement) || !context) return false;
        const style = getComputedStyle(element);
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return red > 200 && green > 200 && blue > 200
          && style.backgroundImage.includes("linear-gradient");
      };
      return {
        applied: shell?.getAttribute("data-theme") === "paper-felt",
        textureVisible: surface instanceof HTMLElement && getComputedStyle(surface).backgroundImage.includes("radial-gradient"),
        recoveryThemed: recoveryIsLight
          && recovery instanceof HTMLElement
          && getComputedStyle(recovery).backgroundImage.includes("radial-gradient")
          && recoveryAction instanceof HTMLButtonElement
          && !recoveryAction.disabled
          && getComputedStyle(recoveryAction).backgroundColor !== "rgba(0, 0, 0, 0)"
          && recoveryDismiss instanceof HTMLButtonElement
          && getComputedStyle(recoveryDismiss).backgroundColor === "rgba(0, 0, 0, 0)",
        profileTilesThemed: identityTileIsThemed(".settings-profile-avatar")
          && identityTileIsThemed(".profile-button"),
        nativeTitleBarSynced: shell?.getAttribute("data-titlebar-theme") === "paper-felt"
      };
    })()`)) as {
      applied: boolean;
      textureVisible: boolean;
      recoveryThemed: boolean;
      profileTilesThemed: boolean;
      nativeTitleBarSynced: boolean;
    };

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

    const themeSmoke = (await window.webContents.executeJavaScript(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const waitForTitleBar = async (id) => {
        const deadline = Date.now() + 2_000;
        while (
          Date.now() < deadline &&
          document.querySelector(".lattice-shell")?.getAttribute("data-titlebar-theme") !== id
        ) {
          await wait(25);
        }
      };
      const clickTheme = async (id) => {
        const button = document.querySelector('[data-theme-option="' + id + '"]');
        if (!(button instanceof HTMLButtonElement)) throw new Error(id + " theme missing");
        button.click();
        await waitForTitleBar(id);
      };
      const setInput = (selector, value) => {
        const input = document.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) throw new Error(selector + " missing");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const saveCustom = async () => {
        const save = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.trim() === "Save custom theme",
        );
        if (!(save instanceof HTMLButtonElement)) throw new Error("Save custom theme missing");
        save.click();
        await wait(100);
      };

      await clickTheme("custom");
      setInput('input[aria-label="Custom theme name"]', "Smoke Aubergine");
      setInput('input[aria-label="Background color"]', "#211723");
      setInput('input[aria-label="Cards color"]', "#342338");
      setInput('input[aria-label="Text color"]', "#fff3f8");
      setInput('input[aria-label="Muted text color"]', "#c6aebd");
      setInput('input[aria-label="Accent color"]', "#ef7aaa");
      await wait(75);
      await saveCustom();
      await waitForTitleBar("custom");

      const customApplied = document.querySelector(".lattice-shell")?.getAttribute("data-theme-name") === "Smoke Aubergine";
      const customTitleBarSynced = document.querySelector(".lattice-shell")?.getAttribute("data-titlebar-theme") === "custom";
      const initialStorageKey = Object.keys(localStorage).find((key) => {
        if (!key.startsWith("lattice.settings.v2.profile.")) return false;
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        return stored?.customTheme?.name === "Smoke Aubergine";
      });

      const undo = document.querySelector(".recovery-bar > button:not(.recovery-dismiss)");
      if (!(undo instanceof HTMLButtonElement)) throw new Error("Theme Undo missing");
      undo.click();
      await wait(75);
      const undoRestored = document.querySelector(".lattice-shell")?.getAttribute("data-theme-name") === "Deep Teal";

      setInput('input[aria-label="Custom theme name"]', "Smoke Aubergine");
      setInput('input[aria-label="Accent color"]', "#ef7aaa");
      await wait(50);
      await saveCustom();
      await clickTheme("lattice-dark");
      await wait(50);

      const shell = document.querySelector(".lattice-shell");
      const returnedToDark = shell?.getAttribute("data-theme") === "lattice-dark";
      const darkTitleBarSynced = shell?.getAttribute("data-titlebar-theme") === "lattice-dark";
      await clickTheme("paper-felt");
      const finalFeltSynced = shell?.getAttribute("data-theme") === "paper-felt"
        && shell?.getAttribute("data-titlebar-theme") === "paper-felt";
      const dismiss = document.querySelector('button[aria-label="Dismiss recovery action"]');
      if (dismiss instanceof HTMLButtonElement) dismiss.click();
      await wait(25);

      const finalStorageKey = Object.keys(localStorage).find((key) => {
        if (!key.startsWith("lattice.settings.v2.profile.")) return false;
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        return stored?.customTheme?.name === "Smoke Aubergine";
      });
      return {
        customName: "Smoke Aubergine",
        customApplied,
        customPersisted: Boolean(initialStorageKey && finalStorageKey),
        customProfileScoped: Boolean(finalStorageKey?.startsWith("lattice.settings.v2.profile.")),
        undoRestored,
        returnedToDark,
        nativeTitleBarSynced: customTitleBarSynced && darkTitleBarSynced && finalFeltSynced
      };
    })()`)) as {
      customName: string;
      customApplied: boolean;
      customPersisted: boolean;
      customProfileScoped: boolean;
      undoRestored: boolean;
      returnedToDark: boolean;
      nativeTitleBarSynced: boolean;
    };

    await window.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "7", altKey: true, bubbles: true }))`,
    );
    await delay(100);
    adaptiveLightSurface = (await window.webContents.executeJavaScript(`(() => {
      const hasLightBackground = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return false;
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return red > 200 && green > 200 && blue > 200;
      };
      return document.querySelector(".lattice-shell")?.getAttribute("data-theme") === "paper-felt"
        && hasLightBackground(".app-library")
        && hasLightBackground("[data-pomodoro-starter]")
        && hasLightBackground(".pomodoro-history");
    })()`)) as boolean;
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const feltRunnableAppsImage = await window.webContents.capturePage();
    if (feltRunnableAppsImage.isEmpty()) {
      throw new Error("Electron returned an empty Felt White runnable-app capture.");
    }
    runnableAppsScreenshot = feltRunnableAppsImage.toPNG();
    await writeFile(runnableAppsScreenshotPath, runnableAppsScreenshot);
    window.hide();

    dailyFlowAdaptiveLightSurface = (await window.webContents.executeJavaScript(`(async () => {
      const button = [...document.querySelectorAll("[data-runnable-app]")].find((candidate) =>
        candidate.textContent?.includes("Daily Flow"),
      );
      if (!(button instanceof HTMLButtonElement)) throw new Error("Daily Flow app missing");
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const hasLightBackground = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return false;
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return red > 200 && green > 200 && blue > 200;
      };
      return document.querySelector(".lattice-shell")?.getAttribute("data-theme") === "paper-felt"
        && hasLightBackground(".app-library")
        && hasLightBackground(".daily-capture")
        && hasLightBackground(".now-card")
        && hasLightBackground(".daily-flow-list");
    })()`)) as boolean;
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const feltDailyFlowImage = await window.webContents.capturePage();
    if (feltDailyFlowImage.isEmpty()) {
      throw new Error("Electron returned an empty Felt White Daily Flow capture.");
    }
    dailyFlowScreenshot = feltDailyFlowImage.toPNG();
    await writeFile(dailyFlowScreenshotPath, dailyFlowScreenshot);
    window.hide();

    wealthLabAdaptiveLightSurface = (await window.webContents.executeJavaScript(`(async () => {
      const button = [...document.querySelectorAll("[data-runnable-app]")].find((candidate) =>
        candidate.textContent?.includes("Wealth Lab"),
      );
      if (!(button instanceof HTMLButtonElement)) throw new Error("Wealth Lab app missing");
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const hasLightBackground = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return false;
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return red > 200 && green > 200 && blue > 200;
      };
      return document.querySelector(".lattice-shell")?.getAttribute("data-theme") === "paper-felt"
        && hasLightBackground(".app-library")
        && hasLightBackground(".wealth-metrics")
        && hasLightBackground(".wealth-goals-card")
        && hasLightBackground(".wealth-next-move");
    })()`)) as boolean;
    window.setSkipTaskbar(true);
    window.showInactive();
    await delay(100);
    const feltWealthLabImage = await window.webContents.capturePage();
    if (feltWealthLabImage.isEmpty()) {
      throw new Error("Electron returned an empty Felt White Wealth Lab capture.");
    }
    wealthLabScreenshot = feltWealthLabImage.toPNG();
    await writeFile(wealthLabScreenshotPath, wealthLabScreenshot);
    window.hide();

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
    smokeStage("wealth, lifecycle, and canvas");
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
    const profileCreateActionDom = (await window.webContents.executeJavaScript(`(async () => {
      const input = document.querySelector("#profile-name");
      if (!(input instanceof HTMLInputElement)) throw new Error("Profile name field missing");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Work");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 75));
      const submit = input.closest("form")?.querySelector('button[type="submit"]');
      if (!(submit instanceof HTMLButtonElement)) throw new Error("Create profile action missing");
      const style = getComputedStyle(submit);
      return {
        enabled: !submit.disabled,
        solid: style.opacity === "1" && style.backgroundColor !== "rgba(0, 0, 0, 0)"
      };
    })()`)) as { enabled: boolean; solid: boolean };
    await window.webContents.executeJavaScript(`(() => {
      const form = document.querySelector("#profile-name")?.closest("form");
      if (!(form instanceof HTMLFormElement)) throw new Error("Profile editor missing");
      form.requestSubmit();
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
    smokeStage("references, privacy, and themes");
    const profilesDom = (await window.webContents.executeJavaScript(`(() => {
      const actions = [...document.querySelectorAll(".profile-actions button, .profile-picture-actions > button")];
      const identityTiles = [...document.querySelectorAll(".profile-avatar")];
      const identityTilesThemed = identityTiles.length === 3 && identityTiles.every((tile) => {
        if (!(tile instanceof HTMLElement)) return false;
        const style = getComputedStyle(tile);
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
        return red > 200 && green > 200 && blue > 200
          && style.backgroundImage.includes("linear-gradient");
      });
      return {
        profileCount: document.querySelectorAll(".profile-list > button").length,
        activeProfileName: document.querySelector(".profile-menu-header strong")?.textContent ?? "",
        profileMenuVisible: Boolean(document.querySelector(".profile-menu")),
        privacyExplanationVisible: document.querySelector(".profile-privacy-note")?.textContent?.includes("never stores your Google") ?? false,
        loadingLabelAbsent: !document.querySelector(".profile-menu-header")?.textContent?.includes("Loading profiles"),
        identityTilesThemed,
        menuActionsLookEnabled: actions.length === 3 && actions.every((action) => {
          if (!(action instanceof HTMLButtonElement) || action.disabled) return false;
          const style = getComputedStyle(action);
          return style.opacity === "1" && style.backgroundColor !== "rgba(0, 0, 0, 0)";
        })
      };
    })()`)) as {
      profileCount: number;
      activeProfileName: string;
      profileMenuVisible: boolean;
      privacyExplanationVisible: boolean;
      loadingLabelAbsent: boolean;
      identityTilesThemed: boolean;
      menuActionsLookEnabled: boolean;
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
    smokeStage("profiles");
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
    smokeStage("remote isolation");
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
        brandLogoVisible: shellProbe.brandLogoVisible,
        svgFaviconPresent: shellProbe.svgFaviconPresent,
        pngFaviconPresent: shellProbe.pngFaviconPresent,
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
        createActionEnabled: profileCreateActionDom.enabled && profileCreateActionDom.solid,
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
        ...newTabDom,
        newTabNativeViewHidden,
        newTabNativeViewHiddenAfterReactivation,
        newTabReactivationPreservedLayout,
        newTabScreenshotPath,
        newTabScreenshotBytes: newTabScreenshot.byteLength,
        screenshotPath: focusNavigationScreenshotPath,
        screenshotBytes: focusNavigationScreenshot.byteLength,
      },
      runnableApps: {
        ...runnableAppsDom,
        adaptiveLightSurface,
        nativeViewHidden: nativeViewHiddenForRunnableApps,
        screenshotPath: runnableAppsScreenshotPath,
        screenshotBytes: runnableAppsScreenshot.byteLength,
      },
      dailyFlow: {
        ...dailyFlowBeforeFocus,
        ...dailyFlowAfterFocus,
        adaptiveLightSurface: dailyFlowAdaptiveLightSurface,
        nativeViewHidden: nativeViewHiddenForDailyFlow,
        screenshotPath: dailyFlowScreenshotPath,
        screenshotBytes: dailyFlowScreenshot.byteLength,
      },
      wealthLab: {
        ...wealthLabBeforeFocus,
        ...wealthLabAfterFocus,
        adaptiveLightSurface: wealthLabAdaptiveLightSurface,
        nativeViewHidden: nativeViewHiddenForWealthLab,
        screenshotPath: wealthLabScreenshotPath,
        screenshotBytes: wealthLabScreenshot.byteLength,
      },
      desktopLifecycle: {
        occupiedArchiveOptionsVisible,
        menuVisible: browserMenuVisible,
        nativeViewHiddenWhileMenuOpen,
        movedToDesktop: movedDom.activeDesktop,
        movedTabRetained,
        emptiedSourceDesktop,
        archivePopoverVisible,
        archivedEmptyDesktop: !deletedDom.buildPresent,
        adjacentDesktopActivated: deletedDom.activeDesktop === "Desk 3",
        restoredArchivedDesktop,
        hardDeleteAvailableOnlyInArchive,
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
      themes: {
        optionCount: settingsDom.themeOptionCount,
        defaultTheme: settingsDom.activeTheme,
        feltApplied: feltTheme.applied,
        feltTextureVisible: feltTheme.textureVisible,
        feltRecoveryThemed: feltTheme.recoveryThemed,
        feltProfileTilesThemed: feltTheme.profileTilesThemed,
        ...themeSmoke,
        nativeTitleBarSynced: feltTheme.nativeTitleBarSynced && themeSmoke.nativeTitleBarSynced,
      },
      note: {
        vaultPath: shellProbe.vault.displayPath,
        disposableVault: shellProbe.vault.disposable,
        coachDirectoryPresent: coachStats.isDirectory(),
        desktopFoldersPresent: localAreaStats.every((entry) => entry.isDirectory()),
        inboxCapturePresent:
          localDesktop?.inboxCount === 1 &&
          localDesktop.items.some(
            (item) => item.area === "Inbox" && item.name.includes("Phase 17 Inbox capture"),
          ),
        localPathsHidden: !JSON.stringify(shellProbe.localWorkspace).includes(
          shellProbe.vault.displayPath,
        ),
        nestedWorkspaceRoundTrip:
          shellProbe.interactiveWorkspace.listing.relativePath === "Notes/Projects" &&
          shellProbe.interactiveWorkspace.listing.entries.some(
            (entry) => entry.name === "Control room.coach" && entry.fileType === "coach",
          ) &&
          !JSON.stringify(shellProbe.interactiveWorkspace.listing).includes(
            shellProbe.vault.displayPath,
          ),
        extensibleCoachObjectRoundTrip: (() => {
          const saved = JSON.parse(shellProbe.interactiveWorkspace.saved.content) as {
            version?: number;
            kind?: string;
            lanes?: string[];
          };
          return (
            shellProbe.interactiveWorkspace.saved.relativePath ===
              "Notes/Projects/Control room.coach" &&
            saved.version === 1 &&
            saved.kind === "planner" &&
            saved.lanes?.join(",") === "Now,Next"
          );
        })(),
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
