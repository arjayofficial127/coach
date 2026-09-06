import {
  type CSSProperties,
  type FormEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BrowserLinkAction,
  BrowserPrivacySummary,
  BrowserSnapshot,
  BrowserState,
  CanvasPageSummary,
  LocalWorkspaceSnapshot,
  ProfileState,
  ProfileSummary,
  ProfileSwitchResult,
  SavedLinkRecord,
  ShellAppearance,
  ShellCommand,
  VaultInfo,
  VaultReferenceEntry,
  VaultReferenceIndex,
} from "../shared/contracts";
import {
  providerById,
  resolveSearchIntent,
  SEARCH_PROVIDERS,
  type SearchIntent,
  TRUSTED_SITES,
  type TrustedSite,
} from "../shared/lattice-search";
import { moveTabInOrder, type TabDropPlacement } from "../shared/tab-order";
import {
  clampZoomPercent,
  DEFAULT_ZOOM_PERCENT,
  FINE_ZOOM_STEP,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  nextZoomPercent,
  type ZoomCommand,
  zoomCommandForShortcut,
} from "../shared/zoom";
import { actionHelpText } from "./action-help-text";
import { ActionPopover } from "./action-popover";
import lightCapLogoUrl from "./assets/traced-cap-icon.svg";
import darkCapLogoUrl from "./assets/traced-cap-icon-white.svg";
import { captureJournalInboxNote, journalItemsForLane, localDayKey } from "./bullet-journal-model";
import { CanvasWorkspace } from "./canvas-workspace";
import type { DailyFlowView } from "./daily-flow-surface";
import {
  type DashboardClosedTab,
  type DashboardHistoryItem,
  DashboardSurface,
  setDashboardUrlFavorite,
} from "./dashboard-surface";
import { DesktopIconGraphic } from "./desktop-icon";
import type { DesktopIconSelection } from "./desktop-icon-model";
import { removeDesktopRecords } from "./desktop-lifecycle";
import {
  FOCUS_STORAGE_KEY,
  MAX_FOCUS_INTENTION_LENGTH,
  navigationShortcut,
  normalizeFocusIntention,
  parseFocusPreferences,
  type Surface,
  shouldShowNativeBrowser,
  surfaceDetails,
} from "./focus-model";
import { Icon, type IconName } from "./icon";
import {
  type LatticeSearchDocument,
  type LearnedSite,
  learnSitesFromHistory,
  parseStoredHistory,
  rankLatticeDocuments,
  serializeStoredHistory,
} from "./lattice-search-model";
import {
  DEFAULT_NAVIGATION_WIDTH,
  MAX_NAVIGATION_WIDTH,
  MIN_NAVIGATION_WIDTH,
  NAVIGATION_WIDTH_STORAGE_KEY,
  navigationResizeResult,
  normalizeNavigationWidth,
} from "./navigation-width";
import {
  canPersistProfileShell,
  profileStorageKey,
  readProfileStorage,
} from "./profile-shell-model";
import {
  DEFAULT_RUNNABLE_APPS_STATE,
  parseRunnableAppsState,
  RUNNABLE_APPS_STORAGE_KEY,
  type RunnableAppId,
  type RunnableAppsState,
} from "./runnable-apps-model";
import { RunnableAppsSurface } from "./runnable-apps-surface";
import {
  buildRestorableSession,
  parseRestorableSession,
  type RestorableTab,
  reconcileRestoredSession,
} from "./session-model";
import {
  type CustomThemePreferences,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_SETTINGS,
  MAX_CUSTOM_THEME_NAME_LENGTH,
  normalizeCustomTheme,
  parseSettingsPreferences,
  type SettingsPreferences,
  THEME_CATALOG,
  type ThemeId,
} from "./settings-model";
import {
  readSiteIcons,
  SITE_ICONS_UPDATED_EVENT,
  saveSiteIcons,
  siteIconDomainKey,
} from "./site-icon-cache";
import {
  archiveDesktop,
  createDesktop,
  DEFAULT_WORKSPACE,
  moveTabToDesktop,
  parseWorkspacePreferences,
  permanentlyDeleteArchivedDesktop,
  renameDesktop,
  restoreArchivedDesktop,
  setDesktopIcon,
  type WorkspacePreferences,
} from "./workspace-model";
import { WorkspaceStudio as LocalFilesSurface } from "./workspace-studio";

const WORKSPACE_STORAGE_KEY = "lattice.workspace.v1";
const SESSION_STORAGE_KEY = "lattice.session.v1";
const SETTINGS_STORAGE_KEY = "lattice.settings.v2";
const LEGACY_SETTINGS_STORAGE_KEY = "lattice.settings.v1";
const ZOOM_STORAGE_KEY = "lattice.shell-zoom.v1";
const NAVIGATION_STORAGE_KEY = "lattice.navigation-mode.v1";
const BROWSER_HISTORY_STORAGE_KEY = "lattice.browser-history.v1";
const emptySnapshot: BrowserSnapshot = { activeTabId: "", tabs: [] };
const emptyReferenceIndex: VaultReferenceIndex = {
  generatedAt: "",
  entries: [],
  unresolvedCount: 0,
};
const emptyLocalWorkspace: LocalWorkspaceSnapshot = {
  connected: false,
  rootName: "",
  desktops: [],
};

type CommandItem =
  | { kind: "web"; id: string; label: string; detail: string; query: string }
  | { kind: "tab"; id: string; label: string; detail: string; tab: BrowserState }
  | { kind: "link"; id: string; label: string; detail: string; link: SavedLinkRecord }
  | { kind: "desktop"; id: string; label: string; detail: string; desktopId: string }
  | {
      kind: "action";
      id: string;
      label: string;
      detail: string;
      action: "new-tab" | "library" | "queue" | "apps";
    };

interface RestoredBrowserState {
  snapshot: BrowserSnapshot;
  assignments: Record<string, string>;
  restoredCount: number;
  restoredActive: RestorableTab | null;
}

interface ProfileShellState {
  workspace: WorkspacePreferences;
  settings: SettingsPreferences;
  focusIntention: string;
  runnableApps: RunnableAppsState;
}

interface InitialProfileBootstrap {
  profiles: ProfileState;
  shell: ProfileShellState;
  restored: RestoredBrowserState;
  restoreError: string | null;
}

interface RecoveryNotice {
  id: string;
  message: string;
  actionLabel: string;
}

interface PendingRecovery extends RecoveryNotice {
  run: () => void | Promise<void>;
}

type NewTabSuggestion =
  | {
      kind: "app";
      id: string;
      label: string;
      detail: string;
      appId: RunnableAppId;
    }
  | { kind: "tab"; id: string; label: string; detail: string; tab: BrowserState }
  | {
      kind: "history";
      id: string;
      label: string;
      detail: string;
      history: DashboardHistoryItem;
    }
  | { kind: "link"; id: string; label: string; detail: string; link: SavedLinkRecord }
  | { kind: "canvas"; id: string; label: string; detail: string; pageId: string }
  | {
      kind: "file";
      id: string;
      label: string;
      detail: string;
      entry: VaultReferenceEntry;
      pageId: string;
      nodeId: string;
      linkId?: string;
    };

interface QuickAccessMatch {
  id: string;
  label: string;
  detail: string;
  icon: IconName;
  accent: "daily-flow" | "pomodoro" | "wealth-lab" | "link" | "canvas" | "queue";
  keywords: string;
  target: "daily-flow" | "pomodoro" | "wealth-lab" | "library" | "pages" | "queue";
}

type WebsiteMatch =
  | { kind: "trusted"; id: string; label: string; detail: string; site: TrustedSite }
  | { kind: "learned"; id: string; label: string; detail: string; site: LearnedSite };

const NEW_TAB_SHORTCUTS = [
  { id: "google", label: "Google", mark: "G", url: "https://www.google.com/" },
  { id: "youtube", label: "YouTube", mark: "▶", url: "https://www.youtube.com/" },
  { id: "gmail", label: "Gmail", mark: "M", url: "https://mail.google.com/" },
  { id: "drive", label: "Drive", mark: "▲", url: "https://drive.google.com/" },
] as const;

const railItems: Array<{
  id: Surface;
  label: string;
  icon: IconName;
  description: string;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    description: actionHelpText.dashboardOverview,
  },
  {
    id: "browser",
    label: "Browse",
    icon: "compass",
    description: actionHelpText.browse,
  },
  {
    id: "files",
    label: "Files & Inbox",
    icon: "folder",
    description: actionHelpText.localFiles,
  },
  {
    id: "apps",
    label: "Runnable apps",
    icon: "apps",
    description: actionHelpText.runnableApps,
  },
  {
    id: "library",
    label: "Libraries",
    icon: "library",
    description: "Open saved links, reading queues, and pages",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    description: actionHelpText.settings,
  },
];

const customThemeColorFields: Array<{
  key: Exclude<keyof CustomThemePreferences, "name">;
  label: string;
}> = [
  { key: "background", label: "Background" },
  { key: "surface", label: "Cards" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "accent", label: "Accent" },
];

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "New tab";
  }
}

function urlReferenceKey(input: string): string {
  const url = new URL(input);
  url.hash = "";
  return `url:${url.toString()}`;
}

function displayTitle(tab: BrowserState): string {
  if (tab.title && tab.title !== tab.url) return tab.title;
  return tab.url === "about:blank" ? "New tab" : displayHost(tab.url);
}

function relativeDate(input: string): string {
  const elapsed = Date.now() - Date.parse(input);
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function profileInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "P"
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function loadProfileShellState(state: ProfileState, profileId: string): ProfileShellState {
  const storedSettings =
    readProfileStorage(localStorage, SETTINGS_STORAGE_KEY, state, profileId) ??
    readProfileStorage(localStorage, LEGACY_SETTINGS_STORAGE_KEY, state, profileId);
  return {
    workspace: parseWorkspacePreferences(
      readProfileStorage(localStorage, WORKSPACE_STORAGE_KEY, state, profileId),
    ),
    settings: parseSettingsPreferences(storedSettings),
    focusIntention: parseFocusPreferences(
      readProfileStorage(localStorage, FOCUS_STORAGE_KEY, state, profileId),
    ).intention,
    runnableApps: parseRunnableAppsState(
      readProfileStorage(localStorage, RUNNABLE_APPS_STORAGE_KEY, state, profileId),
    ),
  };
}

async function restoreProfileBrowser(
  initial: BrowserSnapshot,
  workspace: WorkspacePreferences,
  settings: SettingsPreferences,
  profiles: ProfileState,
  profileId: string,
): Promise<RestoredBrowserState> {
  const saved = settings.restoreTabs
    ? parseRestorableSession(
        readProfileStorage(localStorage, SESSION_STORAGE_KEY, profiles, profileId),
        new Set(workspace.desktops.map((desktop) => desktop.id)),
      )
    : { version: 1 as const, tabs: [] };
  if (saved.tabs.length === 0) {
    return {
      snapshot: initial,
      assignments: { [initial.activeTabId]: workspace.activeDesktopId },
      restoredCount: 0,
      restoredActive: null,
    };
  }

  const pristineRuntime = initial.tabs.length === 1 && initial.tabs[0]?.url === "about:blank";
  if (!pristineRuntime) {
    const reconciled = reconcileRestoredSession(initial, saved, workspace.activeDesktopId);
    return {
      snapshot: initial,
      assignments: reconciled.assignments,
      restoredCount: reconciled.matchedCount,
      restoredActive: reconciled.active,
    };
  }

  const assignments: Record<string, string> = {};
  const restored: Array<{ nativeId: string; saved: RestorableTab }> = [];
  let next = initial;
  for (const savedTab of saved.tabs) {
    const previousIds = new Set(next.tabs.map((tab) => tab.id));
    next = await window.lattice.browser.createTab({
      url: savedTab.url === "about:blank" ? undefined : savedTab.url,
      activate: false,
    });
    const created = next.tabs.find((tab) => !previousIds.has(tab.id));
    if (!created) continue;
    assignments[created.id] = savedTab.desktopId;
    restored.push({ nativeId: created.id, saved: savedTab });
  }
  const target = restored.find((entry) => entry.saved.active) ?? restored[0];
  if (target) next = await window.lattice.browser.switchTab(target.nativeId);
  next = await window.lattice.browser.closeTab(initial.activeTabId);
  return {
    snapshot: next,
    assignments,
    restoredCount: restored.length,
    restoredActive: target?.saved ?? null,
  };
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function canvasFileTarget(entry: VaultReferenceEntry): {
  pageId: string;
  nodeId: string;
  linkId?: string;
} | null {
  if (entry.source.kind !== "page") return null;
  const [, nodeId, ...candidateParts] = entry.id.split(":");
  if (!nodeId || candidateParts.length === 0) return null;
  const candidateId = candidateParts.join(":");
  return {
    pageId: entry.source.id,
    nodeId,
    linkId: candidateId === `${nodeId}:file` ? undefined : candidateId,
  };
}

function colorLuminance(hex: string): number {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return 0.5;
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const [red = 0.5, green = 0.5, blue = 0.5] = linear;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function LatticeApp() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [workspaceSidebarTarget, setWorkspaceSidebarTarget] = useState<HTMLDivElement | null>(null);
  const [workspaceTabsTarget, setWorkspaceTabsTarget] = useState<HTMLDivElement | null>(null);
  const [workspaceSourceViewport, setWorkspaceSourceViewport] = useState<HTMLDivElement | null>(
    null,
  );
  const workspaceHeadingRef = useRef<HTMLDivElement>(null);
  const webStageRef = useRef<HTMLElement>(null);
  const omniboxRef = useRef<HTMLInputElement>(null);
  const latticeBarRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const newDesktopInputRef = useRef<HTMLInputElement>(null);
  const desktopRenameInputRef = useRef<HTMLInputElement>(null);
  const commandHandlerRef = useRef<(command: ShellCommand) => void>(() => undefined);
  const browserLinkActionHandlerRef = useRef<(action: BrowserLinkAction) => void>(() => undefined);
  const zoomHandlerRef = useRef<(command: ZoomCommand) => void>(() => undefined);
  const zoomPercentRef = useRef(DEFAULT_ZOOM_PERCENT);
  const zoomRequestRef = useRef(0);
  const recoveryHandlerRef = useRef<() => void>(() => undefined);
  const pendingRecoveryRef = useRef<PendingRecovery | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const canvasDirtyRef = useRef(false);
  // Ctrl/Cmd+T can arrive from both the embedded browser and the shell
  // keyboard handler. Keep tab creation single-flight so one gesture cannot
  // create a burst of duplicate tabs while the IPC request is in flight.
  const creatingTabRef = useRef(false);
  const initialProfileBootstrapRef = useRef<Promise<InitialProfileBootstrap> | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePreferences>(DEFAULT_WORKSPACE);
  const [settings, setSettings] = useState<SettingsPreferences>(DEFAULT_SETTINGS);
  const [customThemeDraft, setCustomThemeDraft] =
    useState<CustomThemePreferences>(DEFAULT_CUSTOM_THEME);
  const [focusIntention, setFocusIntention] = useState("");
  const [capturingQuickNote, setCapturingQuickNote] = useState(false);
  const [runnableApps, setRunnableApps] = useState<RunnableAppsState>(DEFAULT_RUNNABLE_APPS_STATE);
  const [runnableAppTarget, setRunnableAppTarget] = useState<RunnableAppId>("pomodoro");
  const [dailyFlowTargetView, setDailyFlowTargetView] = useState<DailyFlowView>("today");
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditor, setProfileEditor] = useState<"create" | "edit" | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(() => {
    try {
      return localStorage.getItem(NAVIGATION_STORAGE_KEY) !== "compact";
    } catch {
      return true;
    }
  });
  const [navigationWidth, setNavigationWidth] = useState(() => {
    try {
      const storedWidth = localStorage.getItem(NAVIGATION_WIDTH_STORAGE_KEY);
      return storedWidth === null
        ? DEFAULT_NAVIGATION_WIDTH
        : normalizeNavigationWidth(Number(storedWidth));
    } catch {
      return DEFAULT_NAVIGATION_WIDTH;
    }
  });
  const [filesSidebarActive, setFilesSidebarActive] = useState(true);
  const [dashboardCustomizing, setDashboardCustomizing] = useState(false);
  const [dashboardToolbarContentTarget, setDashboardToolbarContentTarget] =
    useState<HTMLDivElement | null>(null);
  const [requestedCanvasPageId, setRequestedCanvasPageId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>(emptySnapshot);
  const [siteIcons, setSiteIcons] = useState(readSiteIcons);
  const requestedSiteIconDomains = useRef(new Set<string>());
  const siteIconAttempts = useRef(new Map<string, number>());
  const siteIconRetryTimers = useRef(new Set<number>());
  const [siteIconRetryGeneration, setSiteIconRetryGeneration] = useState(0);
  const [tabDesktops, setTabDesktops] = useState<Record<string, string>>({});
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [tabDropTarget, setTabDropTarget] = useState<{
    tabId: string;
    placement: TabDropPlacement;
  } | null>(null);
  const desktopLocationsRef = useRef<
    Record<string, { kind: "dashboard" } | { kind: "tab"; tabId: string }>
  >({});
  const [surface, setSurface] = useState<Surface>("home");
  const researchScope = `${profileState?.activeProfileId}:${workspace.activeDesktopId}:${profileBusy}:${surface}`;
  const researchScopeRef = useRef(researchScope);
  researchScopeRef.current = researchScope;
  const [address, setAddress] = useState("");
  const [homeQuery, setHomeQuery] = useState("");
  const [latticeNoteMode, setLatticeNoteMode] = useState(false);
  const [searchEverywhere, setSearchEverywhere] = useState(false);
  const [showAllLatticeResults, setShowAllLatticeResults] = useState(false);
  const [activeLatticeResultIndex, setActiveLatticeResultIndex] = useState(0);
  const [tabContentMatchIds, setTabContentMatchIds] = useState<Set<string>>(() => new Set());
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [localWorkspace, setLocalWorkspace] = useState<LocalWorkspaceSnapshot>(emptyLocalWorkspace);
  const [localWorkspaceBusy, setLocalWorkspaceBusy] = useState(false);
  const [links, setLinks] = useState<SavedLinkRecord[]>([]);
  const [canvasPages, setCanvasPages] = useState<CanvasPageSummary[]>([]);
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<DashboardClosedTab[]>([]);
  const [browserHistory, setBrowserHistory] = useState<DashboardHistoryItem[]>([]);
  const [dashboardTabPreviews] = useState<Record<string, string>>({});
  const [dashboardTabPreviewStatuses] = useState<Record<string, "loading" | "ready" | "failed">>(
    {},
  );
  const [referenceIndex, setReferenceIndex] = useState<VaultReferenceIndex>(emptyReferenceIndex);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureDescription, setCaptureDescription] = useState("");
  const [queueCapture, setQueueCapture] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [status, setStatus] = useState("Ready");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingDesktop, setAddingDesktop] = useState(false);
  const [desktopOverflowOpen, setDesktopOverflowOpen] = useState(false);
  const [desktopName, setDesktopName] = useState("");
  const [editingDesktopId, setEditingDesktopId] = useState<string | null>(null);
  const [editingDesktopName, setEditingDesktopName] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const [archiveDesktopId, setArchiveDesktopId] = useState<string | null>(null);
  const [archiveMoveTargetId, setArchiveMoveTargetId] = useState("");
  const [archivedDesktopsOpen, setArchivedDesktopsOpen] = useState(false);
  const [confirmHardDeleteDesktopId, setConfirmHardDeleteDesktopId] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [profileShellHydrated, setProfileShellHydrated] = useState(false);
  const [updatingLinkId, setUpdatingLinkId] = useState<string | null>(null);
  const [handoffLinkId, setHandoffLinkId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingLinkTitle, setEditingLinkTitle] = useState("");
  const [editingLinkDescription, setEditingLinkDescription] = useState("");
  const [privacy, setPrivacy] = useState<BrowserPrivacySummary>({
    cookieCount: 0,
    cacheBytes: 0,
  });
  const [confirmClearData, setConfirmClearData] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [confirmClearAvatar, setConfirmClearAvatar] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<RecoveryNotice | null>(null);
  const [nativeAppearanceTheme, setNativeAppearanceTheme] = useState<ThemeId | null>(null);
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT);
  const [zoomFeedbackVisible, setZoomFeedbackVisible] = useState(false);
  const [zoomFineTuneOpen, setZoomFineTuneOpen] = useState(false);

  const customThemeDirty = useMemo(
    () => JSON.stringify(customThemeDraft) !== JSON.stringify(settings.customTheme),
    [customThemeDraft, settings.customTheme],
  );
  const previewCustomTheme =
    settings.activeTheme === "custom" && surface === "settings"
      ? customThemeDraft
      : settings.customTheme;
  const shellThemeStyle = {
    "--custom-background": previewCustomTheme.background,
    "--custom-surface": previewCustomTheme.surface,
    "--custom-text": previewCustomTheme.text,
    "--custom-muted": previewCustomTheme.muted,
    "--custom-accent": previewCustomTheme.accent,
    "--coach-navigation-width": `${navigationWidth}px`,
  } as CSSProperties;
  const titleBarAppearance = useMemo<ShellAppearance>(() => {
    if (settings.activeTheme === "paper-felt") {
      return { backgroundColor: "#e9e9e5", symbolColor: "#2b2d31" };
    }
    if (settings.activeTheme === "custom") {
      return {
        backgroundColor: previewCustomTheme.surface,
        symbolColor: previewCustomTheme.text,
      };
    }
    return { backgroundColor: "#101017", symbolColor: "#e9e9f2" };
  }, [previewCustomTheme.surface, previewCustomTheme.text, settings.activeTheme]);

  const clearRecovery = () => {
    if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
    pendingRecoveryRef.current = null;
    setRecoveryNotice(null);
  };

  const offerRecovery = (
    message: string,
    run: () => void | Promise<void>,
    actionLabel = "Undo",
  ) => {
    if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    const recovery = { id: crypto.randomUUID(), message, actionLabel, run };
    pendingRecoveryRef.current = recovery;
    setRecoveryNotice(recovery);
    recoveryTimerRef.current = window.setTimeout(clearRecovery, 10_000);
  };

  const runRecovery = async () => {
    const recovery = pendingRecoveryRef.current;
    if (!recovery) return;
    clearRecovery();
    try {
      await recovery.run();
      setStatus(
        recovery.actionLabel === "Undo"
          ? `${recovery.message} — undone`
          : `${recovery.actionLabel} completed`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  recoveryHandlerRef.current = () => void runRecovery();

  useEffect(
    () => () => {
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    },
    [],
  );

  const syncZoomState = useCallback((percent: number) => {
    const normalized = clampZoomPercent(percent);
    zoomPercentRef.current = normalized;
    setZoomPercent(normalized);
    return normalized;
  }, []);

  const applyShellZoom = (percent: number) => {
    const normalized = syncZoomState(percent);
    const requestId = ++zoomRequestRef.current;
    setZoomFeedbackVisible(true);
    localStorage.setItem(ZOOM_STORAGE_KEY, String(normalized));
    void window.lattice.shell
      .setZoom(normalized)
      .then((applied) => {
        if (requestId === zoomRequestRef.current) syncZoomState(applied);
      })
      .catch((error) => {
        if (requestId !== zoomRequestRef.current) return;
        setStatus(error instanceof Error ? error.message : String(error));
        void window.lattice.shell
          .getZoom()
          .then(syncZoomState)
          .catch(() => undefined);
      });
  };

  zoomHandlerRef.current = (command) => {
    applyShellZoom(nextZoomPercent(zoomPercentRef.current, command));
  };

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !workspaceHeadingRef.current?.contains(target)) {
        setWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [workspaceMenuOpen]);

  useEffect(() => {
    let active = true;
    const stored = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
    const request =
      Number.isFinite(stored) && stored > 0
        ? window.lattice.shell.setZoom(clampZoomPercent(stored))
        : window.lattice.shell.getZoom();
    void request
      .then((percent) => {
        if (active) syncZoomState(percent);
      })
      .catch((error) => {
        if (active) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [syncZoomState]);

  useEffect(() => {
    if (!zoomFeedbackVisible || zoomFineTuneOpen) return;
    const timer = window.setTimeout(() => {
      if (zoomPercentRef.current === zoomPercent) setZoomFeedbackVisible(false);
    }, 1_800);
    return () => window.clearTimeout(timer);
  }, [zoomFeedbackVisible, zoomFineTuneOpen, zoomPercent]);

  useEffect(() => {
    try {
      localStorage.setItem(NAVIGATION_STORAGE_KEY, navigationExpanded ? "expanded" : "compact");
    } catch {
      // Navigation mode persistence is optional.
    }
  }, [navigationExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(NAVIGATION_WIDTH_STORAGE_KEY, String(navigationWidth));
    } catch {
      // Navigation width persistence is optional.
    }
  }, [navigationWidth]);

  const confirmCanvasLeave = () => {
    if (surface !== "pages" || !canvasDirtyRef.current) return true;
    const confirmed = window.confirm("Discard unsaved Canvas changes and leave this page?");
    if (confirmed) canvasDirtyRef.current = false;
    return confirmed;
  };

  const handleCanvasDirtyChange = useCallback((dirty: boolean) => {
    canvasDirtyRef.current = dirty;
  }, []);

  const activeProfile =
    profileState?.profiles.find((profile) => profile.id === profileState.activeProfileId) ?? null;
  const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null;
  const activeDesktop =
    workspace.desktops.find((desktop) => desktop.id === workspace.activeDesktopId) ??
    DEFAULT_WORKSPACE.desktops[0];
  const activeDesktopFiles =
    localWorkspace.desktops.find((desktop) => desktop.desktopId === workspace.activeDesktopId) ??
    null;
  const workspaceFolderDefinitions = useMemo(
    () =>
      [...workspace.desktops, ...workspace.archivedDesktops].map(({ id, name }) => ({ id, name })),
    [workspace.archivedDesktops, workspace.desktops],
  );
  const desktopTabs = useMemo(
    () => snapshot.tabs.filter((tab) => tabDesktops[tab.id] === workspace.activeDesktopId),
    [snapshot.tabs, tabDesktops, workspace.activeDesktopId],
  );
  const contextualTab =
    activeTab && tabDesktops[activeTab.id] === workspace.activeDesktopId ? activeTab : null;
  const resumableTab = contextualTab && contextualTab.url !== "about:blank" ? contextualTab : null;
  useEffect(() => {
    if (!activeTab || activeTab.url === "about:blank" || activeTab.loading) return;
    const item: DashboardHistoryItem = {
      id: `${activeTab.url}-${Date.now()}`,
      desktopId: workspace.activeDesktopId,
      title: displayTitle(activeTab),
      url: activeTab.url,
      visitedAt: new Date().toISOString(),
      siteIconDataUrl: activeTab.siteIconDataUrl ?? null,
    };
    setBrowserHistory((current) =>
      [item, ...current.filter((entry) => entry.url !== item.url)].slice(0, 300),
    );
  }, [activeTab, workspace.activeDesktopId]);
  useEffect(() => {
    if (surface !== "dashboard") return;
    let frame = 0;
    let resizeObserver: ResizeObserver;
    const updateLivePreviews = () => {
      frame = 0;
      if (
        document.querySelector(
          ".dashboard-customizer, .dashboard-search-settings, .dashboard-tab-menu[open]",
        )
      ) {
        void window.lattice.browser.setLivePreviews([]);
        return;
      }
      const elements = [...document.querySelectorAll<HTMLElement>("[data-live-tab-preview]")];
      elements.forEach((element) => {
        resizeObserver.observe(element);
      });
      document
        .querySelectorAll<HTMLElement>(".dashboard-surface-toolbar, .dashboard-surface-v2")
        .forEach((element) => {
          resizeObserver.observe(element);
        });
      const toolbarBounds = document
        .querySelector<HTMLElement>(".dashboard-surface-toolbar")
        ?.getBoundingClientRect();
      const surfaceBounds = document
        .querySelector<HTMLElement>(".dashboard-surface-v2")
        ?.getBoundingClientRect();
      const previewViewport = {
        left: Math.max(0, surfaceBounds?.left ?? 0),
        top: Math.max(0, surfaceBounds?.top ?? 0, toolbarBounds?.bottom ?? 0),
        right: Math.min(window.innerWidth, surfaceBounds?.right ?? window.innerWidth),
        bottom: Math.min(window.innerHeight, surfaceBounds?.bottom ?? window.innerHeight),
      };
      const previews = elements
        .map((element) => {
          const tabId = element.dataset.liveTabPreview;
          const bounds = element.getBoundingClientRect();
          const left = Math.max(bounds.left, previewViewport.left);
          const top = Math.max(bounds.top, previewViewport.top);
          const right = Math.min(bounds.right, previewViewport.right);
          const bottom = Math.min(bounds.bottom, previewViewport.bottom);
          if (!tabId || right - left < 2 || bottom - top < 2) return null;
          return {
            tabId,
            bounds: {
              x: left,
              y: top,
              width: right - left,
              height: bottom - top,
            },
          };
        })
        .filter((preview): preview is NonNullable<typeof preview> => preview !== null);
      void window.lattice.browser.setLivePreviews(previews);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(updateLivePreviews);
    };
    resizeObserver = new ResizeObserver(schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      attributeFilter: ["open"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (frame) window.cancelAnimationFrame(frame);
      void window.lattice.browser.setLivePreviews([]);
    };
  }, [surface]);
  const filteredLinks = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return links.filter((link) => {
      const inDesktop =
        !activeDesktop ||
        (link.desktopId ? link.desktopId === activeDesktop.id : link.folder === activeDesktop.name);
      const matches =
        !query ||
        `${link.title} ${link.description} ${link.url} ${link.folder}`
          .toLowerCase()
          .includes(query);
      return inDesktop && matches;
    });
  }, [activeDesktop, libraryQuery, links]);
  const queuedLinks = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return links
      .filter(
        (link) =>
          link.readingStatus === "queued" &&
          (!query ||
            `${link.title} ${link.description} ${link.url} ${link.folder}`
              .toLowerCase()
              .includes(query)),
      )
      .sort((left, right) =>
        (right.queuedAt || right.savedAt).localeCompare(left.queuedAt || left.savedAt),
      );
  }, [libraryQuery, links]);
  const visibleLinks = surface === "queue" ? queuedLinks : filteredLinks;
  const queueCount = links.filter((link) => link.readingStatus === "queued").length;
  const dailyFlowInboxCount = journalItemsForLane(runnableApps.bulletJournal, "inbox").length;
  const quickCaptureInboxCount = journalItemsForLane(runnableApps.bulletJournal, "inbox").filter(
    (item) => item.kind === "note",
  ).length;
  const isNewTabSurface = surface === "home";
  const showNewTabSurface =
    isNewTabSurface || (surface === "browser" && contextualTab?.url === "about:blank");
  const showNativeBrowser = shouldShowNativeBrowser(surface, contextualTab?.url);
  const searchShortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl K";
    return /Mac|iPad|iPhone|iPod/i.test(navigator.platform) ? "⌘ K" : "Ctrl K";
  }, []);
  const todayFocusItems = useMemo(
    () => journalItemsForLane(runnableApps.bulletJournal, "today", localDayKey()).slice(0, 3),
    [runnableApps.bulletJournal],
  );
  const queuePreview = queuedLinks.slice(0, 3);
  const greeting = (() => {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const profileName = activeProfile?.name.trim();
    const familiarName = profileName && profileName.toLowerCase() !== "personal" ? profileName : "";
    return `Good ${timeOfDay}${familiarName ? `, ${familiarName}` : ""}`;
  })();
  const recentCanvasPage = useMemo(
    () =>
      [...canvasPages].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      null,
    [canvasPages],
  );
  const learnedSites = useMemo(
    () => learnSitesFromHistory(browserHistory, TRUSTED_SITES),
    [browserHistory],
  );
  const intentResolution = useMemo<{ intent: SearchIntent; error: string | null }>(() => {
    try {
      return {
        intent: resolveSearchIntent(homeQuery, settings.searchProvider),
        error: null,
      };
    } catch (error) {
      return {
        intent: { kind: "empty" },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [homeQuery, settings.searchProvider]);
  const newTabSearchData = useMemo(() => {
    const openUrls = new Set(snapshot.tabs.map((tab) => tab.url));
    const folderDesktopId = (folder: string) =>
      workspace.desktops.find(
        (desktop) => desktop.name.toLowerCase() === folder.trim().toLowerCase(),
      )?.id;
    const suggestions: NewTabSuggestion[] = [];
    const documents: LatticeSearchDocument[] = [];
    const fileDocuments: LatticeSearchDocument[] = [];

    for (const tab of snapshot.tabs) {
      if (tab.url === "about:blank") continue;
      const suggestion: NewTabSuggestion = {
        kind: "tab",
        id: `new-tab-tab-${tab.id}`,
        label: displayTitle(tab),
        detail: `Open tab · ${displayHost(tab.url)}`,
        tab,
      };
      suggestions.push(suggestion);
      documents.push({
        id: suggestion.id,
        kind: "tab",
        label: suggestion.label,
        detail: suggestion.detail,
        keywords: `${tab.url} ${displayHost(tab.url)}${tabContentMatchIds.has(tab.id) ? ` ${homeQuery}` : ""}`,
        desktopId: tabDesktops[tab.id],
        contentMatch: tabContentMatchIds.has(tab.id),
      });
    }

    for (const item of browserHistory) {
      if (openUrls.has(item.url)) continue;
      const suggestion: NewTabSuggestion = {
        kind: "history",
        id: `new-tab-history-${item.id}`,
        label: item.title || displayHost(item.url),
        detail: `History · ${displayHost(item.url)} · ${relativeDate(item.visitedAt)}`,
        history: item,
      };
      suggestions.push(suggestion);
      documents.push({
        id: suggestion.id,
        kind: "history",
        label: suggestion.label,
        detail: suggestion.detail,
        keywords: item.url,
        desktopId: item.desktopId,
        updatedAt: item.visitedAt,
      });
    }

    for (const link of links) {
      const suggestion: NewTabSuggestion = {
        kind: "link",
        id: `new-tab-link-${link.id}`,
        label: link.title,
        detail: `Saved link · ${displayHost(link.url)}`,
        link,
      };
      suggestions.push(suggestion);
      documents.push({
        id: suggestion.id,
        kind: "link",
        label: suggestion.label,
        detail: suggestion.detail,
        keywords: `${link.description} ${link.url} ${link.folder}`,
        desktopId: link.desktopId || folderDesktopId(link.folder),
        updatedAt: link.savedAt,
      });
    }

    for (const page of canvasPages) {
      const suggestion: NewTabSuggestion = {
        kind: "canvas",
        id: `new-tab-canvas-${page.id}`,
        label: page.title,
        detail: `Canvas · ${formatCount(page.nodeCount, "object")}`,
        pageId: page.id,
      };
      suggestions.push(suggestion);
      documents.push({
        id: suggestion.id,
        kind: "canvas",
        label: suggestion.label,
        detail: suggestion.detail,
        keywords: `${page.description} ${page.folder}`,
        desktopId: folderDesktopId(page.folder),
        updatedAt: page.updatedAt,
      });
    }

    for (const entry of referenceIndex.entries) {
      if (entry.status !== "resolved" || !["document", "image", "file"].includes(entry.kind)) {
        continue;
      }
      const target = canvasFileTarget(entry);
      if (!target) continue;
      const page = canvasPages.find((candidate) => candidate.id === target.pageId);
      const suggestion: NewTabSuggestion = {
        kind: "file",
        id: `new-tab-file-${entry.id}`,
        label: entry.targetLabel,
        detail: `File · in ${entry.source.title}`,
        entry,
        ...target,
      };
      suggestions.push(suggestion);
      fileDocuments.push({
        id: suggestion.id,
        kind: "file",
        label: suggestion.label,
        detail: suggestion.detail,
        keywords: `${entry.label} ${entry.source.title} ${entry.targetLabel}`,
        desktopId: page ? folderDesktopId(page.folder) : undefined,
        updatedAt: page?.updatedAt,
      });
    }

    const byId = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
    return { suggestions, documents, fileDocuments, byId };
  }, [
    browserHistory,
    canvasPages,
    homeQuery,
    links,
    referenceIndex.entries,
    snapshot.tabs,
    tabContentMatchIds,
    tabDesktops,
    workspace.desktops,
  ]);
  const rankedLocalResults = useMemo(
    () =>
      rankLatticeDocuments(homeQuery, newTabSearchData.documents, workspace.activeDesktopId, {
        everywhere: searchEverywhere,
        limit: 100,
      }),
    [homeQuery, newTabSearchData.documents, searchEverywhere, workspace.activeDesktopId],
  );
  const visibleLocalResults = useMemo(
    () =>
      rankedLocalResults
        .slice(0, showAllLatticeResults ? 12 : 3)
        .map((item) => newTabSearchData.byId.get(item.id))
        .filter((item): item is NewTabSuggestion => Boolean(item)),
    [newTabSearchData.byId, rankedLocalResults, showAllLatticeResults],
  );
  const rankedFileResults = useMemo(
    () =>
      rankLatticeDocuments(homeQuery, newTabSearchData.fileDocuments, workspace.activeDesktopId, {
        everywhere: searchEverywhere,
        limit: 12,
      })
        .slice(0, showAllLatticeResults ? 12 : 3)
        .map((item) => newTabSearchData.byId.get(item.id))
        .filter(
          (item): item is Extract<NewTabSuggestion, { kind: "file" }> => item?.kind === "file",
        ),
    [
      homeQuery,
      newTabSearchData.byId,
      newTabSearchData.fileDocuments,
      searchEverywhere,
      showAllLatticeResults,
      workspace.activeDesktopId,
    ],
  );
  const newTabContinueSuggestions = useMemo(
    () =>
      newTabSearchData.suggestions
        .filter((suggestion) => {
          if (suggestion.kind === "tab") {
            return tabDesktops[suggestion.tab.id] === workspace.activeDesktopId;
          }
          if (suggestion.kind === "history") {
            return suggestion.history.desktopId === workspace.activeDesktopId;
          }
          if (suggestion.kind === "link") {
            return (
              !suggestion.link.desktopId || suggestion.link.desktopId === workspace.activeDesktopId
            );
          }
          return suggestion.kind !== "file";
        })
        .slice(0, 3),
    [newTabSearchData.suggestions, tabDesktops, workspace.activeDesktopId],
  );
  const websiteMatches = useMemo<WebsiteMatch[]>(() => {
    const query = homeQuery.trim().toLowerCase().replace(/\s+/g, " ");
    if (!query) return [];
    const tokens = query.split(" ");
    const matchesQuery = (text: string) => {
      const searchable = text.toLowerCase();
      return tokens.every((token) => searchable.includes(token));
    };
    const exactSiteId =
      intentResolution.intent.kind === "site" ? intentResolution.intent.site.id : null;
    const trusted = TRUSTED_SITES.filter(
      (candidate) =>
        candidate.id !== exactSiteId &&
        matchesQuery(
          `${candidate.name} ${candidate.domain} ${candidate.description} ${candidate.aliases.join(" ")}`,
        ),
    )
      .slice(0, 3)
      .map<WebsiteMatch>((candidate) => ({
        kind: "trusted",
        id: `trusted-site-${candidate.id}`,
        label: candidate.name,
        detail: `${candidate.description} · ${candidate.domain.replace(/^www\./, "")}`,
        site: candidate,
      }));
    const learned = learnedSites
      .filter((candidate) => matchesQuery(`${candidate.label} ${candidate.domain}`))
      .slice(0, Math.max(0, 3 - trusted.length))
      .map<WebsiteMatch>((candidate) => ({
        kind: "learned",
        id: `learned-site-${candidate.domain}`,
        label: candidate.label,
        detail: candidate.description,
        site: candidate,
      }));
    return [...trusted, ...learned];
  }, [homeQuery, intentResolution.intent, learnedSites]);
  const quickAccessMatches = useMemo<QuickAccessMatch[]>(() => {
    const query = homeQuery.trim().toLowerCase();
    if (!query) return [];
    const items: QuickAccessMatch[] = [
      {
        id: "daily-flow",
        label: "Daily Flow",
        detail: `${formatCount(dailyFlowInboxCount, "item")} in Inbox`,
        icon: "sparkle",
        accent: "daily-flow",
        keywords: "notes note capture inbox tasks journal today plan",
        target: "daily-flow",
      },
      {
        id: "pomodoro",
        label: "Pomodoro",
        detail: runnableApps.pomodoro.activeRun ? "Timer running" : "Start a focused timer",
        icon: "timer",
        accent: "pomodoro",
        keywords: "timer focus work session productivity",
        target: "pomodoro",
      },
      {
        id: "wealth-lab",
        label: "Wealth Lab",
        detail: "Money, earning ideas, and investments",
        icon: "grid",
        accent: "wealth-lab",
        keywords: "money finance earning investment wealth budget",
        target: "wealth-lab",
      },
      {
        id: "saved-links",
        label: "Saved links",
        detail: `${formatCount(links.length, "saved page")}`,
        icon: "bookmark",
        accent: "link",
        keywords: "saved links bookmarks favorites websites pages",
        target: "library",
      },
      {
        id: "canvas-pages",
        label: "Canvas pages",
        detail: `${formatCount(canvasPages.length, "canvas")}`,
        icon: "grid",
        accent: "canvas",
        keywords: "canvas pages visual notes connected ideas board",
        target: "pages",
      },
      {
        id: "reading-queue",
        label: "Reading queue",
        detail: `${formatCount(queueCount, "page")} waiting`,
        icon: "library",
        accent: "queue",
        keywords: "reading queue unread later articles",
        target: "queue",
      },
    ];
    const tokens = query.split(/\s+/).filter(Boolean);
    return items
      .filter((item) =>
        tokens.every((token) =>
          `${item.label} ${item.detail} ${item.keywords}`.toLowerCase().includes(token),
        ),
      )
      .slice(0, 4);
  }, [
    canvasPages.length,
    dailyFlowInboxCount,
    homeQuery,
    links.length,
    queueCount,
    runnableApps.pomodoro.activeRun,
  ]);

  useEffect(() => {
    const query = homeQuery.trim();
    if (!showNewTabSurface || latticeNoteMode || query.length < 2) {
      setTabContentMatchIds(new Set());
      return;
    }
    const tabIds = snapshot.tabs
      .filter(
        (tab) =>
          tab.url !== "about:blank" &&
          (searchEverywhere || tabDesktops[tab.id] === workspace.activeDesktopId),
      )
      .map((tab) => tab.id);
    if (tabIds.length === 0) {
      setTabContentMatchIds(new Set());
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void window.lattice.browser
        .searchTabContents(tabIds, query)
        .then((ids) => {
          if (!cancelled) setTabContentMatchIds(new Set(ids));
        })
        .catch(() => {
          if (!cancelled) setTabContentMatchIds(new Set());
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    homeQuery,
    latticeNoteMode,
    searchEverywhere,
    showNewTabSurface,
    snapshot.tabs,
    tabDesktops,
    workspace.activeDesktopId,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: result expansion and scope reset whenever the typed query changes
  useEffect(() => {
    setShowAllLatticeResults(false);
    setSearchEverywhere(false);
    setActiveLatticeResultIndex(0);
  }, [homeQuery]);

  useEffect(() => {
    if (!latticeNoteMode) return;
    const frame = window.requestAnimationFrame(() => latticeBarRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [latticeNoteMode]);
  const commandItems = useMemo(() => {
    const query = commandQuery.trim();
    const normalizedQuery = query.toLowerCase();
    const desktopName = (desktopId: string) =>
      workspace.desktops.find((desktop) => desktop.id === desktopId)?.name ?? "Workspace";
    const items: CommandItem[] = [
      {
        kind: "action",
        id: "action-new-tab",
        label: "New tab",
        detail: "Browser action",
        action: "new-tab",
      },
      {
        kind: "action",
        id: "action-library",
        label: "Open saved links",
        detail: "Local saved-link library",
        action: "library",
      },
      {
        kind: "action",
        id: "action-queue",
        label: "Open reading queue",
        detail: `${queueCount} unread`,
        action: "queue",
      },
      {
        kind: "action",
        id: "action-apps",
        label: "Open runnable apps",
        detail: runnableApps.pomodoro.activeRun
          ? `Timer running · ${runnableApps.pomodoro.activeRun.task}`
          : dailyFlowInboxCount > 0
            ? `${dailyFlowInboxCount} Daily Flow task${dailyFlowInboxCount === 1 ? "" : "s"} to clarify`
            : "Pomodoro · Daily Flow · Wealth Lab",
        action: "apps",
      },
      ...workspace.desktops.map<CommandItem>((desktop) => ({
        kind: "desktop",
        id: `desktop-${desktop.id}`,
        label: desktop.name,
        detail: "Desktop",
        desktopId: desktop.id,
      })),
      ...snapshot.tabs.map<CommandItem>((tab) => ({
        kind: "tab",
        id: `tab-${tab.id}`,
        label: displayTitle(tab),
        detail: `${desktopName(tabDesktops[tab.id] ?? workspace.activeDesktopId)} · ${displayHost(tab.url)}`,
        tab,
      })),
      ...links.map<CommandItem>((link) => ({
        kind: "link",
        id: `link-${link.id}-${link.relativePath}`,
        label: link.title,
        detail: `${link.folder || "Saved Links"} · ${displayHost(link.url)}`,
        link,
      })),
    ];
    const filtered = normalizedQuery
      ? items.filter((item) =>
          `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery),
        )
      : items;
    if (query) {
      filtered.push({
        kind: "web",
        id: "search-web",
        label: `Search the web for “${query.slice(0, 80)}”`,
        detail: "Open in this desktop",
        query,
      });
    }
    return filtered.slice(0, 12);
  }, [
    commandQuery,
    dailyFlowInboxCount,
    links,
    queueCount,
    runnableApps,
    snapshot.tabs,
    tabDesktops,
    workspace,
  ]);

  useEffect(() => {
    if (!profileState || !canPersistProfileShell(sessionReady, profileShellHydrated)) return;
    localStorage.setItem(
      profileStorageKey(WORKSPACE_STORAGE_KEY, profileState.activeProfileId),
      JSON.stringify(workspace),
    );
  }, [profileShellHydrated, profileState, sessionReady, workspace]);

  useEffect(() => {
    if (!profileState || !canPersistProfileShell(sessionReady, profileShellHydrated)) return;
    const profileId = profileState.activeProfileId;
    localStorage.setItem(
      profileStorageKey(SETTINGS_STORAGE_KEY, profileId),
      JSON.stringify(settings),
    );
    if (!settings.restoreTabs) {
      localStorage.removeItem(profileStorageKey(SESSION_STORAGE_KEY, profileId));
    }
  }, [profileShellHydrated, profileState, sessionReady, settings]);

  useEffect(() => {
    setCustomThemeDraft(settings.customTheme);
  }, [settings.customTheme]);

  useEffect(() => {
    const sync = () => setSiteIcons(readSiteIcons());
    window.addEventListener(SITE_ICONS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(SITE_ICONS_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const retryWhenOnline = () => {
      requestedSiteIconDomains.current.clear();
      siteIconAttempts.current.clear();
      setSiteIconRetryGeneration((current) => current + 1);
    };
    window.addEventListener("online", retryWhenOnline);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      for (const timer of siteIconRetryTimers.current) window.clearTimeout(timer);
      siteIconRetryTimers.current.clear();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the retry generation intentionally re-runs favicon discovery after a delayed or online retry
  useEffect(() => {
    const discovered = Object.fromEntries(
      snapshot.tabs
        .map((tab) => [siteIconDomainKey(tab.url), tab.siteIconDataUrl] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
    );
    const knownIcons = { ...siteIcons, ...discovered };
    if (Object.keys(discovered).some((hostname) => siteIcons[hostname] !== discovered[hostname])) {
      setSiteIcons(saveSiteIcons(knownIcons));
    }

    const missingUrls = [
      ...snapshot.tabs.map((tab) => tab.url),
      ...links.map((link) => link.url),
    ].filter((url) => {
      const hostname = siteIconDomainKey(url);
      if (!hostname || knownIcons[hostname] || requestedSiteIconDomains.current.has(hostname)) {
        return false;
      }
      requestedSiteIconDomains.current.add(hostname);
      return true;
    });
    for (let offset = 0; offset < missingUrls.length; offset += 48) {
      const batch = missingUrls.slice(offset, offset + 48);
      for (const url of batch) {
        const hostname = siteIconDomainKey(url);
        siteIconAttempts.current.set(hostname, (siteIconAttempts.current.get(hostname) ?? 0) + 1);
      }
      const scheduleRetry = (urls: string[]) => {
        const retryable = urls.filter((url) => {
          const hostname = siteIconDomainKey(url);
          return hostname && (siteIconAttempts.current.get(hostname) ?? 0) < 3;
        });
        if (retryable.length === 0) return;
        const attempt = Math.max(
          ...retryable.map((url) => siteIconAttempts.current.get(siteIconDomainKey(url)) ?? 1),
        );
        const timer = window.setTimeout(
          () => {
            siteIconRetryTimers.current.delete(timer);
            for (const url of retryable) {
              requestedSiteIconDomains.current.delete(siteIconDomainKey(url));
            }
            setSiteIconRetryGeneration((current) => current + 1);
          },
          attempt === 1 ? 1_500 : 5_000,
        );
        siteIconRetryTimers.current.add(timer);
      };
      void window.lattice.browser
        .loadSiteIcons(batch)
        .then((loaded) => {
          const loadedHosts = new Set(Object.keys(loaded));
          for (const hostname of loadedHosts) siteIconAttempts.current.delete(hostname);
          if (loadedHosts.size > 0) {
            setSiteIcons((current) => saveSiteIcons({ ...current, ...loaded }));
          }
          scheduleRetry(batch.filter((url) => !loadedHosts.has(siteIconDomainKey(url))));
        })
        .catch(() => {
          scheduleRetry(batch);
        });
    }
  }, [links, siteIconRetryGeneration, siteIcons, snapshot.tabs]);

  useEffect(() => {
    let cancelled = false;
    setNativeAppearanceTheme(null);
    const timeout = window.setTimeout(() => {
      void window.lattice.shell
        .setAppearance(titleBarAppearance)
        .then(() => {
          if (!cancelled) setNativeAppearanceTheme(settings.activeTheme);
        })
        .catch(() => {
          if (!cancelled) setNativeAppearanceTheme(null);
        });
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [settings.activeTheme, titleBarAppearance]);

  useEffect(() => {
    if (!profileState || !canPersistProfileShell(sessionReady, profileShellHydrated)) return;
    localStorage.setItem(
      profileStorageKey(FOCUS_STORAGE_KEY, profileState.activeProfileId),
      JSON.stringify({ version: 1, intention: normalizeFocusIntention(focusIntention) }),
    );
  }, [focusIntention, profileShellHydrated, profileState, sessionReady]);

  useEffect(() => {
    if (!profileState || !canPersistProfileShell(sessionReady, profileShellHydrated)) return;
    localStorage.setItem(
      profileStorageKey(RUNNABLE_APPS_STORAGE_KEY, profileState.activeProfileId),
      JSON.stringify(runnableApps),
    );
  }, [profileShellHydrated, profileState, runnableApps, sessionReady]);

  useEffect(() => {
    if (!profileState || !canPersistProfileShell(sessionReady, profileShellHydrated)) return;
    localStorage.setItem(
      profileStorageKey(BROWSER_HISTORY_STORAGE_KEY, profileState.activeProfileId),
      serializeStoredHistory(browserHistory),
    );
  }, [browserHistory, profileShellHydrated, profileState, sessionReady]);

  useEffect(() => {
    let cancelled = false;
    void window.lattice.vault.current().then(async (selected) => {
      if (cancelled || !selected) return;
      const [savedLinks, savedCanvasPages, references] = await Promise.all([
        window.lattice.vault.listSavedLinks(),
        window.lattice.vault.listCanvasPages(),
        window.lattice.vault.referenceIndex(),
      ]);
      if (cancelled) return;
      setVault(selected);
      setLinks(savedLinks);
      setCanvasPages(savedCanvasPages);
      setReferenceIndex(references);
      setStatus("Local folder restored");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!vault) {
      setLocalWorkspace(emptyLocalWorkspace);
      return;
    }
    let cancelled = false;
    setLocalWorkspaceBusy(true);
    void window.lattice.localWorkspace
      .syncDesktops(workspaceFolderDefinitions)
      .then((next) => {
        if (!cancelled) setLocalWorkspace(next);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLocalWorkspaceBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vault, workspaceFolderDefinitions]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.lattice.browser.onState((state) => {
      setSnapshot((current) => {
        const exists = current.tabs.some((tab) => tab.id === state.id);
        return {
          activeTabId: current.activeTabId || state.id,
          tabs: exists
            ? current.tabs.map((tab) => (tab.id === state.id ? state : tab))
            : [...current.tabs, state],
        };
      });
    });
    const unsubscribeLinkActions = window.lattice.browser.onLinkAction((action) =>
      browserLinkActionHandlerRef.current(action),
    );
    let bootstrap = initialProfileBootstrapRef.current;
    if (!bootstrap) {
      bootstrap = (async () => {
        const profiles = await window.lattice.profiles.state();
        const shell = loadProfileShellState(profiles, profiles.activeProfileId);
        const initial = await window.lattice.browser.snapshot();
        try {
          const restored = await restoreProfileBrowser(
            initial,
            shell.workspace,
            shell.settings,
            profiles,
            profiles.activeProfileId,
          );
          return { profiles, shell, restored, restoreError: null };
        } catch (error) {
          const fallback = await window.lattice.browser.snapshot();
          return {
            profiles,
            shell,
            restored: {
              snapshot: fallback,
              assignments: {
                [fallback.activeTabId]: shell.workspace.activeDesktopId,
              },
              restoredCount: 0,
              restoredActive: null,
            },
            restoreError: error instanceof Error ? error.message : String(error),
          };
        }
      })();
      initialProfileBootstrapRef.current = bootstrap;
    }
    void bootstrap
      .then(({ profiles, shell, restored, restoreError }) => {
        if (cancelled) return;
        setProfileState(profiles);
        setProfileLoadError(null);
        setWorkspace(
          restored.restoredActive
            ? { ...shell.workspace, activeDesktopId: restored.restoredActive.desktopId }
            : shell.workspace,
        );
        setSettings(shell.settings);
        setFocusIntention(shell.focusIntention);
        setRunnableApps(shell.runnableApps);
        setBrowserHistory(
          parseStoredHistory(
            readProfileStorage(
              localStorage,
              BROWSER_HISTORY_STORAGE_KEY,
              profiles,
              profiles.activeProfileId,
            ),
          ),
        );
        setProfileShellHydrated(true);
        setSnapshot(restored.snapshot);
        setTabDesktops(restored.assignments);
        const restoredActive = restored.restoredActive;
        if (restoredActive) {
          setSurface(restoredActive.url === "about:blank" ? "home" : "browser");
        }
        setSessionReady(true);
        if (restoreError) {
          setStatus(`Session restore skipped: ${restoreError}`);
        } else if (restored.restoredCount > 0) {
          setStatus(`Restored ${restored.restoredCount} tabs`);
        }
      })
      .catch(async (error) => {
        if (cancelled) return;
        setProfileLoadError(error instanceof Error ? error.message : "Profiles could not load");
        const fallback = await window.lattice.browser.snapshot();
        setSnapshot(fallback);
        setTabDesktops({ [fallback.activeTabId]: DEFAULT_WORKSPACE.activeDesktopId });
        setSessionReady(true);
        setStatus(
          error instanceof Error
            ? `Session restore skipped: ${error.message}`
            : "Session restore skipped",
        );
      });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeLinkActions();
    };
  }, []);

  useEffect(() => {
    if (
      !profileState ||
      !settings.restoreTabs ||
      !canPersistProfileShell(sessionReady, profileShellHydrated)
    )
      return;
    const timeout = window.setTimeout(() => {
      const session = buildRestorableSession(snapshot, tabDesktops, workspace.activeDesktopId);
      localStorage.setItem(
        profileStorageKey(SESSION_STORAGE_KEY, profileState.activeProfileId),
        JSON.stringify(session),
      );
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [
    profileState,
    profileShellHydrated,
    sessionReady,
    settings.restoreTabs,
    snapshot,
    tabDesktops,
    workspace.activeDesktopId,
  ]);

  useEffect(() => {
    if (!contextualTab || contextualTab.url === "about:blank") {
      setAddress("");
      return;
    }
    setAddress(contextualTab.url);
  }, [contextualTab]);

  useEffect(() => {
    const researchVisible =
      surface === "files" &&
      Boolean(workspaceSourceViewport) &&
      Boolean(contextualTab?.url.startsWith("https://"));
    const viewport = researchVisible ? workspaceSourceViewport : viewportRef.current;
    if (!viewport) return;
    let disposed = false;
    let lastBounds = "";
    let trackingFrame = 0;
    const updateBounds = () => {
      const raw = viewport.getBoundingClientRect();
      const stage = webStageRef.current?.getBoundingClientRect();
      const top = Math.max(raw.top, stage?.top ?? 0, 0);
      const left = Math.max(raw.left, stage?.left ?? 0, 0);
      const bounds = {
        x: left,
        y: top,
        width: Math.max(
          1,
          Math.min(raw.right, stage?.right ?? window.innerWidth, window.innerWidth) - left,
        ),
        height: Math.max(
          1,
          Math.min(raw.bottom, window.innerHeight, stage?.bottom ?? window.innerHeight) - top,
        ),
      };
      // Native views sit above DOM overlays. Reserve space for floating trusted controls.
      if (researchVisible) {
        for (const overlay of document.querySelectorAll<HTMLElement>(
          ".recovery-bar, .zoom-feedback",
        )) {
          const rect = overlay.getBoundingClientRect();
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > bounds.x &&
            rect.left < bounds.x + bounds.width &&
            rect.bottom > bounds.y &&
            rect.top < bounds.y + bounds.height
          )
            bounds.height = Math.max(1, rect.top - bounds.y - 2);
        }
      }
      const signature = JSON.stringify(bounds);
      if (signature === lastBounds) return;
      lastBounds = signature;
      void window.lattice.browser
        .setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
        .then(() => {
          if (!disposed)
            return window.lattice.browser.setVisible(
              (showNativeBrowser || researchVisible) &&
                bounds.width > 2 &&
                bounds.height > 2 &&
                !browserMenuOpen &&
                !commandOpen &&
                !profileMenuOpen &&
                !profileBusy &&
                !workspaceMenuOpen,
            );
        });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(viewport);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, true);
    updateBounds();
    // Position can change without a resize (notices, title edits, embeds). Only send changed bounds.
    if (researchVisible) {
      const trackPosition = () => {
        if (disposed) return;
        updateBounds();
        trackingFrame = requestAnimationFrame(trackPosition);
      };
      trackingFrame = requestAnimationFrame(trackPosition);
    }
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(trackingFrame);
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
      void window.lattice.browser.setVisible(false);
    };
  }, [
    browserMenuOpen,
    commandOpen,
    profileMenuOpen,
    profileBusy,
    showNativeBrowser,
    workspaceSourceViewport,
    surface,
    contextualTab?.url,
    workspaceMenuOpen,
  ]);

  useEffect(() => {
    if (!commandOpen) return;
    commandInputRef.current?.focus();
  }, [commandOpen]);

  useEffect(() => {
    if (!addingDesktop) return;
    newDesktopInputRef.current?.focus();
  }, [addingDesktop]);

  useEffect(() => {
    if (!editingDesktopId) return;
    desktopRenameInputRef.current?.focus();
    desktopRenameInputRef.current?.select();
  }, [editingDesktopId]);

  useEffect(() => {
    if (surface !== "home") return;
    const frame = window.requestAnimationFrame(() => {
      latticeBarRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [surface]);

  useEffect(() => {
    if (surface !== "browser") webStageRef.current?.scrollTo({ top: 0 });
  }, [surface]);

  const setBrowserSnapshot = (next: BrowserSnapshot, desktopId = workspace.activeDesktopId) => {
    setSnapshot(next);
    setTabDesktops((current) => ({
      ...current,
      [next.activeTabId]: current[next.activeTabId] ?? desktopId,
    }));
  };

  const openUrl = async (
    url: string,
    forceNewTab = false,
    desktopId = workspace.activeDesktopId,
  ) => {
    if (!confirmCanvasLeave()) return;
    try {
      const reusable = !forceNewTab && activeTab && tabDesktops[activeTab.id] === desktopId;
      if (reusable) {
        await window.lattice.browser.navigate(url);
      } else {
        setBrowserSnapshot(await window.lattice.browser.createTab(url), desktopId);
      }
      setSurface("browser");
      setCaptureOpen(false);
      setStatus(`Opened ${displayHost(url)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const navigate = async (event: FormEvent) => {
    event.preventDefault();
    if (!address.trim()) return;
    try {
      const intent = resolveSearchIntent(address, settings.searchProvider);
      if (intent.kind !== "empty") await openUrl(intent.url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const navigateFromFocus = async (event: FormEvent) => {
    event.preventDefault();
    if (!homeQuery.trim()) return;
    if (latticeNoteMode) {
      saveLatticeNote();
      return;
    }
    if (intentResolution.error) {
      setStatus(intentResolution.error);
      return;
    }
    if (intentResolution.intent.kind === "empty") return;
    await openUrl(intentResolution.intent.url);
    setHomeQuery("");
  };

  const createTab = async (
    desktopId = workspace.activeDesktopId,
    destination: "home" | "browser" = "home",
  ) => {
    if (creatingTabRef.current) return;
    if (!confirmCanvasLeave()) return;
    creatingTabRef.current = true;
    try {
      const next = await window.lattice.browser.createTab();
      setBrowserSnapshot(next, desktopId);
      desktopLocationsRef.current[desktopId] = { kind: "tab", tabId: next.activeTabId };
      setAddress("");
      setSurface(destination);
      setCaptureOpen(false);
      setStatus("New tab ready");
      if (destination === "browser") focusBrowserLocation();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      creatingTabRef.current = false;
    }
  };

  const switchTab = async (tab: BrowserState) => {
    if (!confirmCanvasLeave()) return;
    try {
      setSnapshot(await window.lattice.browser.switchTab(tab.id));
      desktopLocationsRef.current[tabDesktops[tab.id] ?? workspace.activeDesktopId] = {
        kind: "tab",
        tabId: tab.id,
      };
      setSurface(tab.url === "about:blank" ? "home" : "browser");
      setCaptureOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const clearTabDrag = () => {
    setDraggedTabId(null);
    setTabDropTarget(null);
  };

  const dropTabPlacement = (event: ReactDragEvent<HTMLElement>): TabDropPlacement => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
  };

  const commitTabOrder = async (
    movedTabId: string,
    targetTabId: string,
    placement: TabDropPlacement,
  ) => {
    const currentOrder = desktopTabs.map((tab) => tab.id);
    const nextOrder = moveTabInOrder(currentOrder, movedTabId, targetTabId, placement);
    if (nextOrder.every((tabId, index) => tabId === currentOrder[index])) return;
    try {
      setSnapshot(await window.lattice.browser.reorderTabs(nextOrder));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const dropTab = async (targetTabId: string, placement: TabDropPlacement) => {
    const movedTabId = draggedTabId;
    clearTabDrag();
    if (movedTabId) await commitTabOrder(movedTabId, targetTabId, placement);
  };

  const moveTabByStep = async (tabId: string, direction: -1 | 1) => {
    const order = desktopTabs.map((tab) => tab.id);
    const neighbourId = order[order.indexOf(tabId) + direction];
    if (!order.includes(tabId) || !neighbourId) return;
    await commitTabOrder(tabId, neighbourId, direction < 0 ? "before" : "after");
  };

  const restoreClosedTabs = async (
    closed: Array<{ tab: BrowserState; desktopId: string }>,
    activeClosedId: string,
    placeholderId?: string,
  ) => {
    let next = await window.lattice.browser.snapshot();
    const restoredAssignments: Record<string, string> = {};
    const restoredIds = new Map<string, string>();
    for (const entry of closed) {
      const previousIds = new Set(next.tabs.map((tab) => tab.id));
      next = await window.lattice.browser.createTab({
        url: entry.tab.url === "about:blank" ? undefined : entry.tab.url,
        activate: false,
      });
      const created = next.tabs.find((tab) => !previousIds.has(tab.id));
      if (!created) continue;
      restoredAssignments[created.id] = entry.desktopId;
      restoredIds.set(entry.tab.id, created.id);
    }
    const restoredActiveId = restoredIds.get(activeClosedId) ?? restoredIds.values().next().value;
    if (restoredActiveId) next = await window.lattice.browser.switchTab(restoredActiveId);
    const placeholder = placeholderId
      ? next.tabs.find((candidate) => candidate.id === placeholderId)
      : null;
    if (placeholder?.url === "about:blank" && next.tabs.length > closed.length) {
      next = await window.lattice.browser.closeTab(placeholder.id);
    }
    const activeEntry = closed.find((entry) => entry.tab.id === activeClosedId) ?? closed[0];
    setSnapshot(next);
    setTabDesktops((current) => {
      const restored = { ...current, ...restoredAssignments };
      if (placeholderId && !next.tabs.some((tab) => tab.id === placeholderId)) {
        delete restored[placeholderId];
      }
      return restored;
    });
    if (activeEntry) {
      setWorkspace((current) => ({ ...current, activeDesktopId: activeEntry.desktopId }));
      setSurface(activeEntry.tab.url === "about:blank" ? "home" : "browser");
    }
  };

  const closeTab = async (tabId: string) => {
    if (!confirmCanvasLeave()) return;
    try {
      const closedTab = snapshot.tabs.find((tab) => tab.id === tabId);
      const closedDesktopId = tabDesktops[tabId] ?? workspace.activeDesktopId;
      const next = await window.lattice.browser.closeTab(tabId);
      if (closedTab) {
        const closedItem: DashboardClosedTab = {
          tab: closedTab,
          desktopId: closedDesktopId,
          closedAt: new Date().toISOString(),
        };
        setRecentlyClosedTabs((current) => [closedItem, ...current].slice(0, 30));
      }
      setSnapshot(next);
      const remaining = { ...tabDesktops };
      delete remaining[tabId];
      remaining[next.activeTabId] ??= workspace.activeDesktopId;
      setTabDesktops(remaining);
      const nextActive = next.tabs.find((tab) => tab.id === next.activeTabId);
      setSurface(
        remaining[next.activeTabId] === workspace.activeDesktopId &&
          nextActive?.url !== "about:blank"
          ? "browser"
          : "home",
      );
      if (closedTab) {
        const placeholderId = snapshot.tabs.length === 1 ? next.activeTabId : undefined;
        offerRecovery(`Closed ${displayTitle(closedTab)}`, () =>
          restoreClosedTabs(
            [{ tab: closedTab, desktopId: closedDesktopId }],
            closedTab.id,
            placeholderId,
          ),
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const selectDesktop = async (desktopId: string) => {
    if (!confirmCanvasLeave()) return;
    if (surface === "dashboard") {
      desktopLocationsRef.current[workspace.activeDesktopId] = { kind: "dashboard" };
    } else if ((surface === "browser" || surface === "home") && contextualTab) {
      desktopLocationsRef.current[workspace.activeDesktopId] = {
        kind: "tab",
        tabId: contextualTab.id,
      };
    }
    setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
    const rememberedLocation = desktopLocationsRef.current[desktopId];
    if (rememberedLocation?.kind === "dashboard") {
      setAddress("");
      setSurface("dashboard");
      setCaptureOpen(false);
      return;
    }
    const rememberedTab =
      rememberedLocation?.kind === "tab"
        ? snapshot.tabs.find(
            (tab) => tab.id === rememberedLocation.tabId && tabDesktops[tab.id] === desktopId,
          )
        : null;
    if (rememberedTab) {
      setSnapshot(await window.lattice.browser.switchTab(rememberedTab.id));
      setSurface(rememberedTab.url === "about:blank" ? "home" : "browser");
      setCaptureOpen(false);
      return;
    }
    const firstTab = snapshot.tabs.find((tab) => tabDesktops[tab.id] === desktopId);
    if (firstTab) {
      setSnapshot(await window.lattice.browser.switchTab(firstTab.id));
      setSurface(firstTab.url === "about:blank" ? "home" : "browser");
    } else {
      setAddress("");
      setSurface("dashboard");
    }
    setCaptureOpen(false);
  };

  const addDesktop = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmCanvasLeave()) return;
    if (!desktopName.trim()) return;
    const desktop = createDesktop(desktopName, workspace.desktops.length);
    setWorkspace((current) => ({
      ...current,
      activeDesktopId: desktop.id,
      desktops: [...current.desktops, desktop],
    }));
    setDesktopName("");
    setAddingDesktop(false);
    setSurface("dashboard");
  };

  const beginRenameDesktop = (desktopId: string) => {
    const desktop = workspace.desktops.find((candidate) => candidate.id === desktopId);
    if (!desktop) return;
    setEditingDesktopId(desktop.id);
    setEditingDesktopName(desktop.name);
    setWorkspaceMenuOpen(false);
  };

  const submitDesktopRename = (event: FormEvent) => {
    event.preventDefault();
    if (!editingDesktopId) return;
    const renamedDesktopId = editingDesktopId;
    const previousName = workspace.desktops.find(
      (desktop) => desktop.id === renamedDesktopId,
    )?.name;
    const next = renameDesktop(workspace, renamedDesktopId, editingDesktopName);
    if (next === workspace) {
      setStatus("Choose a unique desktop name");
      return;
    }
    setWorkspace(next);
    setEditingDesktopId(null);
    setEditingDesktopName("");
    setStatus("Desktop renamed; its local folder stayed in place");
    if (previousName) {
      offerRecovery("Desktop renamed", () =>
        setWorkspace((current) => renameDesktop(current, renamedDesktopId, previousName)),
      );
    }
  };

  const renameActiveDesktopFromDashboard = (name: string) => {
    const desktopId = workspace.activeDesktopId;
    const next = renameDesktop(workspace, desktopId, name);
    if (next === workspace) {
      setStatus("Choose a unique desktop name");
      return false;
    }
    setWorkspace(next);
    setStatus("Desktop renamed; its local folder stayed in place");
    return true;
  };

  const setActiveDesktopIcon = (icon: DesktopIconSelection) => {
    setWorkspace((current) => setDesktopIcon(current, current.activeDesktopId, icon));
  };

  const closeAllTabs = async () => {
    if (!confirmCanvasLeave()) return;
    try {
      const closed = snapshot.tabs.map((tab) => ({
        tab,
        desktopId: tabDesktops[tab.id] ?? workspace.activeDesktopId,
      }));
      const activeClosedId = snapshot.activeTabId;
      let next = snapshot;
      for (const tab of snapshot.tabs) next = await window.lattice.browser.closeTab(tab.id);
      setSnapshot(next);
      setTabDesktops({ [next.activeTabId]: workspace.activeDesktopId });
      setSurface("home");
      setAddress("");
      setCaptureOpen(false);
      setWorkspaceMenuOpen(false);
      setStatus("Started a fresh browser session");
      if (closed.length > 0) {
        offerRecovery(`Closed ${closed.length} tab${closed.length === 1 ? "" : "s"}`, () =>
          restoreClosedTabs(closed, activeClosedId, next.activeTabId),
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const moveActiveTab = (targetDesktopId: string) => {
    if (!contextualTab) return;
    const target = workspace.desktops.find((desktop) => desktop.id === targetDesktopId);
    if (!target) return;
    const movedTabId = contextualTab.id;
    const sourceDesktopId = tabDesktops[movedTabId] ?? workspace.activeDesktopId;
    setTabDesktops((current) =>
      moveTabToDesktop(current, workspace, contextualTab.id, targetDesktopId),
    );
    setWorkspace((current) => ({ ...current, activeDesktopId: targetDesktopId }));
    setBrowserMenuOpen(false);
    setCaptureOpen(false);
    setStatus(`Moved tab to ${target.name}`);
    offerRecovery(`Moved tab to ${target.name}`, () => {
      setTabDesktops((current) => ({ ...current, [movedTabId]: sourceDesktopId }));
      setWorkspace((current) => ({ ...current, activeDesktopId: sourceDesktopId }));
    });
  };

  const showDesktopArchiveActions = (desktopId: string) => {
    if (workspace.desktops.length <= 1) {
      setStatus("Keep at least one active desktop");
      return;
    }
    const fallback = workspace.desktops.find((desktop) => desktop.id !== desktopId);
    setArchiveDesktopId((current) => (current === desktopId ? null : desktopId));
    setArchiveMoveTargetId(fallback?.id ?? "");
    setWorkspaceMenuOpen(false);
  };

  const archiveSelectedDesktop = async (tabAction: "move" | "close") => {
    if (!archiveDesktopId) return;
    const desktop = workspace.desktops.find((candidate) => candidate.id === archiveDesktopId);
    const selectedTarget = workspace.desktops.find(
      (candidate) => candidate.id === archiveMoveTargetId && candidate.id !== archiveDesktopId,
    );
    if (!desktop) {
      setStatus("Desktop no longer exists");
      return;
    }
    const sourceTabs = snapshot.tabs.filter((tab) => tabDesktops[tab.id] === desktop.id);
    if (sourceTabs.length > 0 && !selectedTarget) {
      setStatus("Choose another desktop before archiving");
      return;
    }
    const result = archiveDesktop(workspace, desktop.id);
    if (!result.archived) {
      setStatus(
        result.reason === "last-desktop"
          ? "Keep at least one active desktop"
          : "Desktop no longer exists",
      );
      return;
    }

    const target =
      (sourceTabs.length > 0 ? selectedTarget : null) ??
      workspace.desktops.find((candidate) => candidate.id === result.workspace.activeDesktopId);
    if (!target) {
      setStatus("Choose another desktop before archiving");
      return;
    }
    const sourceTabIds = new Set(sourceTabs.map((tab) => tab.id));
    const activeClosedId = snapshot.activeTabId;
    let nextSnapshot = snapshot;
    const nextAssignments = { ...tabDesktops };

    try {
      if (tabAction === "close") {
        for (const tab of sourceTabs) nextSnapshot = await window.lattice.browser.closeTab(tab.id);
        for (const tab of sourceTabs) delete nextAssignments[tab.id];
        if (nextSnapshot.activeTabId && !nextAssignments[nextSnapshot.activeTabId]) {
          nextAssignments[nextSnapshot.activeTabId] = target.id;
        }
      } else {
        for (const tab of sourceTabs) nextAssignments[tab.id] = target.id;
      }

      const archivedWorkspace = { ...result.workspace, activeDesktopId: target.id };
      setWorkspace(archivedWorkspace);
      setSnapshot(nextSnapshot);
      setTabDesktops(nextAssignments);
      setArchiveDesktopId(null);
      setArchiveMoveTargetId("");
      setCaptureOpen(false);

      const visibleTab = nextSnapshot.tabs.find((tab) => nextAssignments[tab.id] === target.id);
      if (visibleTab && visibleTab.id !== nextSnapshot.activeTabId) {
        nextSnapshot = await window.lattice.browser.switchTab(visibleTab.id);
        setSnapshot(nextSnapshot);
      }
      const activeVisibleTab = nextSnapshot.tabs.find(
        (tab) => tab.id === nextSnapshot.activeTabId && nextAssignments[tab.id] === target.id,
      );
      setSurface(
        activeVisibleTab?.url && activeVisibleTab.url !== "about:blank" ? "browser" : "home",
      );
      if (!activeVisibleTab) setAddress("");
      setStatus(`Archived ${desktop.name}; saved files remain untouched`);

      offerRecovery(`Archived ${desktop.name}`, async () => {
        setWorkspace((current) => {
          const restored = restoreArchivedDesktop(current, desktop.id);
          return restored.restored ? restored.workspace : current;
        });
        if (tabAction === "close" && sourceTabs.length > 0) {
          await restoreClosedTabs(
            sourceTabs.map((tab) => ({ tab, desktopId: desktop.id })),
            activeClosedId,
            nextSnapshot.tabs.length === 1 && nextSnapshot.tabs[0]?.url === "about:blank"
              ? nextSnapshot.activeTabId
              : undefined,
          );
        } else {
          setTabDesktops((current) => {
            const restored = { ...current };
            for (const tabId of sourceTabIds) {
              if (snapshot.tabs.some((tab) => tab.id === tabId)) restored[tabId] = desktop.id;
            }
            return restored;
          });
          setWorkspace((current) => ({ ...current, activeDesktopId: desktop.id }));
          setSurface("home");
        }
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const restoreDesktopFromArchive = (desktopId: string) => {
    const result = restoreArchivedDesktop(workspace, desktopId);
    if (!result.restored) {
      setStatus("That archived desktop is no longer available");
      return;
    }
    setWorkspace(result.workspace);
    setArchivedDesktopsOpen(false);
    setWorkspaceMenuOpen(false);
    setSurface("home");
    setStatus("Desktop restored");
  };

  const hardDeleteDesktopFromArchive = (desktopId: string) => {
    if (confirmHardDeleteDesktopId !== desktopId) {
      setConfirmHardDeleteDesktopId(desktopId);
      return;
    }
    const desktop = workspace.archivedDesktops.find((candidate) => candidate.id === desktopId);
    const historyRemoval = removeDesktopRecords(browserHistory, desktopId);
    const closedTabRemoval = removeDesktopRecords(recentlyClosedTabs, desktopId);
    setWorkspace((current) => permanentlyDeleteArchivedDesktop(current, desktopId));
    setBrowserHistory(historyRemoval.kept);
    setRecentlyClosedTabs(closedTabRemoval.kept);
    delete desktopLocationsRef.current[desktopId];
    setConfirmHardDeleteDesktopId(null);
    setStatus(
      `Removed ${desktop?.name ?? "archived desktop"} and ${historyRemoval.removedCount + closedTabRemoval.removedCount} browser records; local notes and files were untouched`,
    );
  };

  const connectVault = async (disposable = false) => {
    try {
      const selected = disposable
        ? await window.lattice.vault.createDisposable()
        : await window.lattice.vault.choose();
      if (!selected) return;
      setVault(selected);
      const [savedLinks, savedCanvasPages, references] = await Promise.all([
        window.lattice.vault.listSavedLinks(),
        window.lattice.vault.listCanvasPages(),
        window.lattice.vault.referenceIndex(),
      ]);
      setLinks(savedLinks);
      setCanvasPages(savedCanvasPages);
      setReferenceIndex(references);
      const workspaceSnapshot = await window.lattice.localWorkspace.syncDesktops(
        workspaceFolderDefinitions,
      );
      setLocalWorkspace(workspaceSnapshot);
      setStatus(disposable ? "Disposable local folder connected" : "Local folder connected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const openCapture = () => {
    if (!contextualTab || contextualTab.url === "about:blank") return;
    setCaptureDescription("");
    setQueueCapture(false);
    setSaved(false);
    setCaptureOpen(true);
    setSurface("browser");
  };

  const saveLink = async () => {
    if (!contextualTab || !vault || contextualTab.url === "about:blank") return;
    setSaving(true);
    try {
      const savedLink = await window.lattice.vault.saveProbeNote({
        title: displayTitle(contextualTab),
        url: contextualTab.url,
        description: captureDescription.trim(),
        folder: activeDesktop?.name ?? "Desk 1",
        desktopId: activeDesktop?.id ?? "research",
        readingStatus: queueCapture ? "queued" : "saved",
      });
      setLinks(await window.lattice.vault.listSavedLinks());
      setReferenceIndex(await window.lattice.vault.referenceIndex());
      setSaved(true);
      setStatus(queueCapture ? "Saved to your reading queue" : "Saved to your local folder");
      offerRecovery(`Saved ${savedLink.title}`, async () => {
        await window.lattice.vault.trashSavedLink(savedLink.id);
        const [savedLinks, references] = await Promise.all([
          window.lattice.vault.listSavedLinks(),
          window.lattice.vault.referenceIndex(),
        ]);
        setLinks(savedLinks);
        setReferenceIndex(references);
        setSaved(false);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const openBrowserLinkTab = async (action: BrowserLinkAction) => {
    const activate = action.action === "open-foreground";
    const previousIds = new Set(snapshot.tabs.map((tab) => tab.id));
    const next = await window.lattice.browser.createTab({ url: action.url, activate });
    const created = next.tabs.find((tab) => !previousIds.has(tab.id));
    setSnapshot(next);
    if (created) {
      setTabDesktops((current) => ({
        ...current,
        [created.id]: workspace.activeDesktopId,
      }));
    }
    if (activate) {
      setSurface("browser");
      setCaptureOpen(false);
      setStatus(`Opened ${displayHost(action.url)} in a new tab`);
    } else {
      setStatus(`Opened ${displayHost(action.url)} in a background tab`);
    }
  };

  const saveBrowserLink = async (action: BrowserLinkAction) => {
    if (action.action === "favorite") {
      const changed = setDashboardUrlFavorite(action.url, true, action.title);
      setStatus(changed ? `Added ${action.title} to Favorites` : `${action.title} is a favorite`);
      if (changed) {
        offerRecovery(`Added ${action.title} to Favorites`, () => {
          setDashboardUrlFavorite(action.url, false, action.title);
        });
      }
      return;
    }
    if (!vault) {
      setSurface(action.action === "queue" ? "queue" : "library");
      setCaptureOpen(false);
      setStatus("Connect a vault before saving links");
      return;
    }

    const targetKey = urlReferenceKey(action.url);
    const existing = links.find(
      (link) =>
        urlReferenceKey(link.url) === targetKey &&
        (!activeDesktop ||
          link.desktopId === activeDesktop.id ||
          (!link.desktopId && link.folder === activeDesktop.name)),
    );
    if (existing) {
      if (action.action === "queue" && existing.readingStatus !== "queued") {
        const previousStatus = existing.readingStatus;
        await window.lattice.vault.setReadingStatus({ id: existing.id, status: "queued" });
        setLinks(await window.lattice.vault.listSavedLinks());
        setStatus(`Added ${existing.title} to the reading queue`);
        offerRecovery(`Added ${existing.title} to the reading queue`, async () => {
          await window.lattice.vault.setReadingStatus({
            id: existing.id,
            status: previousStatus,
          });
          setLinks(await window.lattice.vault.listSavedLinks());
        });
      } else {
        setStatus(
          action.action === "queue"
            ? `${existing.title} is already in the reading queue`
            : `${existing.title} is already in Saved links`,
        );
      }
      return;
    }

    const savedLink = await window.lattice.vault.saveProbeNote({
      title: action.title.trim().slice(0, 200) || displayHost(action.url),
      url: action.url,
      description: "",
      folder: activeDesktop?.name ?? "Saved Links",
      desktopId: activeDesktop?.id ?? "research",
      readingStatus: action.action === "queue" ? "queued" : "saved",
    });
    const [savedLinks, references] = await Promise.all([
      window.lattice.vault.listSavedLinks(),
      window.lattice.vault.referenceIndex(),
    ]);
    setLinks(savedLinks);
    setReferenceIndex(references);
    setStatus(
      action.action === "queue"
        ? `Added ${savedLink.title} to the reading queue`
        : `Saved ${savedLink.title} to Saved links`,
    );
    offerRecovery(
      action.action === "queue"
        ? `Added ${savedLink.title} to the reading queue`
        : `Saved ${savedLink.title}`,
      async () => {
        await window.lattice.vault.trashSavedLink(savedLink.id);
        const [remainingLinks, remainingReferences] = await Promise.all([
          window.lattice.vault.listSavedLinks(),
          window.lattice.vault.referenceIndex(),
        ]);
        setLinks(remainingLinks);
        setReferenceIndex(remainingReferences);
      },
    );
  };

  browserLinkActionHandlerRef.current = (action) => {
    void (async () => {
      try {
        if (action.action === "open") {
          await openUrl(action.url);
        } else if (action.action === "open-background" || action.action === "open-foreground") {
          await openBrowserLinkTab(action);
        } else {
          await saveBrowserLink(action);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    })();
  };

  const showLibrary = async () => {
    if (!confirmCanvasLeave()) return;
    setSurface("library");
    setCaptureOpen(false);
    if (vault) {
      const [savedLinks, references] = await Promise.all([
        window.lattice.vault.listSavedLinks(),
        window.lattice.vault.referenceIndex(),
      ]);
      setLinks(savedLinks);
      setReferenceIndex(references);
    }
  };

  const showReadingQueue = async () => {
    if (!confirmCanvasLeave()) return;
    setSurface("queue");
    setCaptureOpen(false);
    if (vault) setLinks(await window.lattice.vault.listSavedLinks());
  };

  const showCanvasPages = async (pageId: string | null = null) => {
    setRequestedCanvasPageId(pageId);
    setSurface("pages");
    setCaptureOpen(false);
    if (vault) {
      const [savedCanvasPages, references] = await Promise.all([
        window.lattice.vault.listCanvasPages(),
        window.lattice.vault.referenceIndex(),
      ]);
      setCanvasPages(savedCanvasPages);
      setReferenceIndex(references);
    }
  };

  const showSettings = async () => {
    if (!confirmCanvasLeave()) return;
    setSurface("settings");
    setCaptureOpen(false);
    setCommandOpen(false);
    setConfirmClearData(false);
    try {
      setPrivacy(await window.lattice.browser.privacySummary());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const showRunnableApps = () => {
    if (!confirmCanvasLeave()) return;
    setRunnableAppTarget("pomodoro");
    setSurface("apps");
    setCaptureOpen(false);
    setCommandOpen(false);
    setBrowserMenuOpen(false);
  };

  const showRunnableApp = (appId: RunnableAppId, dailyFlowView: DailyFlowView = "today") => {
    if (!confirmCanvasLeave()) return;
    setRunnableAppTarget(appId);
    setDailyFlowTargetView(dailyFlowView);
    setSurface("apps");
    setCaptureOpen(false);
    setCommandOpen(false);
    setBrowserMenuOpen(false);
  };

  const showDashboard = () => {
    if (!confirmCanvasLeave()) return;
    desktopLocationsRef.current[workspace.activeDesktopId] = { kind: "dashboard" };
    setSurface("dashboard");
    setCaptureOpen(false);
    setBrowserMenuOpen(false);
    setCommandOpen(false);
    setProfileMenuOpen(false);
  };

  const refreshLocalWorkspace = async () => {
    if (!vault || localWorkspaceBusy) return;
    setLocalWorkspaceBusy(true);
    try {
      setLocalWorkspace(
        await window.lattice.localWorkspace.syncDesktops(workspaceFolderDefinitions),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLocalWorkspaceBusy(false);
    }
  };

  const showFiles = () => {
    if (!confirmCanvasLeave()) return;
    setNavigationExpanded(true);
    setFilesSidebarActive(true);
    setSurface("files");
    setCaptureOpen(false);
    setBrowserMenuOpen(false);
    setCommandOpen(false);
    void refreshLocalWorkspace();
  };

  const focusBrowserLocation = () => {
    window.requestAnimationFrame(() => {
      omniboxRef.current?.focus();
      omniboxRef.current?.select();
    });
  };

  const showBrowser = async () => {
    if (!confirmCanvasLeave()) return;
    if (contextualTab?.url === "about:blank") {
      setSurface("home");
      window.requestAnimationFrame(() => latticeBarRef.current?.focus());
    } else if (contextualTab) {
      setSurface("browser");
      focusBrowserLocation();
    } else {
      await createTab(workspace.activeDesktopId, "home");
    }
    setCaptureOpen(false);
    setBrowserMenuOpen(false);
  };

  const showSurface = async (target: Surface) => {
    if (target === "home") await createTab();
    else if (target === "dashboard") showDashboard();
    else if (target === "browser") await showBrowser();
    else if (target === "files") showFiles();
    else if (target === "library") await showLibrary();
    else if (target === "queue") await showReadingQueue();
    else if (target === "pages") await showCanvasPages();
    else if (target === "apps") showRunnableApps();
    else await showSettings();
  };

  const saveLatticeNote = async () => {
    if (capturingQuickNote) return;
    const note = homeQuery.trim();
    if (!note) return;

    setCapturingQuickNote(true);
    const previous = runnableApps;
    try {
      if (vault) {
        const nextWorkspace = await window.lattice.localWorkspace.captureInbox({
          desktopId: workspace.activeDesktopId,
          title: note.slice(0, 80),
          content: note,
          kind: "note",
        });
        setLocalWorkspace(nextWorkspace);
      }
      const next = {
        ...runnableApps,
        bulletJournal: captureJournalInboxNote(runnableApps.bulletJournal, note),
      };
      setRunnableApps(next);
      setHomeQuery("");
      setLatticeNoteMode(false);
      setStatus(
        vault ? "Quick note captured to this desktop's Inbox" : "Quick note captured to Inbox",
      );
      if (!vault) offerRecovery("Quick note captured to Inbox", () => setRunnableApps(previous));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setCapturingQuickNote(false);
    }
  };

  const activateHomeIntent = async () => {
    if (intentResolution.error) {
      setStatus(intentResolution.error);
      return;
    }
    if (intentResolution.intent.kind === "empty") return;
    await openUrl(intentResolution.intent.url);
    setHomeQuery("");
  };

  const activateNewTabSuggestion = async (suggestion: NewTabSuggestion) => {
    if (suggestion.kind === "app") {
      showRunnableApp(suggestion.appId);
    } else if (suggestion.kind === "tab") {
      await switchTab(suggestion.tab);
    } else if (suggestion.kind === "history") {
      await openUrl(suggestion.history.url);
    } else if (suggestion.kind === "link") {
      await openUrl(suggestion.link.url);
    } else if (suggestion.kind === "canvas") {
      await showCanvasPages(suggestion.pageId);
    } else {
      try {
        await window.lattice.vault.revealCanvasReference({
          pageId: suggestion.pageId,
          nodeId: suggestion.nodeId,
          linkId: suggestion.linkId,
        });
        setStatus(`Revealed ${suggestion.label} in its folder`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const activateWebsiteMatch = async (match: WebsiteMatch) => {
    await openUrl(match.site.homeUrl);
    setHomeQuery("");
  };

  const activateQuickAccess = (match: QuickAccessMatch) => {
    if (match.target === "daily-flow") showRunnableApp("daily-flow");
    else if (match.target === "pomodoro") showRunnableApp("pomodoro");
    else if (match.target === "wealth-lab") showRunnableApp("wealth-lab");
    else if (match.target === "library") void showLibrary();
    else if (match.target === "pages") void showCanvasPages();
    else void showReadingQueue();
  };

  const focusFirstLatticeAction = () => {
    window.requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>(
        ".lattice-bar-results [data-lattice-action]",
      );
      first?.focus();
    });
  };

  const handleLatticeResultsKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") {
      latticeBarRef.current?.focus();
      return;
    }
    const actions = [
      ...document.querySelectorAll<HTMLElement>(".lattice-bar-results [data-lattice-action]"),
    ];
    if (actions.length === 0) return;
    const current = actions.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = current < 0 ? 0 : (current + delta + actions.length) % actions.length;
    setActiveLatticeResultIndex(nextIndex);
    actions[nextIndex]?.focus();
  };

  const setDistractionFree = (enabled: boolean) => {
    setFocusMode(enabled);
    setCaptureOpen(false);
    setCommandOpen(false);
    setWorkspaceMenuOpen(false);
    setBrowserMenuOpen(false);
    setProfileMenuOpen(false);
    setStatus(enabled ? "Focus view on — press Escape to show navigation" : "Navigation restored");
    if (enabled) {
      offerRecovery("Focus view on", () => setDistractionFree(false), "Exit focus");
    } else if (pendingRecoveryRef.current?.actionLabel === "Exit focus") {
      clearRecovery();
    }
  };

  const toggleDistractionFree = () => {
    setDistractionFree(!focusMode);
  };

  const toggleRestoreTabs = () => {
    const previous = settings.restoreTabs;
    setSettings((current) => ({ ...current, restoreTabs: !current.restoreTabs }));
    const message = previous ? "Tab restoration disabled" : "Tab restoration enabled";
    setStatus(message);
    offerRecovery(message, () => setSettings((current) => ({ ...current, restoreTabs: previous })));
  };

  const selectSearchProvider = (searchProvider: SettingsPreferences["searchProvider"]) => {
    if (settings.searchProvider === searchProvider) return;
    const previous = settings.searchProvider;
    const provider = providerById(searchProvider);
    setSettings((current) => ({ ...current, searchProvider }));
    setStatus(`${provider.name} is now your web search provider`);
    offerRecovery(`Changed web search to ${provider.name}`, () =>
      setSettings((current) => ({ ...current, searchProvider: previous })),
    );
  };

  const clearLocalSearchHistory = () => {
    const previous = browserHistory;
    if (previous.length === 0) {
      setStatus("There is no local search history to clear");
      return;
    }
    setBrowserHistory([]);
    setStatus("Local search history cleared");
    offerRecovery("Local search history cleared", () => setBrowserHistory(previous));
  };

  const selectTheme = (themeId: ThemeId) => {
    if (themeId === settings.activeTheme) return;
    const previous = settings;
    const selected = THEME_CATALOG.find((theme) => theme.id === themeId);
    const message = `${themeId === "custom" ? settings.customTheme.name : selected?.name} theme applied`;
    setSettings({ ...settings, activeTheme: themeId });
    setStatus(message);
    offerRecovery(message, () => {
      setSettings(previous);
      setCustomThemeDraft(previous.customTheme);
    });
  };

  const cycleTheme = () => {
    const currentIndex = THEME_CATALOG.findIndex((theme) => theme.id === settings.activeTheme);
    const nextTheme = THEME_CATALOG[(currentIndex + 1) % THEME_CATALOG.length];
    if (nextTheme) selectTheme(nextTheme.id);
  };

  const activeThemeName =
    settings.activeTheme === "custom"
      ? settings.customTheme.name
      : (THEME_CATALOG.find((theme) => theme.id === settings.activeTheme)?.name ?? "Theme");
  const themeSwitcherIcon: IconName =
    settings.activeTheme === "lattice-dark"
      ? "moon"
      : settings.activeTheme === "paper-felt"
        ? "sun"
        : "leaf";
  const nextThemeName =
    THEME_CATALOG[
      (THEME_CATALOG.findIndex((theme) => theme.id === settings.activeTheme) + 1) %
        THEME_CATALOG.length
    ]?.name ?? "next theme";
  const coachLogoUrl =
    settings.activeTheme === "paper-felt" ||
    (settings.activeTheme === "custom" && colorLuminance(previewCustomTheme.background) >= 0.34)
      ? lightCapLogoUrl
      : darkCapLogoUrl;

  const applyCustomTheme = () => {
    const previous = settings;
    const normalized = normalizeCustomTheme(customThemeDraft);
    const next: SettingsPreferences = {
      ...settings,
      activeTheme: "custom",
      customTheme: normalized,
    };
    setCustomThemeDraft(normalized);
    setSettings(next);
    const message = `${normalized.name} theme saved for this profile`;
    setStatus(message);
    offerRecovery(message, () => {
      setSettings(previous);
      setCustomThemeDraft(previous.customTheme);
    });
  };

  const resetCustomThemeDraft = () => {
    const previous = customThemeDraft;
    setCustomThemeDraft(DEFAULT_CUSTOM_THEME);
    setStatus("Custom palette reset in preview");
    offerRecovery("Custom palette reset in preview", () => setCustomThemeDraft(previous));
  };

  const clearWebsiteData = async () => {
    if (!confirmClearData) {
      setConfirmClearData(true);
      setStatus("Confirm clearing website cookies, cache, and local storage");
      return;
    }
    setClearingData(true);
    try {
      setPrivacy(await window.lattice.browser.clearWebsiteData());
      setConfirmClearData(false);
      setStatus("Website data cleared; open sites may ask you to sign in again");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setClearingData(false);
    }
  };

  const persistActiveProfileShell = () => {
    if (!profileState) return;
    const profileId = profileState.activeProfileId;
    localStorage.setItem(
      profileStorageKey(WORKSPACE_STORAGE_KEY, profileId),
      JSON.stringify(workspace),
    );
    localStorage.setItem(
      profileStorageKey(SETTINGS_STORAGE_KEY, profileId),
      JSON.stringify(settings),
    );
    localStorage.setItem(
      profileStorageKey(FOCUS_STORAGE_KEY, profileId),
      JSON.stringify({ version: 1, intention: normalizeFocusIntention(focusIntention) }),
    );
    localStorage.setItem(
      profileStorageKey(RUNNABLE_APPS_STORAGE_KEY, profileId),
      JSON.stringify(runnableApps),
    );
    localStorage.setItem(
      profileStorageKey(BROWSER_HISTORY_STORAGE_KEY, profileId),
      serializeStoredHistory(browserHistory),
    );
    const sessionKey = profileStorageKey(SESSION_STORAGE_KEY, profileId);
    if (settings.restoreTabs) {
      localStorage.setItem(
        sessionKey,
        JSON.stringify(buildRestorableSession(snapshot, tabDesktops, workspace.activeDesktopId)),
      );
    } else {
      localStorage.removeItem(sessionKey);
    }
  };

  const applyProfileSwitch = async (result: ProfileSwitchResult) => {
    const profileId = result.state.activeProfileId;
    const shell = loadProfileShellState(result.state, profileId);
    const restored = await restoreProfileBrowser(
      result.browser,
      shell.workspace,
      shell.settings,
      result.state,
      profileId,
    );
    const selected = result.state.profiles.find((profile) => profile.id === profileId);
    setProfileState(result.state);
    setWorkspace(
      restored.restoredActive
        ? { ...shell.workspace, activeDesktopId: restored.restoredActive.desktopId }
        : shell.workspace,
    );
    setSettings(shell.settings);
    setFocusIntention(shell.focusIntention);
    setRunnableApps(shell.runnableApps);
    setBrowserHistory(
      parseStoredHistory(
        readProfileStorage(localStorage, BROWSER_HISTORY_STORAGE_KEY, result.state, profileId),
      ),
    );
    setSnapshot(restored.snapshot);
    setTabDesktops(restored.assignments);
    setSurface("home");
    setAddress("");
    setFocusMode(false);
    setCaptureOpen(false);
    setCommandOpen(false);
    setWorkspaceMenuOpen(false);
    setBrowserMenuOpen(false);
    setProfileEditor(null);
    setProfileMenuOpen(false);
    setSessionReady(true);
    setProfileShellHydrated(true);
    setPrivacy(await window.lattice.browser.privacySummary());
    setStatus(`${selected?.name ?? "Profile"} is ready`);
  };

  const switchProfile = async (profile: ProfileSummary) => {
    if (!profileState || profile.id === profileState.activeProfileId || profileBusy) {
      setProfileMenuOpen(false);
      return;
    }
    if (!confirmCanvasLeave()) return;
    setProfileBusy(true);
    clearRecovery();
    setConfirmClearAvatar(false);
    setSessionReady(false);
    persistActiveProfileShell();
    setProfileShellHydrated(false);
    try {
      await window.lattice.browser.setVisible(false);
      await applyProfileSwitch(await window.lattice.profiles.switch(profile.id));
    } catch (error) {
      setSessionReady(true);
      setProfileShellHydrated(true);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileName.trim() || profileBusy) return;
    setProfileBusy(true);
    setSessionReady(false);
    persistActiveProfileShell();
    setProfileShellHydrated(false);
    try {
      await window.lattice.browser.setVisible(false);
      await applyProfileSwitch(await window.lattice.profiles.create({ name: profileName }));
      setProfileName("");
    } catch (error) {
      setSessionReady(true);
      setProfileShellHydrated(true);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const updateProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProfile || !profileName.trim() || profileBusy) return;
    setProfileBusy(true);
    const previousName = activeProfile.name;
    const profileId = activeProfile.id;
    try {
      setProfileState(
        await window.lattice.profiles.update({ id: activeProfile.id, name: profileName }),
      );
      setProfileEditor(null);
      setProfileName("");
      setStatus("Profile name updated");
      offerRecovery("Profile renamed", async () => {
        setProfileState(
          await window.lattice.profiles.update({ id: profileId, name: previousName }),
        );
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const chooseProfileAvatar = async () => {
    if (!activeProfile || profileBusy) return;
    setProfileBusy(true);
    setConfirmClearAvatar(false);
    try {
      setProfileState(await window.lattice.profiles.chooseAvatar(activeProfile.id));
      setStatus("Profile picture updated locally");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const clearProfileAvatar = async () => {
    if (!activeProfile || profileBusy) return;
    if (!confirmClearAvatar) {
      setConfirmClearAvatar(true);
      setStatus("Removing the picture cannot be undone; confirm to continue");
      return;
    }
    setProfileBusy(true);
    try {
      setProfileState(await window.lattice.profiles.clearAvatar(activeProfile.id));
      setConfirmClearAvatar(false);
      setStatus("Profile picture removed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileBusy(false);
    }
  };

  const disconnectVault = async () => {
    try {
      await window.lattice.vault.disconnect();
      setVault(null);
      setLocalWorkspace(emptyLocalWorkspace);
      setLinks([]);
      setCanvasPages([]);
      setStatus("Local folder disconnected; no files were deleted");
      offerRecovery("Local folder disconnected", () => connectVault(false), "Reconnect");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const updateReadingStatus = async (
    link: SavedLinkRecord,
    readingStatus: SavedLinkRecord["readingStatus"],
  ) => {
    setUpdatingLinkId(link.id);
    try {
      const updated = await window.lattice.vault.setReadingStatus({
        id: link.id,
        status: readingStatus,
      });
      setLinks((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setStatus(
        readingStatus === "queued"
          ? "Added to reading queue"
          : readingStatus === "read"
            ? "Marked as read"
            : "Removed from reading queue",
      );
      offerRecovery("Reading status changed", async () => {
        const restored = await window.lattice.vault.setReadingStatus({
          id: link.id,
          status: link.readingStatus,
        });
        setLinks((current) =>
          current.map((candidate) => (candidate.id === restored.id ? restored : candidate)),
        );
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const beginEditingLink = (link: SavedLinkRecord) => {
    setEditingLinkId(link.id);
    setEditingLinkTitle(link.title);
    setEditingLinkDescription(link.description);
  };

  const cancelEditingLink = () => {
    setEditingLinkId(null);
    setEditingLinkTitle("");
    setEditingLinkDescription("");
  };

  const saveLinkMetadata = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingLinkId || !editingLinkTitle.trim()) return;
    const previous = links.find((link) => link.id === editingLinkId);
    setUpdatingLinkId(editingLinkId);
    try {
      const updated = await window.lattice.vault.updateSavedLinkMetadata({
        id: editingLinkId,
        title: editingLinkTitle,
        description: editingLinkDescription,
      });
      setLinks((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      cancelEditingLink();
      setStatus("Saved link metadata updated; note body and path were preserved");
      if (previous) {
        offerRecovery("Saved-link details updated", async () => {
          const restored = await window.lattice.vault.updateSavedLinkMetadata({
            id: previous.id,
            title: previous.title,
            description: previous.description,
          });
          setLinks((current) =>
            current.map((candidate) => (candidate.id === restored.id ? restored : candidate)),
          );
        });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const trashSavedLink = async (link: SavedLinkRecord) => {
    setUpdatingLinkId(link.id);
    try {
      const trashed = await window.lattice.vault.trashSavedLink(link.id);
      const [savedLinks, references] = await Promise.all([
        window.lattice.vault.listSavedLinks(),
        window.lattice.vault.referenceIndex(),
      ]);
      setLinks(savedLinks);
      setReferenceIndex(references);
      if (editingLinkId === link.id) cancelEditingLink();
      setStatus(`Moved “${link.title}” to Lattice Trash`);
      offerRecovery(`Moved ${link.title} to Lattice Trash`, async () => {
        await window.lattice.vault.restoreTrash(trashed.token);
        const [restoredLinks, restoredReferences] = await Promise.all([
          window.lattice.vault.listSavedLinks(),
          window.lattice.vault.referenceIndex(),
        ]);
        setLinks(restoredLinks);
        setReferenceIndex(restoredReferences);
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const openLinkInObsidian = async (link: SavedLinkRecord) => {
    setHandoffLinkId(link.id);
    try {
      await window.lattice.vault.openSavedLinkInObsidian(link.id);
      setStatus("Opened the saved note in Obsidian");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setHandoffLinkId(null);
    }
  };

  const revealSavedLink = async (link: SavedLinkRecord) => {
    setHandoffLinkId(link.id);
    try {
      await window.lattice.vault.revealSavedLink(link.id);
      setStatus("Revealed the saved Markdown file");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setHandoffLinkId(null);
    }
  };

  const openCommandPalette = () => {
    setCommandQuery("");
    setCommandOpen(true);
    setCaptureOpen(false);
    setWorkspaceMenuOpen(false);
    setProfileMenuOpen(false);
  };

  const runCommand = async (item: CommandItem) => {
    setCommandOpen(false);
    if (item.kind === "web") {
      await openUrl(item.query);
      return;
    }
    if (item.kind === "desktop") {
      await selectDesktop(item.desktopId);
      return;
    }
    if (item.kind === "tab") {
      const desktopId = tabDesktops[item.tab.id] ?? workspace.activeDesktopId;
      setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
      await switchTab(item.tab);
      return;
    }
    if (item.kind === "link") {
      const desktopId =
        (item.link.desktopId &&
          workspace.desktops.some((desktop) => desktop.id === item.link.desktopId) &&
          item.link.desktopId) ||
        workspace.desktops.find((desktop) => desktop.name === item.link.folder)?.id ||
        workspace.activeDesktopId;
      setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
      await openUrl(item.link.url, true, desktopId);
      return;
    }
    if (item.action === "new-tab") await createTab();
    else if (item.action === "queue") await showReadingQueue();
    else if (item.action === "apps") showRunnableApps();
    else await showLibrary();
  };

  const activeRailItem: Surface = ["library", "queue", "pages"].includes(surface)
    ? "library"
    : surface;
  const libraryOpen = surface === "library" || surface === "queue" || surface === "pages";
  const libraryNavigation = (
    <nav className="libraries-tabs" aria-label="Libraries">
      <button
        type="button"
        className={surface === "library" ? "active" : ""}
        aria-current={surface === "library" ? "page" : undefined}
        onClick={() => void showLibrary()}
      >
        <Icon name="bookmark" />
        Saved links
        <b>{links.length}</b>
      </button>
      <button
        type="button"
        className={surface === "queue" ? "active" : ""}
        aria-current={surface === "queue" ? "page" : undefined}
        onClick={() => void showReadingQueue()}
      >
        <Icon name="queue" />
        Reading queue
        <b>{queueCount}</b>
      </button>
      <button
        type="button"
        className={surface === "pages" ? "active" : ""}
        aria-current={surface === "pages" ? "page" : undefined}
        onClick={() => void showCanvasPages()}
      >
        <Icon name="canvas" />
        Pages
        <b>{canvasPages.length}</b>
      </button>
    </nav>
  );

  const setNavigationView = (expanded: boolean) => {
    setNavigationExpanded(expanded);
    setWorkspaceMenuOpen(false);
    setArchivedDesktopsOpen(false);
    setProfileMenuOpen(false);
    setStatus(expanded ? "Expanded navigation" : "Compact navigation");
  };

  const startNavigationResize = (event: ReactPointerEvent<HTMLHRElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = navigationWidth;
    const shell = event.currentTarget.closest(".lattice-shell");
    shell?.classList.add("navigation-resizing");

    const finish = () => {
      shell?.classList.remove("navigation-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    const move = (pointerEvent: PointerEvent) => {
      const result = navigationResizeResult(startWidth + pointerEvent.clientX - startX);
      if (result.mode === "compact") {
        setNavigationView(false);
        finish();
        return;
      }
      setNavigationWidth(result.width);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const resizeNavigationWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let requestedWidth: number;
    if (event.key === "ArrowLeft") requestedWidth = navigationWidth - 8;
    else if (event.key === "ArrowRight") requestedWidth = navigationWidth + 8;
    else if (event.key === "Home") requestedWidth = DEFAULT_NAVIGATION_WIDTH;
    else if (event.key === "End") requestedWidth = MAX_NAVIGATION_WIDTH;
    else return;

    event.preventDefault();
    const result = navigationResizeResult(requestedWidth);
    if (result.mode === "compact") setNavigationView(false);
    else setNavigationWidth(result.width);
  };

  commandHandlerRef.current = (command) => {
    if (command === "zoom-in" || command === "zoom-out" || command === "zoom-reset") {
      zoomHandlerRef.current(command);
      return;
    }
    if (command === "search") {
      openCommandPalette();
      return;
    }
    if (command === "focus-location") {
      setCommandOpen(false);
      setCaptureOpen(false);
      setFocusMode(false);
      void showBrowser();
      return;
    }
    if (command === "new-tab") {
      void createTab(workspace.activeDesktopId, "home");
      return;
    }
    if (command === "toggle-focus") {
      toggleDistractionFree();
      return;
    }
    const destination: Partial<Record<ShellCommand, Surface>> = {
      "show-focus": "dashboard",
      "show-browser": "browser",
      "show-files": "files",
      "show-pages": "pages",
      "show-library": "library",
      "show-queue": "queue",
      "show-apps": "apps",
      "show-settings": "settings",
    };
    const target = destination[command];
    if (target) {
      void showSurface(target);
      return;
    }
    if (contextualTab) void closeTab(contextualTab.id);
  };

  useEffect(() => {
    const unsubscribe = window.lattice.shell.onCommand((command) =>
      commandHandlerRef.current(command),
    );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCaptureOpen(false);
        setWorkspaceMenuOpen(false);
        setBrowserMenuOpen(false);
        setZoomFineTuneOpen(false);
        setFocusMode(false);
        if (pendingRecoveryRef.current?.actionLabel === "Exit focus") {
          if (recoveryTimerRef.current !== null) {
            window.clearTimeout(recoveryTimerRef.current);
          }
          recoveryTimerRef.current = null;
          pendingRecoveryRef.current = null;
          setRecoveryNotice(null);
          setStatus("Navigation restored");
        }
        return;
      }
      const focusShortcut = navigationShortcut(event);
      if (focusShortcut) {
        event.preventDefault();
        commandHandlerRef.current(
          focusShortcut.kind === "toggle-focus"
            ? "toggle-focus"
            : focusShortcut.surface === "dashboard"
              ? "show-focus"
              : (`show-${focusShortcut.surface}` as ShellCommand),
        );
        return;
      }
      const zoomCommand = zoomCommandForShortcut({
        key: event.key,
        code: event.code,
        control: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
      });
      if (zoomCommand) {
        event.preventDefault();
        zoomHandlerRef.current(zoomCommand);
        return;
      }
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey && !isEditableTarget(event.target)) {
        if (document.querySelector(".canvas-editor")) return;
        event.preventDefault();
        recoveryHandlerRef.current();
        return;
      }
      const command =
        event.key.toLowerCase() === "k"
          ? "search"
          : event.key.toLowerCase() === "l"
            ? "focus-location"
            : event.key.toLowerCase() === "t"
              ? "new-tab"
              : event.key.toLowerCase() === "w"
                ? "close-tab"
                : null;
      if (!command) return;
      event.preventDefault();
      commandHandlerRef.current(command);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribe();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className={`lattice-shell navigation-${navigationExpanded ? "expanded" : "compact"}${focusMode ? " focus-mode" : ""}${
        settings.activeTheme === "lattice-dark" ? "" : " theme-adaptive"
      }`}
      data-theme={settings.activeTheme}
      data-surface={surface}
      data-theme-name={
        settings.activeTheme === "custom"
          ? previewCustomTheme.name
          : THEME_CATALOG.find((theme) => theme.id === settings.activeTheme)?.name
      }
      data-titlebar-theme={nativeAppearanceTheme ?? "syncing"}
      style={shellThemeStyle}
    >
      <nav
        className={`activity-rail${profileMenuOpen ? " profile-open" : ""}`}
        aria-label="Compact navigation"
        aria-hidden={navigationExpanded && !profileMenuOpen}
        inert={navigationExpanded && !profileMenuOpen ? true : undefined}
      >
        <button
          className="brand-mark"
          type="button"
          onClick={showDashboard}
          aria-label="Open Dashboard"
          title="Coach Browser"
          data-action-description={actionHelpText.dashboard}
        >
          <img src={coachLogoUrl} alt="" />
        </button>
        <button
          type="button"
          className="rail-button rail-search-button"
          aria-label="Search everything"
          title={`Search everything (${searchShortcutLabel})`}
          data-action-description={actionHelpText.searchEverything(searchShortcutLabel)}
          onClick={openCommandPalette}
        >
          <Icon name="search" />
        </button>
        <nav className="rail-desktops" aria-label="Desktops">
          {workspace.desktops.slice(0, 3).map((desktop) => {
            const active = desktop.id === workspace.activeDesktopId;
            return (
              <button
                type="button"
                key={desktop.id}
                className={active ? "rail-desktop-button active" : "rail-desktop-button"}
                aria-label={`Switch to ${desktop.name}`}
                aria-current={active ? "page" : undefined}
                title={desktop.name}
                data-action-description={actionHelpText.desktop(desktop.name)}
                onClick={() => void selectDesktop(desktop.id)}
              >
                <span className={`rail-desktop-glyph ${desktop.color}`}>
                  <DesktopIconGraphic icon={desktop.icon} color={desktop.color} />
                </span>
              </button>
            );
          })}
          {workspace.desktops.length > 3 && (
            <button
              type="button"
              className="rail-desktop-control"
              aria-label="Show more desktops"
              title="More desktops"
              onClick={() => {
                setDesktopOverflowOpen(true);
                setNavigationView(true);
              }}
            >
              <Icon name="chevron-down" />
            </button>
          )}
          <button
            type="button"
            className="rail-desktop-control"
            aria-label="Add desktop"
            title="Add desktop"
            data-action-description={actionHelpText.addDesktop}
            onClick={() => {
              setAddingDesktop(true);
              setNavigationView(true);
            }}
          >
            <Icon name="plus" />
          </button>
        </nav>
        <div className="rail-actions">
          {railItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeRailItem === item.id ? "rail-button active" : "rail-button"}
              aria-label={item.label}
              aria-current={activeRailItem === item.id ? "page" : undefined}
              title={item.label}
              data-action-description={item.description}
              onClick={() => void showSurface(item.id)}
            >
              <Icon name={item.icon} />
              {item.id === "queue" && queueCount > 0 && (
                <span className="rail-count">{queueCount > 99 ? "99+" : queueCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="rail-spacer" />
        <button
          className="profile-button"
          type="button"
          title={activeProfile ? `${activeProfile.name} profile` : "Website profiles"}
          aria-label={activeProfile ? `Open ${activeProfile.name} profile menu` : "Open profiles"}
          aria-expanded={profileMenuOpen}
          data-action-description={actionHelpText.profiles}
          onClick={() => {
            setWorkspaceMenuOpen(false);
            setBrowserMenuOpen(false);
            setCommandOpen(false);
            setProfileEditor(null);
            setProfileMenuOpen((open) => !open);
          }}
        >
          {activeProfile?.avatarDataUrl ? (
            <img src={activeProfile.avatarDataUrl} alt="" />
          ) : (
            profileInitials(activeProfile?.name ?? "Personal")
          )}
        </button>
        <span
          className={vault ? "rail-vault-status connected" : "rail-vault-status"}
          title={vault ? "Local folder connected" : "Connect local folder"}
          aria-label={vault ? "Local folder connected" : "No local folder connected"}
          role="status"
        >
          <Icon name={vault ? "check" : "sparkle"} />
        </span>
        {profileMenuOpen && (
          <>
            <button
              type="button"
              className="profile-menu-backdrop"
              aria-label="Close profile menu"
              onClick={() => setProfileMenuOpen(false)}
            />
            <section
              className="profile-menu"
              role="dialog"
              aria-label="Website profiles"
              aria-busy={!profileState && !profileLoadError}
            >
              <header className="profile-menu-header">
                <span className="profile-avatar large">
                  {activeProfile?.avatarDataUrl ? (
                    <img src={activeProfile.avatarDataUrl} alt="" />
                  ) : (
                    profileInitials(activeProfile?.name ?? "Personal")
                  )}
                </span>
                <span className="profile-copy">
                  <small>Current website identity</small>
                  <strong>
                    {activeProfile?.name ??
                      (profileLoadError ? "Profiles unavailable" : "Loading profiles…")}
                  </strong>
                </span>
              </header>

              {profileEditor ? (
                <form
                  className="profile-editor"
                  onSubmit={profileEditor === "create" ? createProfile : updateProfile}
                >
                  <label htmlFor="profile-name">
                    {profileEditor === "create" ? "New profile name" : "Profile name"}
                  </label>
                  <input
                    id="profile-name"
                    value={profileName}
                    maxLength={40}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder={profileEditor === "create" ? "Work, Writing, Client…" : "Name"}
                  />
                  <div>
                    <button
                      type="submit"
                      className="primary"
                      disabled={!profileName.trim() || profileBusy}
                    >
                      {profileBusy
                        ? "Saving…"
                        : profileEditor === "create"
                          ? "Create and switch"
                          : "Save name"}
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        setProfileEditor(null);
                        setProfileName("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : profileState ? (
                <>
                  <div className="profile-list">
                    {profileState?.profiles.map((profile) => (
                      <button
                        type="button"
                        key={profile.id}
                        className={profile.id === profileState.activeProfileId ? "active" : ""}
                        onClick={() => void switchProfile(profile)}
                        disabled={profileBusy}
                      >
                        <span className="profile-avatar">
                          {profile.avatarDataUrl ? (
                            <img src={profile.avatarDataUrl} alt="" />
                          ) : (
                            profileInitials(profile.name)
                          )}
                        </span>
                        <span className="profile-copy">
                          <strong>{profile.name}</strong>
                          <small>
                            {profile.id === profileState.activeProfileId
                              ? "Active now"
                              : "Separate sites, tabs, and focus"}
                          </small>
                        </span>
                        {profile.id === profileState.activeProfileId && <Icon name="check" />}
                      </button>
                    ))}
                  </div>
                  <div className="profile-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        setProfileEditor("create");
                        setProfileName("");
                      }}
                      disabled={(profileState?.profiles.length ?? 0) >= 8 || profileBusy}
                    >
                      <Icon name="plus" /> New profile
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setProfileEditor("edit");
                        setProfileName(activeProfile?.name ?? "");
                      }}
                      disabled={!activeProfile || profileBusy}
                    >
                      Edit name
                    </button>
                  </div>
                  <div className="profile-picture-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void chooseProfileAvatar()}
                      disabled={!activeProfile || profileBusy}
                    >
                      Choose picture
                    </button>
                    {activeProfile?.avatarDataUrl && (
                      <>
                        <button
                          type="button"
                          className={confirmClearAvatar ? "danger-action" : "quiet"}
                          onClick={() => void clearProfileAvatar()}
                          disabled={profileBusy}
                        >
                          {confirmClearAvatar ? "Confirm remove" : "Remove"}
                        </button>
                        {confirmClearAvatar && (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setConfirmClearAvatar(false)}
                          >
                            Cancel
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className={`profile-load-state${profileLoadError ? " error" : ""}`}>
                  <span className="profile-load-indicator" aria-hidden="true" />
                  <span className="profile-copy" role="status" aria-live="polite">
                    <strong>
                      {profileLoadError ? "Profiles could not load" : "Preparing profiles"}
                    </strong>
                    <small>
                      {profileLoadError ?? "Restoring your local website identities and sessions."}
                    </small>
                  </span>
                  {profileLoadError && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
              <p className="profile-privacy-note">
                Website sign-ins stay inside this profile’s Chromium storage. Coach Browser never
                stores your Google or identity-provider password.
              </p>
            </section>
          </>
        )}
      </nav>

      <aside
        className="workspace-panel"
        aria-hidden={!navigationExpanded}
        inert={!navigationExpanded ? true : undefined}
      >
        <div className="workspace-heading" ref={workspaceHeadingRef}>
          <button
            className="brand-mark workspace-brand-mark"
            type="button"
            onClick={showDashboard}
            aria-label="Open Coach Browser dashboard"
            title="Coach Browser"
            data-action-description={actionHelpText.dashboard}
          >
            <img src={coachLogoUrl} alt="" />
          </button>
          <button
            className="workspace-selector"
            type="button"
            aria-label="Open workspace menu"
            aria-expanded={workspaceMenuOpen}
            data-action-description={actionHelpText.workspaceMenu}
            onClick={() => {
              setConfirmHardDeleteDesktopId(null);
              setWorkspaceMenuOpen((open) => !open);
            }}
          >
            <span className="workspace-title">
              <strong>Coach Browser</strong>
            </span>
            <Icon name="chevron-down" />
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen(false);
                  setProfileEditor(null);
                  setProfileMenuOpen(true);
                }}
              >
                <Icon name="command" />
                Website profiles
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen(false);
                  void showSettings();
                }}
              >
                <Icon name="settings" />
                Settings &amp; appearance
              </button>
              <button type="button" onClick={() => void closeAllTabs()}>
                <Icon name="close" />
                Close all tabs
              </button>
              <button
                type="button"
                onClick={() => {
                  setArchivedDesktopsOpen((open) => !open);
                  setWorkspaceMenuOpen(false);
                  void showSettings();
                }}
              >
                <Icon name="folder" />
                Archived desktops ({workspace.archivedDesktops.length})
              </button>
              <span>Desktop names can be edited beside each name</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="panel-search"
          data-action-description={actionHelpText.searchEverything(searchShortcutLabel)}
          onClick={openCommandPalette}
        >
          <Icon name="search" />
          <span>Search everything</span>
          <kbd>{searchShortcutLabel}</kbd>
        </button>

        {archivedDesktopsOpen && (
          <section className="archived-desktops-panel" data-archived-desktops>
            <header>
              <div>
                <strong>Archived desktops</strong>
                <small>Recover one or remove its record permanently.</small>
              </div>
              <button
                type="button"
                aria-label="Close archived desktops"
                onClick={() => setArchivedDesktopsOpen(false)}
              >
                <Icon name="close" />
              </button>
            </header>
            {workspace.archivedDesktops.length === 0 ? (
              <p>No archived desktops yet.</p>
            ) : (
              <div className="archived-desktop-list">
                {workspace.archivedDesktops.map((desktop) => (
                  <div className="archived-desktop-item" key={desktop.id}>
                    <span className={`desktop-glyph ${desktop.color}`}>
                      <DesktopIconGraphic icon={desktop.icon} color={desktop.color} />
                    </span>
                    <span>
                      <strong>{desktop.name}</strong>
                      <small>Browser activity is retained until permanent deletion</small>
                    </span>
                    <button
                      type="button"
                      data-restore-desktop={desktop.id}
                      onClick={() => restoreDesktopFromArchive(desktop.id)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="archived-hard-delete"
                      data-hard-delete-desktop={desktop.id}
                      onClick={() => hardDeleteDesktopFromArchive(desktop.id)}
                    >
                      {confirmHardDeleteDesktopId === desktop.id
                        ? "Confirm clear browser data"
                        : "Delete permanently"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p>
              Permanent removal clears this desktop's history and closed-tab records. Local notes,
              saved Markdown, Canvas pages, and files are never erased here.
            </p>
          </section>
        )}

        <div className="desktop-list">
          {workspace.desktops
            .slice(0, desktopOverflowOpen ? workspace.desktops.length : 3)
            .map((desktop) => {
              const tabCount = snapshot.tabs.filter(
                (tab) => tabDesktops[tab.id] === desktop.id,
              ).length;
              const linkCount = links.filter((link) =>
                link.desktopId ? link.desktopId === desktop.id : link.folder === desktop.name,
              ).length;
              const active = desktop.id === workspace.activeDesktopId;
              if (editingDesktopId === desktop.id) {
                return (
                  <div className="desktop-item-shell" key={desktop.id}>
                    <form
                      className={
                        active
                          ? "desktop-item desktop-rename-row active"
                          : "desktop-item desktop-rename-row"
                      }
                      data-desktop-id={desktop.id}
                      onSubmit={submitDesktopRename}
                    >
                      <span className={`desktop-glyph ${desktop.color}`}>
                        <DesktopIconGraphic icon={desktop.icon} color={desktop.color} />
                      </span>
                      <input
                        ref={desktopRenameInputRef}
                        value={editingDesktopName}
                        onChange={(event) => setEditingDesktopName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingDesktopId(null);
                          }
                        }}
                        placeholder="Desktop name"
                        maxLength={40}
                        aria-label={`Rename ${desktop.name}`}
                      />
                      <button type="submit" aria-label="Save desktop name">
                        <Icon name="check" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setEditingDesktopId(null)}
                      >
                        <Icon name="close" />
                      </button>
                    </form>
                  </div>
                );
              }
              return (
                <div className="desktop-item-shell" key={desktop.id}>
                  <div
                    className={active ? "desktop-item active" : "desktop-item"}
                    data-desktop-id={desktop.id}
                    data-active-desktop={active ? "true" : undefined}
                    data-action-description={actionHelpText.desktop(desktop.name)}
                  >
                    <button
                      type="button"
                      className="desktop-open-surface"
                      aria-label={`Switch to ${desktop.name}`}
                      aria-current={active ? "page" : undefined}
                      data-action-description={actionHelpText.desktop(desktop.name)}
                      onClick={() => void selectDesktop(desktop.id)}
                    />
                    <button
                      type="button"
                      className="desktop-select"
                      aria-label={`Switch to ${desktop.name}`}
                      data-action-description={actionHelpText.desktop(desktop.name)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void selectDesktop(desktop.id);
                      }}
                    >
                      <span className={`desktop-glyph ${desktop.color}`}>
                        <DesktopIconGraphic icon={desktop.icon} color={desktop.color} />
                      </span>
                    </button>
                    <span className="desktop-copy">
                      <span className="desktop-name-row">
                        <button
                          type="button"
                          className="desktop-name-button"
                          aria-label={`Switch to ${desktop.name}`}
                          data-action-description={actionHelpText.desktop(desktop.name)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void selectDesktop(desktop.id);
                          }}
                        >
                          <strong>{desktop.name}</strong>
                        </button>
                        <button
                          type="button"
                          className="desktop-rename-button"
                          aria-label={`Rename ${desktop.name}`}
                          title={`Rename ${desktop.name}`}
                          data-action-description={actionHelpText.renameDesktop(desktop.name)}
                          onClick={(event) => {
                            event.stopPropagation();
                            beginRenameDesktop(desktop.id);
                          }}
                        >
                          <Icon name="edit" />
                        </button>
                      </span>
                      <button
                        type="button"
                        className="desktop-summary-button"
                        aria-label={`${formatCount(tabCount, "tab")}, ${formatCount(linkCount, "saved link")} in ${desktop.name}`}
                        title={`${formatCount(tabCount, "tab")} · ${formatCount(linkCount, "saved link")}`}
                        data-action-description={actionHelpText.desktop(desktop.name)}
                        onClick={(event) => {
                          event.stopPropagation();
                          void selectDesktop(desktop.id);
                        }}
                      >
                        <small>{tabCount}</small>
                      </button>
                    </span>
                    <button
                      type="button"
                      className="desktop-archive-trigger"
                      data-delete-desktop={desktop.id}
                      aria-label={`Archive ${desktop.name}`}
                      title={`Archive ${desktop.name}`}
                      data-action-description={actionHelpText.archiveDesktop(desktop.name)}
                      onClick={(event) => {
                        event.stopPropagation();
                        showDesktopArchiveActions(desktop.id);
                      }}
                    >
                      <Icon name="folder" />
                    </button>
                  </div>
                  {archiveDesktopId === desktop.id && (
                    <aside className="desktop-archive-popover" data-archive-panel={desktop.id}>
                      <header>
                        <span>
                          <strong>Archive {desktop.name}?</strong>
                          <small>Keep its history and restore it later.</small>
                        </span>
                        <button
                          type="button"
                          aria-label="Cancel desktop archive"
                          onClick={() => setArchiveDesktopId(null)}
                        >
                          <Icon name="close" />
                        </button>
                      </header>
                      {tabCount + linkCount > 0 ? (
                        <p>
                          This desktop still contains {tabCount} open tab{tabCount === 1 ? "" : "s"}
                          {linkCount > 0
                            ? ` and ${linkCount} saved link${linkCount === 1 ? "" : "s"}`
                            : ""}
                          .
                        </p>
                      ) : (
                        <p>This desktop has no open tabs or saved links.</p>
                      )}
                      {tabCount > 0 && (
                        <label>
                          <span>Move open tabs to</span>
                          <select
                            value={archiveMoveTargetId}
                            data-archive-move-target={desktop.id}
                            onChange={(event) => setArchiveMoveTargetId(event.target.value)}
                          >
                            {workspace.desktops
                              .filter((candidate) => candidate.id !== desktop.id)
                              .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      {linkCount > 0 && (
                        <small className="desktop-archive-data-note">
                          Saved links stay attached and return when this desktop is restored.
                        </small>
                      )}
                      <div className="desktop-archive-actions">
                        <button
                          type="button"
                          className="primary"
                          data-archive-desktop={desktop.id}
                          onClick={() => void archiveSelectedDesktop("move")}
                        >
                          Archive desktop
                        </button>
                        {tabCount > 0 && (
                          <button
                            type="button"
                            data-close-and-archive-desktop={desktop.id}
                            onClick={() => void archiveSelectedDesktop("close")}
                          >
                            Close open tabs &amp; archive
                          </button>
                        )}
                      </div>
                    </aside>
                  )}
                </div>
              );
            })}
        </div>
        <div className="desktop-switcher-actions">
          {workspace.desktops.length > 3 && (
            <button
              type="button"
              aria-label={desktopOverflowOpen ? "Show fewer desktops" : "Show more desktops"}
              aria-expanded={desktopOverflowOpen}
              title={desktopOverflowOpen ? "Show fewer desktops" : "More desktops"}
              onClick={() => setDesktopOverflowOpen((open) => !open)}
            >
              <Icon name="chevron-down" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAddingDesktop(true)}
            aria-label="Add desktop"
            title="Add desktop"
            data-action-description={actionHelpText.addDesktop}
          >
            <Icon name="plus" />
          </button>
        </div>
        {addingDesktop && (
          <form className="add-desktop-form" onSubmit={addDesktop}>
            <input
              ref={newDesktopInputRef}
              value={desktopName}
              onChange={(event) => setDesktopName(event.target.value)}
              placeholder={`Desk ${workspace.desktops.length + 1}`}
              maxLength={40}
            />
            <button type="submit" aria-label="Create desktop">
              <Icon name="check" />
            </button>
            <button type="button" aria-label="Cancel" onClick={() => setAddingDesktop(false)}>
              <Icon name="close" />
            </button>
          </form>
        )}

        <div className="focus-navigation">
          <button
            type="button"
            className={surface === "dashboard" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "dashboard" ? "page" : undefined}
            data-action-description={actionHelpText.navigationDashboard}
            onClick={showDashboard}
          >
            <span className="navigation-row-icon dashboard">
              <Icon name="dashboard" />
            </span>
            <strong>Dashboard</strong>
          </button>
          <button
            type="button"
            className={surface === "browser" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "browser" ? "page" : undefined}
            data-action-description={actionHelpText.browse}
            onClick={() => void showBrowser()}
          >
            <span className="navigation-row-icon browse">
              <Icon name="compass" />
            </span>
            <strong>Browse</strong>
          </button>
          <button
            type="button"
            className={surface === "files" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "files" ? "page" : undefined}
            data-action-description={actionHelpText.localFiles}
            aria-label={
              vault
                ? `Files and Inbox, ${activeDesktopFiles?.fileCount ?? 0} files, ${activeDesktopFiles?.inboxCount ?? 0} in Inbox`
                : "Files and Inbox, connect a local folder"
            }
            aria-expanded={surface === "files" && filesSidebarActive}
            onClick={() => {
              if (surface === "files") {
                setFilesSidebarActive((active) => !active);
                return;
              }
              showFiles();
            }}
          >
            <span className="navigation-row-icon files">
              <Icon name="folder" />
            </span>
            <strong>Files &amp; Inbox</strong>
            <b aria-hidden="true">{activeDesktopFiles?.fileCount ?? 0}</b>
          </button>
          <div ref={setWorkspaceSidebarTarget} id="workspace-sidebar-slot" />
          <button
            type="button"
            className={surface === "apps" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "apps" ? "page" : undefined}
            data-action-description={actionHelpText.runnableApps}
            aria-label={
              runnableApps.pomodoro.activeRun
                ? `Runnable apps, running ${runnableApps.pomodoro.activeRun.task}`
                : dailyFlowInboxCount > 0
                  ? `Runnable apps, ${dailyFlowInboxCount} to clarify`
                  : "Runnable apps"
            }
            onClick={showRunnableApps}
          >
            <span className="navigation-row-icon apps">
              <Icon name="apps" />
            </span>
            <strong>Runnable apps</strong>
            <kbd>7</kbd>
          </button>
          <button
            type="button"
            className={libraryOpen ? "navigation-row active" : "navigation-row"}
            aria-current={libraryOpen ? "page" : undefined}
            aria-label={`Libraries, ${links.length} saved links, ${queueCount} queued, ${canvasPages.length} pages`}
            data-action-description="Open saved links, reading queues, and pages"
            onClick={() => void showLibrary()}
          >
            <span className="navigation-row-icon saved">
              <Icon name="library" />
            </span>
            <strong>Libraries</strong>
            <Icon name="arrow-right" />
          </button>
          <button
            type="button"
            className={surface === "settings" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "settings" ? "page" : undefined}
            data-action-description={actionHelpText.settings}
            onClick={() => void showSettings()}
          >
            <span className="navigation-row-icon settings">
              <Icon name="settings" />
            </span>
            <strong>Settings</strong>
          </button>
        </div>
        <div className="workspace-spacer" />
        <button
          type="button"
          className="workspace-profile-button"
          aria-label={activeProfile ? `Open ${activeProfile.name} profile menu` : "Open profiles"}
          aria-expanded={profileMenuOpen}
          data-action-description={actionHelpText.profiles}
          onClick={() => {
            setWorkspaceMenuOpen(false);
            setBrowserMenuOpen(false);
            setCommandOpen(false);
            setProfileEditor(null);
            setProfileMenuOpen((open) => !open);
          }}
        >
          <span className="profile-avatar">
            {activeProfile?.avatarDataUrl ? (
              <img src={activeProfile.avatarDataUrl} alt="" />
            ) : (
              profileInitials(activeProfile?.name ?? "Personal")
            )}
          </span>
          <span className="workspace-profile-copy">
            <small>Website profile</small>
            <strong>{activeProfile?.name ?? "Personal"}</strong>
          </span>
          <Icon name="arrow-right" />
        </button>
        <div className={vault ? "vault-card connected" : "vault-card"}>
          <div className="vault-card-icon">
            <Icon name={vault ? "check" : "sparkle"} />
          </div>
          <div className="vault-card-copy">
            <strong>{vault ? "Local folder connected" : "Connect local folder"}</strong>
            <span>
              {vault
                ? localWorkspace.rootName || "Workspace ready"
                : "Files, notes, Canvas, and links"}
            </span>
          </div>
          {!vault && (
            <button
              type="button"
              data-action-description={actionHelpText.connectObsidian}
              onClick={() => void connectVault(false)}
            >
              Connect
            </button>
          )}
          {vault && <span className="vault-card-status" aria-hidden="true" />}
        </div>
        <hr
          className="navigation-resizer"
          aria-label="Resize navigation"
          aria-orientation="vertical"
          aria-valuemin={MIN_NAVIGATION_WIDTH}
          aria-valuemax={MAX_NAVIGATION_WIDTH}
          aria-valuenow={navigationWidth}
          tabIndex={0}
          onPointerDown={startNavigationResize}
          onKeyDown={resizeNavigationWithKeyboard}
          onDoubleClick={() => setNavigationWidth(DEFAULT_NAVIGATION_WIDTH)}
        />
      </aside>

      {!focusMode && (
        <button
          type="button"
          className={`navigation-collapse-button navigation-mode-toggle ${
            navigationExpanded ? "expanded" : "compact"
          }`}
          aria-label={navigationExpanded ? "Use compact navigation" : "Expand navigation"}
          title={navigationExpanded ? "Use compact navigation" : "Expand navigation"}
          data-action-description={
            navigationExpanded
              ? actionHelpText.compactNavigation
              : "Show navigation labels and details"
          }
          onClick={() => setNavigationView(!navigationExpanded)}
        >
          <span className="navigation-menu-glyph" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      )}

      <section
        className={[
          "content-shell",
          surface === "dashboard" ? "dashboard-content-shell" : "",
          showNewTabSurface ? "new-tab-content home-content" : "",
          captureOpen ? "drawer-open" : "",
          focusMode ? "focus-content" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="tab-strip">
          <button
            className={surface === "dashboard" ? "desktop-context active" : "desktop-context"}
            type="button"
            aria-current={surface === "dashboard" ? "page" : undefined}
            aria-label={actionHelpText.desktopDashboard(activeDesktop?.name ?? "Desk 1")}
            data-action-description={actionHelpText.desktopDashboard(
              activeDesktop?.name ?? "Desk 1",
            )}
            onClick={showDashboard}
          >
            <span className={`favicon desktop-tab-icon ${activeDesktop?.color ?? "violet"}`}>
              <DesktopIconGraphic icon={activeDesktop?.icon} color={activeDesktop?.color} />
            </span>
            <span className="desktop-context-name">{activeDesktop?.name ?? "Desk 1"}</span>
            <span className="desktop-context-count" aria-hidden="true">
              {desktopTabs.length}
            </span>
          </button>
          <button
            className={
              surface === "files"
                ? "desktop-context files-context active"
                : "desktop-context files-context"
            }
            type="button"
            aria-current={surface === "files" ? "page" : undefined}
            aria-label={`Open ${activeDesktop?.name ?? "Desk 1"} files and Inbox`}
            data-action-description={actionHelpText.localFiles}
            onClick={showFiles}
          >
            <span className="favicon desktop-tab-icon violet">
              <Icon name="folder" />
            </span>
            <span className="desktop-context-name">Files</span>
            <span className="desktop-context-count" aria-hidden="true">
              {activeDesktopFiles?.inboxCount ?? 0}
            </span>
          </button>
          <button
            className={
              libraryOpen
                ? "desktop-context libraries-context active"
                : "desktop-context libraries-context"
            }
            type="button"
            aria-current={libraryOpen ? "page" : undefined}
            aria-label="Open Libraries"
            data-action-description="Open saved links, reading queues, and pages"
            onClick={() => void showLibrary()}
          >
            <span className="favicon desktop-tab-icon violet">
              <Icon name="library" />
            </span>
            <span className="desktop-context-name">Libraries</span>
            <span className="desktop-context-count" aria-hidden="true">
              {links.length + canvasPages.length}
            </span>
          </button>
          <div ref={setWorkspaceTabsTarget} id="workspace-tabs-slot" />
          <ul className="tabs-viewport" aria-label="Open tabs">
            {desktopTabs.map((tab) => (
              <li
                key={tab.id}
                draggable
                data-dragging={draggedTabId === tab.id ? "true" : undefined}
                data-drop-placement={
                  tabDropTarget?.tabId === tab.id && draggedTabId && draggedTabId !== tab.id
                    ? tabDropTarget.placement
                    : undefined
                }
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", displayTitle(tab));
                  setDraggedTabId(tab.id);
                }}
                onDragOver={(event) => {
                  if (!draggedTabId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const placement = dropTabPlacement(event);
                  setTabDropTarget((current) =>
                    current?.tabId === tab.id && current.placement === placement
                      ? current
                      : { tabId: tab.id, placement },
                  );
                }}
                onDragLeave={() =>
                  setTabDropTarget((current) => (current?.tabId === tab.id ? null : current))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  void dropTab(tab.id, dropTabPlacement(event));
                }}
                onDragEnd={clearTabDrag}
                className={
                  tab.id === snapshot.activeTabId &&
                  surface !== "dashboard" &&
                  surface !== "library" &&
                  surface !== "files" &&
                  surface !== "queue" &&
                  surface !== "pages" &&
                  surface !== "apps" &&
                  surface !== "settings"
                    ? "browser-tab active"
                    : "browser-tab"
                }
              >
                <button
                  className="tab-select"
                  type="button"
                  aria-keyshortcuts="Control+Shift+ArrowLeft Control+Shift+ArrowRight"
                  onClick={() => void switchTab(tab)}
                  onKeyDown={(event) => {
                    if (!event.ctrlKey || !event.shiftKey) return;
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    void moveTabByStep(tab.id, event.key === "ArrowLeft" ? -1 : 1);
                  }}
                >
                  <span className="favicon">
                    {tab.siteIconDataUrl || siteIcons[siteIconDomainKey(tab.url)] ? (
                      <img
                        src={tab.siteIconDataUrl || siteIcons[siteIconDomainKey(tab.url)]}
                        alt=""
                      />
                    ) : tab.url === "about:blank" ? (
                      <Icon name="sparkle" />
                    ) : (
                      displayHost(tab.url).slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="tab-title">{displayTitle(tab)}</span>
                </button>
                {tab.loading ? (
                  <span className="tab-spinner" />
                ) : (
                  <button
                    type="button"
                    className="tab-close"
                    aria-label={`Close ${displayTitle(tab)}`}
                    onClick={() => void closeTab(tab.id)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            className="new-tab-button"
            type="button"
            onClick={() => void createTab(workspace.activeDesktopId, "home")}
            aria-label="New tab"
          >
            <Icon name="plus" />
          </button>
          <div className="window-drag-space" />
        </header>

        {surface === "browser" && !showNewTabSurface && (
          <form className="browser-toolbar" onSubmit={navigate}>
            <div className="navigation-actions">
              <button
                type="button"
                disabled={!contextualTab?.canGoBack}
                onClick={() => window.lattice.browser.back()}
                aria-label="Back"
              >
                <Icon name="arrow-left" />
              </button>
              <button
                type="button"
                disabled={!contextualTab?.canGoForward}
                onClick={() => window.lattice.browser.forward()}
                aria-label="Forward"
              >
                <Icon name="arrow-right" />
              </button>
              <button
                type="button"
                onClick={() => window.lattice.browser.reload()}
                aria-label="Reload"
              >
                <Icon name="reload" />
              </button>
            </div>
            <label className="omnibox">
              <Icon name={contextualTab?.url.startsWith("https://") ? "lock" : "search"} />
              <span className="sr-only">Web address</span>
              <input
                ref={omniboxRef}
                value={address}
                data-action-description={actionHelpText.addressBar}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Search or enter an address"
                spellCheck={false}
              />
              {address && (
                <button type="button" onClick={() => setAddress("")} aria-label="Clear address">
                  <Icon name="close" />
                </button>
              )}
            </label>
            <button
              className={captureOpen ? "save-page-button active" : "save-page-button"}
              type="button"
              onClick={openCapture}
              disabled={!contextualTab || contextualTab.url === "about:blank"}
            >
              <Icon name="bookmark" />
              <span>Save</span>
            </button>
            <button
              className="focus-toolbar-button"
              type="button"
              aria-pressed={focusMode}
              title="Focus view (Ctrl+Shift+F)"
              onClick={toggleDistractionFree}
            >
              <Icon name="sparkle" />
              <span>Focus</span>
            </button>
            <div className="browser-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="More browser actions"
                aria-expanded={browserMenuOpen}
                disabled={!contextualTab}
                onClick={() => setBrowserMenuOpen((open) => !open)}
              >
                <Icon name="more" />
              </button>
              {browserMenuOpen && contextualTab && (
                <div className="browser-actions-menu">
                  <span>Move tab to</span>
                  {workspace.desktops
                    .filter((desktop) => desktop.id !== workspace.activeDesktopId)
                    .map((desktop) => (
                      <button
                        type="button"
                        key={desktop.id}
                        data-move-tab-to={desktop.id}
                        onClick={() => moveActiveTab(desktop.id)}
                      >
                        <span className={`context-dot ${desktop.color}`} />
                        <span>
                          <strong>{desktop.name}</strong>
                          <small>Keep page open</small>
                        </span>
                      </button>
                    ))}
                  {workspace.desktops.length <= 1 && <p>Create another desktop first</p>}
                </div>
              )}
            </div>
          </form>
        )}

        {surface !== "browser" && surface !== "home" && (
          <header
            className={`surface-toolbar ${surface === "dashboard" ? "dashboard-surface-toolbar" : ""}`}
          >
            <div className="surface-toolbar-context">
              {surface !== "dashboard" && (
                <button type="button" className="surface-back" onClick={showDashboard}>
                  <Icon name="arrow-left" />
                  Dashboard
                </button>
              )}
              <span className="surface-location">
                <Icon
                  name={
                    surface === "dashboard"
                      ? "home"
                      : surface === "files"
                        ? "folder"
                        : surface === "pages"
                          ? "grid"
                          : surface === "apps"
                            ? "timer"
                            : surface === "settings"
                              ? "settings"
                              : surface === "queue"
                                ? "folder"
                                : "bookmark"
                  }
                />
                <span>
                  <strong>
                    {surface === "dashboard"
                      ? `Dashboard - ${activeDesktop?.name ?? "Desktop 1"}`
                      : surfaceDetails[surface].label}
                  </strong>
                  {surface === "dashboard" && (
                    <small className="dashboard-toolbar-greeting">{greeting}</small>
                  )}
                  {surface === "dashboard" && (
                    <div
                      className="dashboard-toolbar-content"
                      ref={setDashboardToolbarContentTarget}
                    />
                  )}
                  {surface !== "dashboard" && <small>{surfaceDetails[surface].description}</small>}
                </span>
              </span>
            </div>
            {surface === "dashboard" ? (
              <button
                type="button"
                className="dashboard-toolbar-customize"
                aria-expanded={dashboardCustomizing}
                data-action-description={actionHelpText.dashboardCustomization(
                  dashboardCustomizing,
                )}
                onClick={() => setDashboardCustomizing((open) => !open)}
              >
                <Icon name="settings" />
                Customize
              </button>
            ) : (
              <div className="surface-toolbar-actions">
                <button type="button" onClick={() => void showBrowser()}>
                  <Icon name="globe" />
                  Browse
                </button>
                <button
                  type="button"
                  className="focus-toolbar-button"
                  aria-pressed={focusMode}
                  onClick={toggleDistractionFree}
                >
                  <Icon name="sparkle" />
                  Focus view
                  <kbd>⌃⇧F</kbd>
                </button>
              </div>
            )}
          </header>
        )}

        <header className="focus-session-bar" role="toolbar" aria-label="Focus view controls">
          <span className="focus-session-mark">
            <Icon name="sparkle" />
          </span>
          <span className="focus-session-copy">
            <strong>{focusIntention || surfaceDetails[surface].label}</strong>
            <small>
              Focus view ·{" "}
              {surface === "browser" && contextualTab
                ? displayTitle(contextualTab)
                : surfaceDetails[surface].description}
            </small>
          </span>
          <div className="focus-session-actions">
            {surface === "browser" && contextualTab?.url !== "about:blank" && (
              <button type="button" onClick={openCapture}>
                <Icon name="bookmark" />
                Save
              </button>
            )}
            <button
              type="button"
              className="exit-focus-button"
              onClick={() => setDistractionFree(false)}
            >
              Show navigation
              <kbd>Esc</kbd>
            </button>
          </div>
        </header>

        <div className="content-stage">
          <main ref={webStageRef} className="web-stage">
            <div ref={viewportRef} className="native-view-slot">
              Native WebContentsView surface
            </div>
            {showNewTabSurface && (
              <div className="trusted-surface new-tab-surface">
                <nav className="new-tab-page-actions" aria-label="New tab actions">
                  <button type="button" onClick={() => void showBrowser()}>
                    <Icon name="globe" />
                    Browse
                  </button>
                  <button
                    type="button"
                    aria-pressed={focusMode}
                    title="Focus view (Ctrl+Shift+F)"
                    onClick={toggleDistractionFree}
                  >
                    <Icon name="sparkle" />
                    Focus view
                  </button>
                  <button
                    type="button"
                    className="new-tab-appearance"
                    aria-label={`Current theme: ${activeThemeName}. Switch to ${nextThemeName}`}
                    title={`Switch to ${nextThemeName}`}
                    onClick={cycleTheme}
                  >
                    <Icon name={themeSwitcherIcon} />
                  </button>
                </nav>
                <section className="new-tab-search-zone" aria-labelledby="new-tab-heading">
                  <header className="new-tab-heading">
                    <span className="new-tab-kicker">
                      <Icon name="sparkle" /> {greeting}
                    </span>
                    <h1 id="new-tab-heading">
                      What will we <em>explore</em> today?
                    </h1>
                    <p>
                      One place to search this desk, open the web, find a file, or keep a thought.
                    </p>
                  </header>

                  <form
                    className={latticeNoteMode ? "new-tab-search note-mode" : "new-tab-search"}
                    onSubmit={navigateFromFocus}
                  >
                    <Icon name={latticeNoteMode ? "edit" : "search"} />
                    {latticeNoteMode ? (
                      <textarea
                        ref={(element) => {
                          latticeBarRef.current = element;
                        }}
                        value={homeQuery}
                        data-action-description={actionHelpText.latticeNoteEditor}
                        onChange={(event) => setHomeQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setLatticeNoteMode(false);
                          }
                        }}
                        maxLength={2000}
                        placeholder="Write the thought before it disappears…"
                        aria-label="Note for your Daily Flow Inbox"
                      />
                    ) : (
                      <input
                        ref={(element) => {
                          latticeBarRef.current = element;
                        }}
                        value={homeQuery}
                        data-action-description={actionHelpText.newTabSearch}
                        onChange={(event) => setHomeQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowDown" && homeQuery.trim()) {
                            event.preventDefault();
                            focusFirstLatticeAction();
                          } else if (event.key === "Escape" && homeQuery) {
                            event.preventDefault();
                            setHomeQuery("");
                          } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            setLatticeNoteMode(true);
                          }
                        }}
                        placeholder="Search this desk, the web, files, or write a note…"
                        aria-label="Search this desk, the web, files, or write a note"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    )}
                    {homeQuery && (
                      <button
                        type="button"
                        className="lattice-bar-clear"
                        aria-label="Clear Lattice Bar"
                        onClick={() => {
                          setHomeQuery("");
                          setLatticeNoteMode(false);
                          latticeBarRef.current?.focus();
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                    <button
                      type="submit"
                      className="lattice-bar-submit"
                      data-action-description={
                        latticeNoteMode
                          ? actionHelpText.captureQuickNote
                          : actionHelpText.newTabSearchButton
                      }
                      disabled={
                        !homeQuery.trim() || capturingQuickNote || Boolean(intentResolution.error)
                      }
                    >
                      {capturingQuickNote
                        ? "Saving…"
                        : latticeNoteMode
                          ? "Save note"
                          : intentResolution.intent.kind === "url" ||
                              (intentResolution.intent.kind === "site" &&
                                !intentResolution.intent.query)
                            ? "Open"
                            : "Search"}
                      <Icon name="arrow-right" />
                    </button>
                  </form>

                  {latticeNoteMode && (
                    <div className="lattice-note-context" aria-live="polite">
                      <span>
                        <Icon name="library" /> Saving to Daily Flow Inbox ·{" "}
                        {quickCaptureInboxCount} waiting
                      </span>
                      <span>
                        <kbd>Ctrl Enter</kbd> to save
                        <button type="button" onClick={() => setLatticeNoteMode(false)}>
                          Back to search
                        </button>
                      </span>
                    </div>
                  )}

                  {!homeQuery.trim() && !latticeNoteMode && (
                    <nav className="new-tab-shortcuts" aria-label="Website shortcuts">
                      {NEW_TAB_SHORTCUTS.map((shortcut) => (
                        <button
                          type="button"
                          key={shortcut.id}
                          className={`new-tab-shortcut ${shortcut.id}`}
                          data-action-description={actionHelpText.newTabShortcut(shortcut.label)}
                          onClick={() => void openUrl(shortcut.url)}
                        >
                          <span className="new-tab-shortcut-mark" aria-hidden="true">
                            {shortcut.mark}
                          </span>
                          <span>{shortcut.label}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="new-tab-shortcut manage"
                        data-action-description={actionHelpText.manageNewTabShortcuts}
                        onClick={() => void showLibrary()}
                      >
                        <span className="new-tab-shortcut-mark" aria-hidden="true">
                          <Icon name="plus" />
                        </span>
                        <span>Add shortcut</span>
                      </button>
                    </nav>
                  )}

                  {homeQuery.trim() && !latticeNoteMode && (
                    <section
                      className="lattice-bar-results"
                      aria-live="polite"
                      aria-label="Lattice Bar results"
                      data-active-result={activeLatticeResultIndex}
                      onKeyDown={handleLatticeResultsKeyDown}
                    >
                      <div className="lattice-result-scope">
                        <span>Searching</span>
                        <button
                          type="button"
                          className={!searchEverywhere ? "active" : ""}
                          aria-pressed={!searchEverywhere}
                          onClick={() => setSearchEverywhere(false)}
                        >
                          {activeDesktop?.name ?? "Current desk"}
                        </button>
                        <button
                          type="button"
                          className={searchEverywhere ? "active" : ""}
                          aria-pressed={searchEverywhere}
                          onClick={() => setSearchEverywhere(true)}
                        >
                          Everywhere
                        </button>
                        <small>Local results stay on this device</small>
                      </div>

                      {intentResolution.error && (
                        <div className="lattice-result-error" role="alert">
                          <Icon name="lock" />
                          <span>
                            <strong>That address cannot be opened</strong>
                            <small>{intentResolution.error}</small>
                          </span>
                        </div>
                      )}

                      <section className="lattice-result-section" data-lattice-section="current">
                        <header>
                          <span>
                            <Icon name="desktop" />
                            <strong>
                              {searchEverywhere
                                ? "Your Lattice"
                                : (activeDesktop?.name ?? "Current desk")}
                            </strong>
                          </span>
                          <small>{formatCount(rankedLocalResults.length, "match")}</small>
                        </header>
                        {visibleLocalResults.length > 0 ? (
                          <div className="lattice-result-list">
                            {visibleLocalResults.map((suggestion) => (
                              <button
                                type="button"
                                key={suggestion.id}
                                data-lattice-action
                                data-lattice-result={suggestion.kind}
                                data-action-description={actionHelpText.continueNewTabItem(
                                  suggestion.label,
                                )}
                                onClick={() => void activateNewTabSuggestion(suggestion)}
                              >
                                <span
                                  className={`lattice-result-icon ${suggestion.kind}`}
                                  aria-hidden="true"
                                >
                                  <Icon
                                    name={
                                      suggestion.kind === "tab" || suggestion.kind === "history"
                                        ? "globe"
                                        : suggestion.kind === "link"
                                          ? "bookmark"
                                          : "grid"
                                    }
                                  />
                                </span>
                                <span>
                                  <strong>{suggestion.label}</strong>
                                  <small>{suggestion.detail}</small>
                                </span>
                                <Icon name="arrow-right" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="lattice-result-empty">
                            No local matches yet. Your web action is ready below.
                          </p>
                        )}
                        {rankedLocalResults.length > 3 && (
                          <button
                            type="button"
                            className="lattice-show-more"
                            data-lattice-action
                            onClick={() => setShowAllLatticeResults((shown) => !shown)}
                          >
                            {showAllLatticeResults
                              ? "Show top 3"
                              : `Show ${Math.min(12, rankedLocalResults.length)} matches`}
                            <Icon name={showAllLatticeResults ? "arrow-left" : "arrow-right"} />
                          </button>
                        )}
                      </section>

                      {!intentResolution.error && intentResolution.intent.kind !== "empty" && (
                        <section className="lattice-result-section" data-lattice-section="web">
                          <header>
                            <span>
                              <Icon name="globe" />
                              <strong>Web &amp; websites</strong>
                            </span>
                            <small>
                              {intentResolution.intent.kind === "web"
                                ? intentResolution.intent.provider.name
                                : "Smart destination"}
                            </small>
                          </header>
                          <div className="lattice-web-primary">
                            <button
                              type="button"
                              data-lattice-action
                              data-lattice-result="web"
                              data-action-description={actionHelpText.openWebResult(
                                intentResolution.intent.label,
                              )}
                              onClick={() => void activateHomeIntent()}
                            >
                              <span
                                className={`lattice-result-icon ${intentResolution.intent.kind}`}
                                aria-hidden="true"
                              >
                                {intentResolution.intent.kind === "site" ? (
                                  intentResolution.intent.site.name.charAt(0)
                                ) : (
                                  <Icon name="search" />
                                )}
                              </span>
                              <span>
                                <strong>{intentResolution.intent.label}</strong>
                                <small>
                                  {intentResolution.intent.kind === "site"
                                    ? `${intentResolution.intent.site.description} · ${intentResolution.intent.site.domain.replace(/^www\./, "")}`
                                    : intentResolution.intent.kind === "web"
                                      ? `Continue securely on ${intentResolution.intent.provider.name}`
                                      : `Open ${new URL(intentResolution.intent.url).hostname}`}
                                </small>
                              </span>
                              <Icon name="arrow-right" />
                            </button>
                          </div>
                          {websiteMatches.length > 0 && (
                            <div className="lattice-website-grid">
                              {websiteMatches.map((match) => (
                                <button
                                  type="button"
                                  key={match.id}
                                  data-lattice-action
                                  data-action-description={actionHelpText.openWebsite(match.label)}
                                  onClick={() => void activateWebsiteMatch(match)}
                                >
                                  <span aria-hidden="true">{match.label.charAt(0)}</span>
                                  <span>
                                    <strong>{match.label}</strong>
                                    <small>{match.detail}</small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </section>
                      )}

                      {quickAccessMatches.length > 0 && (
                        <section
                          className="lattice-result-section"
                          data-lattice-section="quick-access"
                        >
                          <header>
                            <span>
                              <Icon name="sparkle" />
                              <strong>Quick access</strong>
                            </span>
                            <small>Relevant tools</small>
                          </header>
                          <div className="lattice-quick-access-grid">
                            {quickAccessMatches.map((match) => (
                              <button
                                type="button"
                                key={match.id}
                                data-lattice-action
                                data-action-description={actionHelpText.quickAccess(match.label)}
                                onClick={() => activateQuickAccess(match)}
                              >
                                <span
                                  className={`new-tab-app-icon ${match.accent}`}
                                  aria-hidden="true"
                                >
                                  {match.target === "wealth-lab" ? (
                                    <b>₱</b>
                                  ) : (
                                    <Icon name={match.icon} />
                                  )}
                                </span>
                                <span>
                                  <strong>{match.label}</strong>
                                  <small>{match.detail}</small>
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      {rankedFileResults.length > 0 && (
                        <section className="lattice-result-section" data-lattice-section="files">
                          <header>
                            <span>
                              <Icon name="folder" />
                              <strong>Files in your connected vault</strong>
                            </span>
                            <small>Permission-scoped</small>
                          </header>
                          <div className="lattice-result-list compact">
                            {rankedFileResults.map((suggestion) => (
                              <button
                                type="button"
                                key={suggestion.id}
                                data-lattice-action
                                data-lattice-result="file"
                                data-action-description={actionHelpText.revealSearchFile(
                                  suggestion.label,
                                )}
                                onClick={() => void activateNewTabSuggestion(suggestion)}
                              >
                                <span className="lattice-result-icon file" aria-hidden="true">
                                  <Icon name="folder" />
                                </span>
                                <span>
                                  <strong>{suggestion.label}</strong>
                                  <small>{suggestion.detail}</small>
                                </span>
                                <Icon name="arrow-right" />
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      <button
                        type="button"
                        className="lattice-save-note-action"
                        data-lattice-action
                        data-action-description={actionHelpText.saveSearchAsNote(homeQuery.trim())}
                        onClick={() => setLatticeNoteMode(true)}
                      >
                        <span className="lattice-result-icon note" aria-hidden="true">
                          <Icon name="edit" />
                        </span>
                        <span>
                          <strong>Save “{homeQuery.trim().slice(0, 100)}” as a note</strong>
                          <small>
                            Keep it privately in your Daily Flow Inbox instead of searching
                          </small>
                        </span>
                        <kbd>Ctrl Enter</kbd>
                      </button>
                    </section>
                  )}
                </section>

                {!homeQuery.trim() && !latticeNoteMode && (
                  <section className="new-tab-overview-grid" aria-label="New tab launchpad">
                    <article className="new-tab-overview-card new-tab-continue-card">
                      <header>
                        <h2>Continue where you left off</h2>
                        <button
                          type="button"
                          data-action-description={actionHelpText.viewNewTabHistory}
                          onClick={showDashboard}
                        >
                          View all
                        </button>
                      </header>
                      <div className="new-tab-continue-list">
                        {newTabContinueSuggestions.length > 0 ? (
                          newTabContinueSuggestions.map((suggestion) => (
                            <button
                              type="button"
                              key={suggestion.id}
                              data-action-description={actionHelpText.continueNewTabItem(
                                suggestion.label,
                              )}
                              onClick={() => void activateNewTabSuggestion(suggestion)}
                            >
                              <span
                                className={`new-tab-continue-icon ${suggestion.kind}`}
                                aria-hidden="true"
                              >
                                <Icon
                                  name={
                                    suggestion.kind === "tab" || suggestion.kind === "history"
                                      ? "globe"
                                      : suggestion.kind === "link"
                                        ? "bookmark"
                                        : suggestion.kind === "canvas"
                                          ? "grid"
                                          : "folder"
                                  }
                                />
                              </span>
                              <span>
                                <strong>{suggestion.label}</strong>
                                <small>{suggestion.detail}</small>
                              </span>
                              <Icon name="arrow-right" />
                            </button>
                          ))
                        ) : (
                          <button
                            type="button"
                            className="new-tab-continue-empty"
                            data-action-description={actionHelpText.browse}
                            onClick={() => void showBrowser()}
                          >
                            <span className="new-tab-continue-icon tab" aria-hidden="true">
                              <Icon name="globe" />
                            </span>
                            <span>
                              <strong>Start exploring</strong>
                              <small>Your recent tabs and pages will appear here</small>
                            </span>
                            <Icon name="arrow-right" />
                          </button>
                        )}
                      </div>
                    </article>

                    <article className="new-tab-overview-card new-tab-quick-access-card">
                      <header>
                        <h2>Quick access</h2>
                      </header>
                      <div className="new-tab-quick-access-grid">
                        <button
                          type="button"
                          data-action-description={actionHelpText.quickAccess("Daily Flow")}
                          onClick={() => showRunnableApp("daily-flow")}
                        >
                          <span className="new-tab-app-icon app daily-flow" aria-hidden="true">
                            <Icon name="sparkle" />
                          </span>
                          <strong>Daily Flow</strong>
                        </button>
                        <button
                          type="button"
                          data-action-description={actionHelpText.quickAccess("Pomodoro")}
                          onClick={() => showRunnableApp("pomodoro")}
                        >
                          <span className="new-tab-app-icon app pomodoro" aria-hidden="true">
                            <Icon name="timer" />
                          </span>
                          <strong>Pomodoro</strong>
                        </button>
                        <button
                          type="button"
                          data-action-description={actionHelpText.quickAccess("Wealth Lab")}
                          onClick={() => showRunnableApp("wealth-lab")}
                        >
                          <span className="new-tab-app-icon app wealth-lab" aria-hidden="true">
                            <b>₱</b>
                          </span>
                          <strong>Wealth Lab</strong>
                        </button>
                        <button
                          type="button"
                          data-action-description={actionHelpText.quickAccess("Saved links")}
                          onClick={() => void showLibrary()}
                        >
                          <span className="new-tab-app-icon link" aria-hidden="true">
                            <Icon name="bookmark" />
                          </span>
                          <strong>Saved links</strong>
                        </button>
                        <button
                          type="button"
                          data-action-description={actionHelpText.quickAccess("Canvas pages")}
                          onClick={() => void showCanvasPages()}
                        >
                          <span className="new-tab-app-icon canvas" aria-hidden="true">
                            <Icon name="grid" />
                          </span>
                          <strong>Canvas pages</strong>
                        </button>
                        <button
                          type="button"
                          data-action-description={actionHelpText.quickAccess("Reading queue")}
                          onClick={() => void showReadingQueue()}
                        >
                          <span className="new-tab-app-icon queue" aria-hidden="true">
                            <Icon name="library" />
                          </span>
                          <strong>Reading queue</strong>
                        </button>
                      </div>
                    </article>
                  </section>
                )}
              </div>
            )}

            {surface === "dashboard" && (
              <DashboardSurface
                greeting={greeting}
                showGreeting={false}
                toolbarContentTarget={dashboardToolbarContentTarget}
                desktopName={activeDesktop?.name ?? "Workspace"}
                desktopIcon={activeDesktop?.icon}
                customizing={dashboardCustomizing}
                onCustomizingChange={setDashboardCustomizing}
                onRenameDesktop={renameActiveDesktopFromDashboard}
                onDesktopIconChange={setActiveDesktopIcon}
                openTabs={desktopTabs}
                activeTabId={snapshot.activeTabId}
                tabPreviews={dashboardTabPreviews}
                tabPreviewStatuses={dashboardTabPreviewStatuses}
                recentlyClosed={recentlyClosedTabs.filter(
                  (item) => item.desktopId === workspace.activeDesktopId,
                )}
                history={browserHistory.filter(
                  (item) => item.desktopId === workspace.activeDesktopId,
                )}
                savedLinks={visibleLinks}
                canvasPages={canvasPages}
                desktopFiles={activeDesktopFiles}
                onOpenTab={(tab) => void switchTab(tab)}
                onCloseTab={(tab) => void closeTab(tab.id)}
                onNewTab={() => void createTab(workspace.activeDesktopId, "home")}
                onRestoreClosed={(item) => {
                  void restoreClosedTabs(
                    [{ tab: item.tab, desktopId: item.desktopId }],
                    item.tab.id,
                  ).then(() =>
                    setRecentlyClosedTabs((current) =>
                      current.filter((entry) => entry.closedAt !== item.closedAt),
                    ),
                  );
                }}
                onOpenUrl={(url) => void openUrl(url, true)}
                onOpenApp={(id) => showRunnableApp(id)}
                onOpenCanvas={(id) => void showCanvasPages(id)}
                onOpenFiles={showFiles}
                onSearchTabContents={(tabIds, query) =>
                  window.lattice.browser.searchTabContents(tabIds, query)
                }
              />
            )}

            {surface === "files" && (
              <LocalFilesSurface
                sidebarTarget={navigationExpanded && !focusMode ? workspaceSidebarTarget : null}
                sidebarVisible={filesSidebarActive}
                onShowSidebar={() => setFilesSidebarActive(true)}
                tabsTarget={!focusMode ? workspaceTabsTarget : null}
                browserTabs={desktopTabs}
                sourceTab={contextualTab}
                onSourceViewport={setWorkspaceSourceViewport}
                onSourceTab={async (id) => {
                  if (!desktopTabs.some((tab) => tab.id === id)) return;
                  const scope = researchScope;
                  const next = await window.lattice.browser.switchTab(id);
                  if (researchScopeRef.current === scope) setBrowserSnapshot(next);
                }}
                onResearchUrl={async (input) => {
                  const url = new URL(input);
                  if (url.protocol !== "https:" || url.username || url.password)
                    throw new Error("Use HTTPS.");
                  const existing = desktopTabs.find((tab) => tab.url === url.href);
                  const scope = researchScope;
                  const next = existing
                    ? await window.lattice.browser.switchTab(existing.id)
                    : await window.lattice.browser.createTab(url.href);
                  if (researchScopeRef.current === scope) setBrowserSnapshot(next);
                }}
                onFocus={toggleDistractionFree}
                onOpenApp={showRunnableApp}
                sessionKey={`${profileState?.activeProfileId ?? "pending"}:${vault?.id ?? "disconnected"}`}
                onSettings={() => setSurface("settings")}
                onOpenUrl={(url) => void openUrl(url, true)}
                desktopId={workspace.activeDesktopId}
                desktopName={activeDesktop?.name ?? "Desktop 1"}
                workspaceName={localWorkspace.rootName}
                connected={Boolean(vault)}
                busy={localWorkspaceBusy}
                onConnect={() => void connectVault(false)}
                onRefresh={() => void refreshLocalWorkspace()}
                onReveal={() => {
                  void window.lattice.localWorkspace
                    .revealDesktop(workspace.activeDesktopId)
                    .catch((error) =>
                      setStatus(error instanceof Error ? error.message : String(error)),
                    );
                }}
              />
            )}

            {false && (
              <div className="trusted-surface home-surface">
                <div className="home-hero">
                  <span className="hero-kicker">
                    <Icon name="sparkle" /> {greeting}
                  </span>
                  <h1>Let&apos;s focus on what matters.</h1>
                  <p>One meaningful next step. Everything else can wait.</p>
                  <label className="focus-intention">
                    <span>What matters now?</span>
                    <input
                      value={focusIntention}
                      onChange={(event) => setFocusIntention(event.target.value)}
                      onBlur={() =>
                        setFocusIntention((current) => normalizeFocusIntention(current))
                      }
                      maxLength={MAX_FOCUS_INTENTION_LENGTH}
                      placeholder="Name one outcome — optional"
                    />
                    <small>Kept only on this computer</small>
                  </label>
                </div>

                <section className="home-dashboard" aria-label="Your focus dashboard">
                  <div className="home-dashboard-stack">
                    <button
                      type="button"
                      className="home-panel-card home-context-card primary-context"
                      data-home-card="recent-thread"
                      onClick={() => {
                        if (resumableTab) {
                          void switchTab(resumableTab as BrowserState).then(() =>
                            setDistractionFree(true),
                          );
                        } else void createTab();
                      }}
                    >
                      <span className="home-card-label">Resume recent thread</span>
                      <span className="home-context-main">
                        <span className="home-card-icon violet">
                          <Icon name="globe" />
                        </span>
                        <span>
                          <strong>
                            {resumableTab
                              ? displayTitle(resumableTab as BrowserState)
                              : "Start a focused search"}
                          </strong>
                          <small>
                            {resumableTab
                              ? `${displayHost(resumableTab?.url ?? "about:blank")} · ${activeDesktop?.name ?? "Workspace"}`
                              : "Your next useful thread begins here"}
                          </small>
                        </span>
                        <Icon name="arrow-right" />
                      </span>
                      <em>{resumableTab ? "Ready to continue" : "No open website yet"}</em>
                    </button>

                    <button
                      type="button"
                      className="home-panel-card home-context-card"
                      data-home-card="canvas"
                      onClick={() => void showCanvasPages(recentCanvasPage?.id ?? null)}
                    >
                      <span className="home-card-label">Canvas / workspace</span>
                      <span className="home-context-main">
                        <span className="home-card-icon amber">
                          <Icon name="grid" />
                        </span>
                        <span>
                          <strong>{recentCanvasPage?.title ?? "Create a connected canvas"}</strong>
                          <small>
                            {recentCanvasPage
                              ? `${recentCanvasPage?.nodeCount ?? 0} objects · Edited ${relativeDate(recentCanvasPage?.updatedAt ?? "")}`
                              : "Websites, notes, files, and ideas on one page"}
                          </small>
                        </span>
                        <Icon name="arrow-right" />
                      </span>
                    </button>
                  </div>

                  <article className="home-panel-card home-list-card" data-home-card="today-focus">
                    <header>
                      <span className="home-card-icon sunlit">
                        <Icon name="sparkle" />
                      </span>
                      <span>
                        <small>Today&apos;s focus</small>
                        <strong>{focusIntention || "Choose up to three outcomes"}</strong>
                      </span>
                    </header>
                    <div className="home-task-list">
                      {todayFocusItems.length > 0 ? (
                        todayFocusItems.map((item) => (
                          <button
                            type="button"
                            className={item.now ? "home-task-row now" : "home-task-row"}
                            key={item.id}
                            onClick={() => showRunnableApp("daily-flow")}
                          >
                            <span className="home-task-marker" />
                            <span>{item.text}</span>
                            {item.now && <em>Now</em>}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className="home-list-empty"
                          onClick={() => showRunnableApp("daily-flow")}
                        >
                          <span className="home-task-marker" />
                          <span>Choose today&apos;s first small task in Daily Flow</span>
                          <Icon name="arrow-right" />
                        </button>
                      )}
                    </div>
                    <footer>
                      <span>{todayFocusItems.length} of 3 chosen</span>
                      <button type="button" onClick={() => showRunnableApp("daily-flow")}>
                        Open Daily Flow <Icon name="arrow-right" />
                      </button>
                    </footer>
                  </article>

                  <article
                    className="home-panel-card home-list-card"
                    data-home-card="reading-queue"
                  >
                    <header>
                      <span className="home-card-icon cyan">
                        <Icon name="bookmark" />
                      </span>
                      <span>
                        <small>Reading queue</small>
                        <strong>
                          {queueCount > 0 ? "Worth returning to" : "Nothing waiting for you"}
                        </strong>
                      </span>
                    </header>
                    <div className="home-reading-list">
                      {queuePreview.length > 0 ? (
                        queuePreview.map((link) => (
                          <button
                            type="button"
                            className="home-reading-row"
                            key={link.id}
                            onClick={() => void openUrl(link.url, true)}
                          >
                            <span className="home-reading-thumbnail">
                              <Icon name="globe" />
                            </span>
                            <span>
                              <strong>{link.title}</strong>
                              <small>{displayHost(link.url)}</small>
                            </span>
                            <Icon name="arrow-right" />
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className="home-list-empty"
                          onClick={showReadingQueue}
                        >
                          <span className="home-card-icon cyan">
                            <Icon name="bookmark" />
                          </span>
                          <span>Save only what deserves another look</span>
                          <Icon name="arrow-right" />
                        </button>
                      )}
                    </div>
                    <footer>
                      <span>{queueCount} queued</span>
                      <button type="button" onClick={showReadingQueue}>
                        See all <Icon name="arrow-right" />
                      </button>
                    </footer>
                  </article>
                </section>

                <div className="home-privacy-card">
                  <span className="home-card-icon violet">
                    <Icon name="lock" />
                  </span>
                  <span>
                    <strong>Private by design. Always local.</strong>
                    <small>
                      Your data stays on this device. Coach Browser never sees or stores your
                      content.
                    </small>
                  </span>
                  <em>Local-first</em>
                </div>
              </div>
            )}

            {(surface === "library" || surface === "queue") && (
              <div className="trusted-surface library-surface">
                {libraryNavigation}
                <header className="library-header">
                  <div>
                    <span className="eyebrow">
                      {surface === "queue" ? "Read with intention" : "Local library"}
                    </span>
                    <h1>{surface === "queue" ? "Reading queue" : "Saved links"}</h1>
                    <p>
                      {surface === "queue"
                        ? `${visibleLinks.length} unread across all desktops`
                        : `${activeDesktop?.name} · ${visibleLinks.length} items`}
                    </p>
                  </div>
                  <div className="library-actions">
                    <label>
                      <Icon name="search" />
                      <input
                        value={libraryQuery}
                        onChange={(event) => setLibraryQuery(event.target.value)}
                        placeholder={
                          surface === "queue" ? "Filter reading queue" : "Filter saved links"
                        }
                      />
                    </label>
                    {!vault && (
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void connectVault(false)}
                      >
                        Connect local folder
                      </button>
                    )}
                  </div>
                </header>
                {!vault ? (
                  <div className="empty-library">
                    <span className="empty-icon">
                      <Icon name="library" />
                    </span>
                    <h2>Your local library begins here</h2>
                    <p>Connect a local folder, then save any page with your own description.</p>
                    <div>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void connectVault(false)}
                      >
                        Choose local folder
                      </button>
                      <button type="button" onClick={() => void connectVault(true)}>
                        Try disposable folder
                      </button>
                    </div>
                  </div>
                ) : visibleLinks.length === 0 ? (
                  <div className="empty-library compact">
                    <span className="empty-icon">
                      <Icon name={surface === "queue" ? "check" : "bookmark"} />
                    </span>
                    <h2>
                      {surface === "queue"
                        ? "Your reading queue is clear"
                        : "No saved links in this desktop"}
                    </h2>
                    <p>
                      {surface === "queue"
                        ? "Queue a saved page when you want to return to it with focus."
                        : "Browse to a useful page and press Save."}
                    </p>
                  </div>
                ) : (
                  <div className="link-grid">
                    {visibleLinks.map((link) => (
                      <article
                        className={
                          link.readingStatus === "queued" ? "link-card queued" : "link-card"
                        }
                        key={`${link.id}-${link.relativePath}`}
                      >
                        {(() => {
                          const incoming = referenceIndex.entries.filter(
                            (entry) =>
                              entry.targetKey === urlReferenceKey(link.url) &&
                              !(entry.source.kind === "saved-link" && entry.source.id === link.id),
                          );
                          return incoming.length > 0 ? (
                            <div className="backlink-summary">
                              <span className="backlink-count">
                                {incoming.length} incoming{" "}
                                {incoming.length === 1 ? "link" : "links"}
                              </span>
                              <small>
                                From {incoming.map((entry) => entry.source.title).join(", ")}
                              </small>
                            </div>
                          ) : null;
                        })()}
                        {editingLinkId === link.id ? (
                          <form className="link-edit-form" onSubmit={saveLinkMetadata}>
                            <label>
                              <span>Title</span>
                              <input
                                value={editingLinkTitle}
                                onChange={(event) => setEditingLinkTitle(event.target.value)}
                                maxLength={200}
                                required
                                aria-label="Saved link title"
                              />
                            </label>
                            <label>
                              <span>Description</span>
                              <textarea
                                value={editingLinkDescription}
                                onChange={(event) => setEditingLinkDescription(event.target.value)}
                                maxLength={4000}
                                rows={3}
                                aria-label="Saved link description"
                              />
                            </label>
                            <div>
                              <button
                                type="submit"
                                disabled={updatingLinkId === link.id || !editingLinkTitle.trim()}
                              >
                                Save changes
                              </button>
                              <button type="button" onClick={cancelEditingLink}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="link-main"
                            onClick={() => void openUrl(link.url, true)}
                          >
                            <span className="link-domain">
                              <span>{displayHost(link.url).slice(0, 1).toUpperCase()}</span>
                              {displayHost(link.url)}
                            </span>
                            <h2>{link.title}</h2>
                            <p>{link.description || "No description added."}</p>
                          </button>
                        )}
                        <footer>
                          <span>
                            <Icon name="folder" />
                            {link.folder || "Saved Links"}
                          </span>
                          <div className="link-card-actions">
                            {editingLinkId !== link.id && (
                              <>
                                <button type="button" onClick={() => beginEditingLink(link)}>
                                  <Icon name="edit" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  aria-label="Open saved link in Obsidian"
                                  onClick={() => void openLinkInObsidian(link)}
                                  disabled={handoffLinkId === link.id}
                                >
                                  <Icon name="sparkle" />
                                  Obsidian
                                </button>
                                <button
                                  type="button"
                                  className="icon-only"
                                  aria-label="Show saved note in folder"
                                  title="Show saved note in folder"
                                  onClick={() => void revealSavedLink(link)}
                                  disabled={handoffLinkId === link.id}
                                >
                                  <Icon name="folder" />
                                </button>
                                <button
                                  type="button"
                                  className="icon-only destructive-link-action"
                                  aria-label="Move saved note to Lattice Trash"
                                  title="Move to Lattice Trash"
                                  onClick={() => void trashSavedLink(link)}
                                  disabled={updatingLinkId === link.id}
                                >
                                  <Icon name="trash" />
                                </button>
                              </>
                            )}
                            {link.readingStatus === "queued" ? (
                              <button
                                type="button"
                                onClick={() => void updateReadingStatus(link, "read")}
                                disabled={updatingLinkId === link.id || editingLinkId === link.id}
                              >
                                <Icon name="check" />
                                Mark read
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void updateReadingStatus(link, "queued")}
                                disabled={updatingLinkId === link.id || editingLinkId === link.id}
                              >
                                <Icon name="bookmark" />
                                {link.readingStatus === "read" ? "Read again" : "Read later"}
                              </button>
                            )}
                            <time>{relativeDate(link.queuedAt || link.savedAt)}</time>
                          </div>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {surface === "pages" && (
              <CanvasWorkspace
                navigation={libraryNavigation}
                vault={vault}
                pages={canvasPages}
                referenceIndex={referenceIndex}
                initialPageId={requestedCanvasPageId}
                onPagesChange={setCanvasPages}
                refreshReferences={async () =>
                  setReferenceIndex(await window.lattice.vault.referenceIndex())
                }
                connectVault={() => connectVault(false)}
                openUrl={(url) => openUrl(url, true)}
                onDirtyChange={handleCanvasDirtyChange}
                reportStatus={setStatus}
                offerRecovery={offerRecovery}
              />
            )}

            {surface === "apps" && (
              <RunnableAppsSurface
                key={`${activeProfile?.id ?? "profile-loading"}-${runnableAppTarget}-${dailyFlowTargetView}`}
                state={runnableApps}
                initialApp={runnableAppTarget}
                initialDailyFlowView={dailyFlowTargetView}
                onChange={setRunnableApps}
                reportStatus={setStatus}
                offerRecovery={offerRecovery}
              />
            )}

            {surface === "settings" && (
              <div className="trusted-surface settings-surface">
                <header className="settings-header">
                  <span className="eyebrow">Local control</span>
                  <h1>Settings</h1>
                  <p>Control continuity and private data without changing website permissions.</p>
                </header>
                <div className="settings-grid">
                  <section className="settings-card">
                    <span className="settings-profile-avatar">
                      {activeProfile?.avatarDataUrl ? (
                        <img src={activeProfile.avatarDataUrl} alt="" />
                      ) : (
                        profileInitials(activeProfile?.name ?? "Personal")
                      )}
                    </span>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Website profiles</span>
                      <h2>{activeProfile?.name ?? "Personal"}</h2>
                      <p>
                        {(profileState?.profiles.length ?? 1).toString()} local profile
                        {(profileState?.profiles.length ?? 1) === 1 ? "" : "s"}. Each keeps its own
                        site sign-ins, tabs, desktops, and focus intention.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="settings-action primary"
                      onClick={() => setProfileMenuOpen(true)}
                    >
                      Manage profiles
                    </button>
                  </section>

                  <section
                    className="settings-card local-workspace-settings-card"
                    data-settings-local-workspace
                  >
                    <div className="settings-card-icon green">
                      <Icon name="folder" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Local workspace</span>
                      <h2>
                        {vault
                          ? `Connected to ${localWorkspace.rootName || "local folder"}`
                          : "No local folder connected"}
                      </h2>
                      <p>
                        {vault
                          ? "Coach keeps each desktop's Inbox, Notes, Files, and Planner here. The private device path stays hidden; disconnecting never deletes anything."
                          : "Choose any local folder for desktop files, Inbox notes, Canvas pages, and saved links."}
                      </p>
                      {vault && activeDesktopFiles && (
                        <span className="local-workspace-active-folder">
                          <Icon name="check" />
                          Active desktop: {activeDesktop?.name} · Desktops/
                          {activeDesktopFiles.folderName}
                        </span>
                      )}
                    </div>
                    <div className="settings-card-actions">
                      {vault ? (
                        <>
                          <button
                            type="button"
                            className="settings-action primary"
                            disabled={localWorkspaceBusy}
                            onClick={() =>
                              void window.lattice.localWorkspace
                                .revealDesktop(workspace.activeDesktopId)
                                .catch((error) =>
                                  setStatus(error instanceof Error ? error.message : String(error)),
                                )
                            }
                          >
                            Open desktop folder
                          </button>
                          <button
                            type="button"
                            className="settings-cancel"
                            onClick={() => void disconnectVault()}
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="settings-action primary"
                          onClick={() => void connectVault(false)}
                        >
                          Connect local folder
                        </button>
                      )}
                    </div>
                  </section>

                  <section
                    className="settings-card archived-desktops-settings-card"
                    data-settings-archived-desktops
                  >
                    <div className="settings-card-icon amber">
                      <Icon name="folder" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Desktop lifecycle</span>
                      <h2>Archived desktops</h2>
                      <p>
                        Archiving removes a desktop from the sidebar but keeps it recoverable.
                        Permanent deletion is available only here and clears browser-owned history,
                        never local notes or files.
                      </p>
                    </div>
                    <span className="settings-badge">
                      {workspace.archivedDesktops.length} archived
                    </span>
                    <div className="settings-archived-desktop-list">
                      {workspace.archivedDesktops.length === 0 ? (
                        <p className="settings-archived-empty">
                          No archived desktops. Use the archive button beside a desktop when you no
                          longer need it in the sidebar.
                        </p>
                      ) : (
                        workspace.archivedDesktops.map((desktop) => {
                          const historyCount = browserHistory.filter(
                            (item) => item.desktopId === desktop.id,
                          ).length;
                          const closedCount = recentlyClosedTabs.filter(
                            (item) => item.desktopId === desktop.id,
                          ).length;
                          const localFolder = localWorkspace.desktops.find(
                            (item) => item.desktopId === desktop.id,
                          );
                          return (
                            <article className="settings-archived-desktop" key={desktop.id}>
                              <span className={`desktop-glyph ${desktop.color}`}>
                                <DesktopIconGraphic icon={desktop.icon} color={desktop.color} />
                              </span>
                              <span>
                                <strong>{desktop.name}</strong>
                                <small>
                                  {formatCount(historyCount, "history item")} · {closedCount} closed
                                  tab{closedCount === 1 ? "" : "s"}
                                  {localFolder ? ` · ${localFolder.folderName}` : ""}
                                </small>
                              </span>
                              <div className="settings-archived-actions">
                                <button
                                  type="button"
                                  className="settings-action"
                                  data-restore-desktop={desktop.id}
                                  onClick={() => restoreDesktopFromArchive(desktop.id)}
                                >
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  className={
                                    confirmHardDeleteDesktopId === desktop.id
                                      ? "settings-action warning"
                                      : "settings-cancel"
                                  }
                                  data-hard-delete-desktop={desktop.id}
                                  onClick={() => hardDeleteDesktopFromArchive(desktop.id)}
                                >
                                  {confirmHardDeleteDesktopId === desktop.id
                                    ? `Confirm: clear ${historyCount + closedCount} browser records`
                                    : "Delete permanently"}
                                </button>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                    <p className="settings-local-data-guarantee">
                      <Icon name="lock" /> Notes and files stay in the connected folder until you
                      delete them manually.
                    </p>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-icon violet">
                      <Icon name="reload" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Browsing continuity</span>
                      <h2>Restore tabs on launch</h2>
                      <p>
                        Remember HTTPS URLs and desktop membership. Page content and form entries
                        are never serialized by Lattice.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={
                        settings.restoreTabs ? "settings-switch active" : "settings-switch"
                      }
                      role="switch"
                      aria-checked={settings.restoreTabs}
                      aria-label="Restore tabs on launch"
                      onClick={toggleRestoreTabs}
                    >
                      <span />
                    </button>
                  </section>

                  <section className="settings-card search-provider-settings-card">
                    <div className="settings-card-icon violet">
                      <Icon name="search" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Lattice Bar</span>
                      <h2>Web search provider</h2>
                      <p>
                        Local desk results always appear first. Choose where ordinary web searches
                        continue; trusted website commands still open their named destination.
                      </p>
                    </div>
                    <span className="settings-badge">
                      {providerById(settings.searchProvider).name}
                    </span>
                    <fieldset className="search-provider-grid">
                      <legend className="sr-only">Web search provider</legend>
                      {SEARCH_PROVIDERS.map((provider) => {
                        const selected = provider.id === settings.searchProvider;
                        return (
                          <button
                            type="button"
                            key={provider.id}
                            className={
                              selected
                                ? "search-provider-option selected"
                                : "search-provider-option"
                            }
                            aria-pressed={selected}
                            data-action-description={actionHelpText.searchProvider(provider.name)}
                            onClick={() => selectSearchProvider(provider.id)}
                          >
                            <span
                              className={`search-provider-mark ${provider.id}`}
                              aria-hidden="true"
                            >
                              {provider.name.charAt(0)}
                            </span>
                            <span>
                              <strong>{provider.name}</strong>
                              <small>{provider.description}</small>
                            </span>
                            {selected && <Icon name="check" />}
                          </button>
                        );
                      })}
                    </fieldset>
                    <div className="search-history-privacy">
                      <span>
                        <Icon name="lock" />
                        <span>
                          <strong>Private history learning</strong>
                          <small>
                            {formatCount(browserHistory.length, "recent address")} stored only in
                            this profile to improve website suggestions.
                          </small>
                        </span>
                      </span>
                      <button
                        type="button"
                        className="settings-cancel"
                        data-action-description={actionHelpText.clearSearchHistory}
                        disabled={browserHistory.length === 0}
                        onClick={clearLocalSearchHistory}
                      >
                        Clear local history
                      </button>
                    </div>
                  </section>

                  <section className="settings-card theme-settings-card" data-settings-theme>
                    <div className="settings-card-icon violet">
                      <Icon name="sparkle" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Appearance</span>
                      <h2>Theme</h2>
                      <p>
                        Choose a calm built-in look or shape a named palette for this website
                        profile. Theme changes never affect the pages you visit.
                      </p>
                    </div>
                    <span className="settings-badge theme-current-badge" data-current-theme>
                      {settings.activeTheme === "custom"
                        ? settings.customTheme.name
                        : THEME_CATALOG.find((theme) => theme.id === settings.activeTheme)?.name}
                    </span>

                    <fieldset className="theme-option-grid">
                      <legend className="sr-only">Coach Browser theme</legend>
                      {THEME_CATALOG.map((theme) => {
                        const selected = settings.activeTheme === theme.id;
                        const displayName =
                          theme.id === "custom" ? settings.customTheme.name : theme.name;
                        return (
                          <button
                            type="button"
                            key={theme.id}
                            className={selected ? "theme-option selected" : "theme-option"}
                            data-theme-option={theme.id}
                            aria-pressed={selected}
                            onClick={() => selectTheme(theme.id)}
                          >
                            <span className={`theme-preview ${theme.id}`} aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                            <span className="theme-option-copy">
                              <strong>{displayName}</strong>
                              <small>{theme.description}</small>
                            </span>
                            <span className="theme-selection-mark" aria-hidden="true">
                              {selected && <Icon name="check" />}
                            </span>
                          </button>
                        );
                      })}
                    </fieldset>

                    {settings.activeTheme === "custom" && (
                      <div className="custom-theme-editor" data-custom-theme-editor>
                        <div className="custom-theme-heading">
                          <div>
                            <span className="settings-kicker">Named custom theme</span>
                            <strong>Make it yours</strong>
                          </div>
                          <span
                            className={
                              customThemeDirty ? "theme-live-state dirty" : "theme-live-state"
                            }
                          >
                            {customThemeDirty
                              ? "Live preview · not saved"
                              : "Saved for this profile"}
                          </span>
                        </div>

                        <label className="custom-theme-name">
                          <span>Theme name</span>
                          <input
                            type="text"
                            maxLength={MAX_CUSTOM_THEME_NAME_LENGTH}
                            value={customThemeDraft.name}
                            onChange={(event) =>
                              setCustomThemeDraft((current) => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                            aria-label="Custom theme name"
                          />
                        </label>

                        <div className="custom-color-grid">
                          {customThemeColorFields.map((field) => (
                            <label key={field.key}>
                              <span>{field.label}</span>
                              <span className="custom-color-control">
                                <input
                                  type="color"
                                  value={customThemeDraft[field.key]}
                                  onChange={(event) =>
                                    setCustomThemeDraft((current) => ({
                                      ...current,
                                      [field.key]: event.target.value,
                                    }))
                                  }
                                  aria-label={`${field.label} color`}
                                />
                                <code>{customThemeDraft[field.key]}</code>
                              </span>
                            </label>
                          ))}
                        </div>

                        <div className="custom-theme-actions">
                          <button
                            type="button"
                            className="settings-action primary"
                            disabled={!customThemeDirty}
                            onClick={applyCustomTheme}
                          >
                            Save custom theme
                          </button>
                          <button
                            type="button"
                            className="settings-action"
                            disabled={!customThemeDirty}
                            onClick={() => setCustomThemeDraft(settings.customTheme)}
                          >
                            Revert preview
                          </button>
                          <button
                            type="button"
                            className="settings-cancel"
                            onClick={resetCustomThemeDraft}
                          >
                            Reset palette
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="settings-card" data-settings-privacy>
                    <div className="settings-card-icon cyan">
                      <Icon name="globe" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Active website profile</span>
                      <h2>Cookies and cache</h2>
                      <p>
                        {privacy.cookieCount} cookies · {formatBytes(privacy.cacheBytes)} cached for
                        {` ${activeProfile?.name ?? "this profile"}`}. Clearing signs this profile
                        out of websites but does not touch other profiles or local files.
                      </p>
                    </div>
                    <div className="settings-card-actions">
                      <button
                        type="button"
                        className={confirmClearData ? "settings-action warning" : "settings-action"}
                        disabled={clearingData}
                        onClick={() => void clearWebsiteData()}
                      >
                        {clearingData
                          ? "Clearing…"
                          : confirmClearData
                            ? "Confirm clear"
                            : "Clear website data"}
                      </button>
                      {confirmClearData && (
                        <button
                          type="button"
                          className="settings-cancel"
                          onClick={() => setConfirmClearData(false)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="settings-card about-card">
                    <div className="settings-card-icon amber">
                      <Icon name="lock" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">About</span>
                      <h2>Coach Browser 0.16.0</h2>
                      <p>
                        Current privacy controls. Remote Node access, downloads, popups, device
                        permissions, and unsafe protocols remain disabled.
                      </p>
                    </div>
                    <span className="settings-badge">Local-first</span>
                  </section>
                </div>
              </div>
            )}
          </main>

          {captureOpen && (
            <aside className="capture-panel">
              <header>
                <div>
                  <span className="eyebrow">Save to local folder</span>
                  <h2>Capture this page</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCaptureOpen(false)}
                  aria-label="Close capture panel"
                >
                  <Icon name="close" />
                </button>
              </header>
              <div className="capture-preview">
                <span className="capture-favicon">
                  {displayHost(activeTab?.url ?? "")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{activeTab ? displayTitle(activeTab) : "Untitled page"}</strong>
                  <span>{displayHost(activeTab?.url ?? "")}</span>
                </div>
              </div>
              {!vault ? (
                <div className="capture-connect">
                  <span>
                    <Icon name="sparkle" />
                  </span>
                  <h3>Connect a local folder first</h3>
                  <p>Coach Browser writes plain Markdown. Nothing is locked inside the app.</p>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void connectVault(false)}
                  >
                    Choose local folder
                  </button>
                  <button type="button" onClick={() => void connectVault(true)}>
                    Use a disposable folder
                  </button>
                </div>
              ) : (
                <div className="capture-form">
                  <label>
                    <span>
                      Description <small>optional</small>
                    </span>
                    <textarea
                      value={captureDescription}
                      onChange={(event) => setCaptureDescription(event.target.value)}
                      placeholder="Why is this worth keeping?"
                      maxLength={4000}
                    />
                  </label>
                  <div className="capture-field">
                    <span>Folder</span>
                    <div className="folder-select">
                      <Icon name="folder" />
                      <strong>Saved Links / {activeDesktop?.name}</strong>
                      <Icon name="chevron-down" />
                    </div>
                  </div>
                  <button
                    type="button"
                    className={queueCapture ? "queue-toggle active" : "queue-toggle"}
                    aria-pressed={queueCapture}
                    onClick={() => setQueueCapture((queued) => !queued)}
                  >
                    <span className="queue-toggle-check">
                      <Icon name={queueCapture ? "check" : "plus"} />
                    </span>
                    <span>
                      <strong>Add to reading queue</strong>
                      <small>Keep this page ready for focused reading</small>
                    </span>
                  </button>
                  <div className="local-note">
                    <Icon name="lock" />
                    <span>
                      Saved locally as Markdown in{" "}
                      <strong>{vault.displayPath.split(/[\\/]/).pop()}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className={saved ? "capture-submit saved" : "capture-submit"}
                    onClick={() => void saveLink()}
                    disabled={saving || saved}
                  >
                    {saved ? (
                      <>
                        <Icon name="check" />
                        {queueCapture ? "Saved to reading queue" : "Saved to local folder"}
                      </>
                    ) : saving ? (
                      "Saving…"
                    ) : (
                      <>
                        <Icon name="bookmark" />
                        Save page
                      </>
                    )}
                  </button>
                </div>
              )}
            </aside>
          )}
          <div className="vault-probe smoke-vault-boundary" aria-hidden="true" />
        </div>

        {surface !== "home" && (
          <footer className="status-bar" aria-live="polite">
            <span>
              <i className={activeTab?.loading ? "status-pulse active" : "status-pulse"} />
              {activeTab?.loading ? "Loading" : status}
            </span>
            <span>
              <Icon name="lock" />
              Remote Node access disabled
            </span>
          </footer>
        )}
      </section>
      {recoveryNotice && (
        <aside className="recovery-bar" role="status" aria-live="polite">
          <span>{recoveryNotice.message}</span>
          <button type="button" onClick={() => void runRecovery()}>
            {recoveryNotice.actionLabel}
            {recoveryNotice.actionLabel === "Undo" && <kbd>Ctrl Z</kbd>}
          </button>
          <button
            type="button"
            className="recovery-dismiss"
            aria-label="Dismiss recovery action"
            onClick={clearRecovery}
          >
            <Icon name="close" />
          </button>
        </aside>
      )}
      {(zoomFeedbackVisible || zoomPercent !== DEFAULT_ZOOM_PERCENT) && (
        <aside
          className={`zoom-feedback${zoomFineTuneOpen ? " expanded" : ""}${
            recoveryNotice ? " above-recovery" : ""
          }`}
          aria-label={`Zoom ${zoomPercent}%`}
          onMouseEnter={() => setZoomFineTuneOpen(true)}
          onMouseLeave={() => setZoomFineTuneOpen(false)}
        >
          <button
            type="button"
            className="zoom-feedback-summary"
            aria-expanded={zoomFineTuneOpen}
            aria-controls="zoom-fine-tune"
            title="Fine-tune zoom"
            onClick={() => setZoomFineTuneOpen(true)}
          >
            {zoomPercent}%
          </button>
          {zoomFineTuneOpen && (
            <fieldset id="zoom-fine-tune" className="zoom-fine-tune" aria-label="Zoom controls">
              <header>
                <span>
                  <strong>Zoom</strong>
                  <small>Fine-tune the workspace</small>
                </span>
                <output>{zoomPercent}%</output>
              </header>
              <div className="zoom-fine-tune-controls">
                <button
                  type="button"
                  aria-label="Zoom out 5 percent"
                  disabled={zoomPercent <= MIN_ZOOM_PERCENT}
                  onClick={() => applyShellZoom(zoomPercentRef.current - FINE_ZOOM_STEP)}
                >
                  −
                </button>
                <input
                  type="range"
                  min={MIN_ZOOM_PERCENT}
                  max={MAX_ZOOM_PERCENT}
                  step={FINE_ZOOM_STEP}
                  value={zoomPercent}
                  aria-label="Zoom percentage"
                  onChange={(event) => applyShellZoom(Number(event.target.value))}
                />
                <button
                  type="button"
                  aria-label="Zoom in 5 percent"
                  disabled={zoomPercent >= MAX_ZOOM_PERCENT}
                  onClick={() => applyShellZoom(zoomPercentRef.current + FINE_ZOOM_STEP)}
                >
                  +
                </button>
              </div>
              <footer>
                <span>
                  <kbd>Ctrl</kbd> <kbd>+</kbd> / <kbd>−</kbd>
                </span>
                <button
                  type="button"
                  disabled={zoomPercent === DEFAULT_ZOOM_PERCENT}
                  onClick={() => applyShellZoom(DEFAULT_ZOOM_PERCENT)}
                >
                  Reset
                </button>
              </footer>
            </fieldset>
          )}
        </aside>
      )}
      {commandOpen && (
        <div className="command-layer">
          <button
            type="button"
            className="command-backdrop"
            aria-label="Close search"
            onClick={() => setCommandOpen(false)}
          />
          <form
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search everything"
            onSubmit={(event) => {
              event.preventDefault();
              const first = commandItems[0];
              if (first) void runCommand(first);
            }}
          >
            <label className="command-input">
              <Icon name="search" />
              <span className="sr-only">Search tabs, desktops, and saved links</span>
              <input
                ref={commandInputRef}
                value={commandQuery}
                data-action-description={actionHelpText.commandSearch}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const first = commandItems[0];
                  if (first) void runCommand(first);
                }}
                placeholder="Search tabs, desktops, saved links, or the web"
              />
              <kbd>ESC</kbd>
            </label>
            <button type="submit" className="sr-only">
              Run first result
            </button>
            <div className="command-results">
              {commandItems.length === 0 ? (
                <div className="command-empty">
                  No local matches. Keep typing to search the web.
                </div>
              ) : (
                commandItems.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={index === 0 ? "command-result selected" : "command-result"}
                    onClick={() => void runCommand(item)}
                  >
                    <span className={`command-result-icon ${item.kind}`}>
                      <Icon
                        name={
                          item.kind === "desktop"
                            ? "desktop"
                            : item.kind === "link"
                              ? "bookmark"
                              : item.kind === "action" && item.action === "library"
                                ? "library"
                                : item.kind === "action" && item.action === "queue"
                                  ? "folder"
                                  : item.kind === "action"
                                    ? "plus"
                                    : item.kind === "web"
                                      ? "search"
                                      : "globe"
                        }
                      />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    {index === 0 && <kbd>↵</kbd>}
                  </button>
                ))
              )}
            </div>
            <footer className="command-footer">
              <span>Local-first search</span>
              <span>
                <kbd>Ctrl L</kbd> address <kbd>Ctrl T</kbd> new tab <kbd>Ctrl W</kbd> close
              </span>
            </footer>
          </form>
        </div>
      )}
      <ActionPopover />
    </div>
  );
}
