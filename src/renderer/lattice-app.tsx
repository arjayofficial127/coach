import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BrowserPrivacySummary,
  BrowserSnapshot,
  BrowserState,
  CanvasPageSummary,
  ProfileState,
  ProfileSummary,
  ProfileSwitchResult,
  SavedLinkRecord,
  ShellAppearance,
  ShellCommand,
  VaultInfo,
  VaultReferenceIndex,
} from "../shared/contracts";
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
import lightCapLogoUrl from "./assets/traced-cap-icon.svg";
import darkCapLogoUrl from "./assets/traced-cap-icon-white.svg";
import { captureJournalInboxNote, journalItemsForLane, localDayKey } from "./bullet-journal-model";
import { CanvasWorkspace } from "./canvas-workspace";
import type { DailyFlowView } from "./daily-flow-surface";
import {
  type DashboardClosedTab,
  type DashboardHistoryItem,
  DashboardSurface,
} from "./dashboard-surface";
import {
  FOCUS_STORAGE_KEY,
  MAX_FOCUS_INTENTION_LENGTH,
  navigationShortcut,
  normalizeFocusIntention,
  parseFocusPreferences,
  type Surface,
  surfaceDetails,
} from "./focus-model";
import { Icon, type IconName } from "./icon";
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
  archiveDesktop,
  createDesktop,
  DEFAULT_WORKSPACE,
  moveTabToDesktop,
  parseWorkspacePreferences,
  permanentlyDeleteArchivedDesktop,
  renameDesktop,
  restoreArchivedDesktop,
  type WorkspacePreferences,
} from "./workspace-model";

const WORKSPACE_STORAGE_KEY = "lattice.workspace.v1";
const SESSION_STORAGE_KEY = "lattice.session.v1";
const SETTINGS_STORAGE_KEY = "lattice.settings.v2";
const LEGACY_SETTINGS_STORAGE_KEY = "lattice.settings.v1";
const ZOOM_STORAGE_KEY = "lattice.shell-zoom.v1";
const emptySnapshot: BrowserSnapshot = { activeTabId: "", tabs: [] };
const emptyReferenceIndex: VaultReferenceIndex = {
  generatedAt: "",
  entries: [],
  unresolvedCount: 0,
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
  | { kind: "link"; id: string; label: string; detail: string; link: SavedLinkRecord }
  | { kind: "canvas"; id: string; label: string; detail: string; pageId: string }
  | { kind: "file"; id: string; label: string; detail: string; pageId: string };

const railItems: Array<{ id: Surface; label: string; icon: IconName }> = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "browser", label: "Browse", icon: "globe" },
  { id: "pages", label: "Canvas pages", icon: "grid" },
  { id: "apps", label: "Runnable apps", icon: "timer" },
  { id: "library", label: "Saved links", icon: "bookmark" },
  { id: "settings", label: "Settings", icon: "settings" },
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
    next = await window.lattice.browser.createTab(
      savedTab.url === "about:blank" ? undefined : savedTab.url,
    );
    assignments[next.activeTabId] = savedTab.desktopId;
    restored.push({ nativeId: next.activeTabId, saved: savedTab });
  }
  next = await window.lattice.browser.closeTab(initial.activeTabId);
  const target = restored.find((entry) => entry.saved.active) ?? restored[0];
  if (target) next = await window.lattice.browser.switchTab(target.nativeId);
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

function formatWaitingNotes(count: number) {
  return count === 0 ? "No notes waiting" : `${formatCount(count, "note")} waiting`;
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
  const workspaceHeadingRef = useRef<HTMLDivElement>(null);
  const webStageRef = useRef<HTMLElement>(null);
  const omniboxRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const newDesktopInputRef = useRef<HTMLInputElement>(null);
  const desktopRenameInputRef = useRef<HTMLInputElement>(null);
  const commandHandlerRef = useRef<(command: ShellCommand) => void>(() => undefined);
  const zoomHandlerRef = useRef<(command: ZoomCommand) => void>(() => undefined);
  const zoomPercentRef = useRef(DEFAULT_ZOOM_PERCENT);
  const zoomRequestRef = useRef(0);
  const recoveryHandlerRef = useRef<() => void>(() => undefined);
  const pendingRecoveryRef = useRef<PendingRecovery | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const canvasDirtyRef = useRef(false);
  const quickNoteCaptureBusyRef = useRef(false);
  // Ctrl/Cmd+T can arrive from both the embedded browser and the shell
  // keyboard handler. Keep tab creation single-flight so one gesture cannot
  // create a burst of duplicate tabs while the IPC request is in flight.
  const creatingTabRef = useRef(false);
  const [workspace, setWorkspace] = useState<WorkspacePreferences>(DEFAULT_WORKSPACE);
  const [settings, setSettings] = useState<SettingsPreferences>(DEFAULT_SETTINGS);
  const [customThemeDraft, setCustomThemeDraft] =
    useState<CustomThemePreferences>(DEFAULT_CUSTOM_THEME);
  const [focusIntention, setFocusIntention] = useState("");
  const [quickNote, setQuickNote] = useState("");
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
  const [requestedCanvasPageId, setRequestedCanvasPageId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>(emptySnapshot);
  const [tabDesktops, setTabDesktops] = useState<Record<string, string>>({});
  const [surface, setSurface] = useState<Surface>("home");
  const [address, setAddress] = useState("");
  const [homeQuery, setHomeQuery] = useState("");
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [links, setLinks] = useState<SavedLinkRecord[]>([]);
  const [canvasPages, setCanvasPages] = useState<CanvasPageSummary[]>([]);
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<DashboardClosedTab[]>([]);
  const [browserHistory, setBrowserHistory] = useState<DashboardHistoryItem[]>([]);
  const [dashboardTabPreviews, setDashboardTabPreviews] = useState<Record<string, string>>({});
  const [dashboardTabPreviewStatuses, setDashboardTabPreviewStatuses] = useState<
    Record<string, "loading" | "ready" | "failed">
  >({});
  const [referenceIndex, setReferenceIndex] = useState<VaultReferenceIndex>(emptyReferenceIndex);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureDescription, setCaptureDescription] = useState("");
  const [queueCapture, setQueueCapture] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [status, setStatus] = useState("Ready");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingDesktop, setAddingDesktop] = useState(false);
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
  } as CSSProperties;
  const titleBarAppearance = useMemo<ShellAppearance>(() => {
    if (settings.activeTheme === "paper-felt") {
      return { backgroundColor: "#f3f3f0", symbolColor: "#2b2d31" };
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
      [item, ...current.filter((entry) => entry.url !== item.url)].slice(0, 100),
    );
  }, [activeTab, workspace.activeDesktopId]);
  useEffect(() => {
    if (surface !== "dashboard") return;
    let cancelled = false;
    const previewTabs = desktopTabs;
    const alreadyCaptured = new Set(Object.keys(dashboardTabPreviews));
    void (async () => {
      for (const tab of previewTabs) {
        if (cancelled) return;
        if (alreadyCaptured.has(tab.id)) {
          setDashboardTabPreviewStatuses((current) => ({ ...current, [tab.id]: "ready" }));
          continue;
        }
        setDashboardTabPreviewStatuses((current) => ({ ...current, [tab.id]: "loading" }));
        try {
          const preview = await window.lattice.browser.captureTabPreview(tab.id);
          if (cancelled) return;
          if (preview) {
            alreadyCaptured.add(tab.id);
            setDashboardTabPreviews((current) => ({ ...current, [tab.id]: preview }));
            setDashboardTabPreviewStatuses((current) => ({ ...current, [tab.id]: "ready" }));
          } else {
            setDashboardTabPreviewStatuses((current) => ({ ...current, [tab.id]: "failed" }));
          }
        } catch {
          if (!cancelled) {
            setDashboardTabPreviewStatuses((current) => ({ ...current, [tab.id]: "failed" }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktopTabs, surface]);
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
  const newTabSuggestions = useMemo<NewTabSuggestion[]>(() => {
    const appSuggestions: NewTabSuggestion[] = [
      {
        kind: "app",
        id: "new-tab-app-daily-flow",
        label: "Daily Flow",
        detail: `${formatCount(dailyFlowInboxCount, "capture")} in Inbox`,
        appId: "daily-flow",
      },
      {
        kind: "app",
        id: "new-tab-app-pomodoro",
        label: "Pomodoro",
        detail: runnableApps.pomodoro.activeRun
          ? `Running · ${runnableApps.pomodoro.activeRun.task}`
          : "Start one focused timer",
        appId: "pomodoro",
      },
      {
        kind: "app",
        id: "new-tab-app-wealth-lab",
        label: "Wealth Lab",
        detail: "Money, earning ideas, and investments",
        appId: "wealth-lab",
      },
    ];
    const tabSuggestions: NewTabSuggestion[] = desktopTabs
      .filter((tab) => tab.url !== "about:blank")
      .slice(0, 3)
      .map((tab) => ({
        kind: "tab",
        id: `new-tab-history-${tab.id}`,
        label: displayTitle(tab),
        detail: `Recent tab · ${displayHost(tab.url)}`,
        tab,
      }));
    const linkSuggestions: NewTabSuggestion[] = links.slice(0, 3).map((link) => ({
      kind: "link",
      id: `new-tab-link-${link.id}`,
      label: link.title,
      detail: `Saved link · ${displayHost(link.url)}`,
      link,
    }));
    const fileSuggestions: NewTabSuggestion[] = referenceIndex.entries
      .filter(
        (entry) =>
          entry.status === "resolved" &&
          entry.source.kind === "page" &&
          ["document", "image", "file"].includes(entry.kind),
      )
      .slice(0, 2)
      .map((entry) => ({
        kind: "file",
        id: `new-tab-file-${entry.id}`,
        label: entry.targetLabel,
        detail: `File · in ${entry.source.title}`,
        pageId: entry.source.id,
      }));
    const canvasSuggestions: NewTabSuggestion[] = recentCanvasPage
      ? [
          {
            kind: "canvas",
            id: `new-tab-canvas-${recentCanvasPage.id}`,
            label: recentCanvasPage.title,
            detail: `Canvas · ${formatCount(recentCanvasPage.nodeCount, "object")}`,
            pageId: recentCanvasPage.id,
          },
        ]
      : [];
    const candidates = [
      ...appSuggestions,
      ...tabSuggestions,
      ...linkSuggestions,
      ...fileSuggestions,
      ...canvasSuggestions,
    ];
    const query = homeQuery.trim().toLowerCase();
    if (!query) return candidates.slice(0, 6);
    return candidates
      .filter((candidate) => `${candidate.label} ${candidate.detail}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [
    dailyFlowInboxCount,
    desktopTabs,
    homeQuery,
    links,
    recentCanvasPage,
    referenceIndex.entries,
    runnableApps.pomodoro.activeRun,
  ]);
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
        detail: "Obsidian library",
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
      setStatus("Obsidian vault restored");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let profilesLoaded = false;
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
    void (async () => {
      const profiles = await window.lattice.profiles.state();
      profilesLoaded = true;
      if (!cancelled) {
        setProfileState(profiles);
        setProfileLoadError(null);
      }
      const shell = loadProfileShellState(profiles, profiles.activeProfileId);
      if (!cancelled) {
        setWorkspace(shell.workspace);
        setSettings(shell.settings);
        setFocusIntention(shell.focusIntention);
        setRunnableApps(shell.runnableApps);
        setProfileShellHydrated(true);
      }
      const initial = await window.lattice.browser.snapshot();
      const restored = await restoreProfileBrowser(
        initial,
        shell.workspace,
        shell.settings,
        profiles,
        profiles.activeProfileId,
      );
      return { profiles, restored };
    })()
      .then(({ profiles, restored }) => {
        if (cancelled) return;
        setProfileState(profiles);
        setSnapshot(restored.snapshot);
        setTabDesktops(restored.assignments);
        const restoredActive = restored.restoredActive;
        if (restoredActive) {
          setWorkspace((current) => ({
            ...current,
            activeDesktopId: restoredActive.desktopId,
          }));
          setSurface(restoredActive.url === "about:blank" ? "home" : "browser");
        }
        setSessionReady(true);
        if (restored.restoredCount > 0) {
          setStatus(`Restored ${restored.restoredCount} tabs`);
        }
      })
      .catch(async (error) => {
        if (cancelled) return;
        if (!profilesLoaded) {
          setProfileLoadError(error instanceof Error ? error.message : "Profiles could not load");
        }
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
    const viewport = viewportRef.current;
    if (!viewport) return;
    let disposed = false;
    const updateBounds = () => {
      const bounds = viewport.getBoundingClientRect();
      void window.lattice.browser
        .setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
        .then(() => {
          if (!disposed)
            return window.lattice.browser.setVisible(
              surface === "browser" && !browserMenuOpen && !commandOpen && !profileMenuOpen,
            );
        });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(viewport);
    window.addEventListener("resize", updateBounds);
    updateBounds();
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      void window.lattice.browser.setVisible(false);
    };
  }, [browserMenuOpen, commandOpen, profileMenuOpen, surface]);

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
      omniboxRef.current?.focus();
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
    await openUrl(address);
  };

  const navigateFromFocus = async (event: FormEvent) => {
    event.preventDefault();
    if (!homeQuery.trim()) return;
    await openUrl(homeQuery);
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
      setSurface(tab.url === "about:blank" ? "home" : "browser");
      setCaptureOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
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
      next = await window.lattice.browser.createTab(
        entry.tab.url === "about:blank" ? undefined : entry.tab.url,
      );
      restoredAssignments[next.activeTabId] = entry.desktopId;
      restoredIds.set(entry.tab.id, next.activeTabId);
    }
    const placeholder = placeholderId
      ? next.tabs.find((candidate) => candidate.id === placeholderId)
      : null;
    if (placeholder?.url === "about:blank" && next.tabs.length > closed.length) {
      next = await window.lattice.browser.closeTab(placeholder.id);
    }
    const restoredActiveId = restoredIds.get(activeClosedId) ?? restoredIds.values().next().value;
    if (restoredActiveId) next = await window.lattice.browser.switchTab(restoredActiveId);
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
    setWorkspace((current) => ({ ...current, activeDesktopId: desktopId }));
    const firstTab = snapshot.tabs.find((tab) => tabDesktops[tab.id] === desktopId);
    if (firstTab) {
      setSnapshot(await window.lattice.browser.switchTab(firstTab.id));
      setSurface(firstTab.url === "about:blank" ? "home" : "browser");
    } else {
      setAddress("");
      setSurface("home");
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
    setSurface("home");
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
    setStatus("Desktop renamed; existing Obsidian folders were left untouched");
    if (previousName) {
      offerRecovery("Desktop renamed", () =>
        setWorkspace((current) => renameDesktop(current, renamedDesktopId, previousName)),
      );
    }
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
    setWorkspace((current) => permanentlyDeleteArchivedDesktop(current, desktopId));
    setConfirmHardDeleteDesktopId(null);
    setStatus(
      `Permanently removed ${desktop?.name ?? "archived desktop"}; vault files were untouched`,
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
      setStatus(disposable ? "Disposable vault connected" : "Obsidian vault connected");
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
      setStatus(queueCapture ? "Saved to your reading queue" : "Saved to Obsidian");
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
    setSurface("dashboard");
    setCaptureOpen(false);
    setBrowserMenuOpen(false);
    setCommandOpen(false);
    setProfileMenuOpen(false);
  };

  const focusBrowserLocation = () => {
    window.requestAnimationFrame(() => {
      omniboxRef.current?.focus();
      omniboxRef.current?.select();
    });
  };

  const showBrowser = async () => {
    if (!confirmCanvasLeave()) return;
    const shouldFocusLocation = !contextualTab || contextualTab.url === "about:blank";
    if (contextualTab) {
      setSurface("browser");
    } else {
      await createTab(workspace.activeDesktopId, "browser");
    }
    setCaptureOpen(false);
    setBrowserMenuOpen(false);
    if (shouldFocusLocation) focusBrowserLocation();
  };

  const showSurface = async (target: Surface) => {
    if (target === "home") await createTab();
    else if (target === "dashboard") showDashboard();
    else if (target === "browser") await showBrowser();
    else if (target === "library") await showLibrary();
    else if (target === "queue") await showReadingQueue();
    else if (target === "pages") await showCanvasPages();
    else if (target === "apps") showRunnableApps();
    else await showSettings();
  };

  const captureQuickNote = (event: FormEvent) => {
    event.preventDefault();
    if (quickNoteCaptureBusyRef.current) return;
    const note = quickNote.trim();
    if (!note) return;

    quickNoteCaptureBusyRef.current = true;
    setCapturingQuickNote(true);
    const previous = runnableApps;
    try {
      const next = {
        ...runnableApps,
        bulletJournal: captureJournalInboxNote(runnableApps.bulletJournal, note),
      };
      setRunnableApps(next);
      setQuickNote("");
      setStatus("Quick note captured to Inbox");
      offerRecovery("Quick note captured to Inbox", () => setRunnableApps(previous));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      quickNoteCaptureBusyRef.current = false;
      setCapturingQuickNote(false);
    }
  };

  const activateNewTabSuggestion = async (suggestion: NewTabSuggestion) => {
    if (suggestion.kind === "app") {
      showRunnableApp(suggestion.appId);
    } else if (suggestion.kind === "tab") {
      await switchTab(suggestion.tab);
    } else if (suggestion.kind === "link") {
      await openUrl(suggestion.link.url);
    } else {
      await showCanvasPages(suggestion.pageId);
    }
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
      setLinks([]);
      setCanvasPages([]);
      setStatus("Vault disconnected; no Markdown files were deleted");
      offerRecovery("Vault disconnected", () => connectVault(false), "Reconnect");
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

  const activeRailItem = surface === "library" || surface === "queue" ? "library" : surface;

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
      void showBrowser().then(focusBrowserLocation);
      return;
    }
    if (command === "new-tab") {
      void createTab(workspace.activeDesktopId, "browser");
      return;
    }
    if (command === "toggle-focus") {
      toggleDistractionFree();
      return;
    }
    const destination: Partial<Record<ShellCommand, Surface>> = {
      "show-focus": "dashboard",
      "show-browser": "browser",
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
      className={`lattice-shell${focusMode ? " focus-mode" : ""}${
        showNewTabSurface ? " new-tab-sizing-invalidated" : ""
      }${settings.activeTheme === "lattice-dark" ? "" : " theme-adaptive"}`}
      data-theme={settings.activeTheme}
      data-theme-name={
        settings.activeTheme === "custom"
          ? previewCustomTheme.name
          : THEME_CATALOG.find((theme) => theme.id === settings.activeTheme)?.name
      }
      data-titlebar-theme={nativeAppearanceTheme ?? "syncing"}
      style={shellThemeStyle}
    >
      <nav className="activity-rail" aria-label="Primary navigation">
        <button
          className="brand-mark"
          type="button"
          onClick={showDashboard}
          aria-label="Open Dashboard"
        >
          <img src={coachLogoUrl} alt="" />
        </button>
        <div className="rail-actions">
          {railItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeRailItem === item.id ? "rail-button active" : "rail-button"}
              aria-label={item.label}
              aria-current={activeRailItem === item.id ? "page" : undefined}
              title={item.label}
              onClick={() => void showSurface(item.id)}
            >
              <Icon name={item.icon} />
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
                Website sign-ins stay inside this profile’s Chromium storage. Lattice never stores
                your Google or identity-provider password.
              </p>
            </section>
          </>
        )}
      </nav>

      <aside className="workspace-panel">
        <div className="workspace-heading" ref={workspaceHeadingRef}>
          <button
            className="workspace-selector"
            type="button"
            aria-label="Open workspace menu"
            aria-expanded={workspaceMenuOpen}
            onClick={() => {
              setConfirmHardDeleteDesktopId(null);
              setWorkspaceMenuOpen((open) => !open);
            }}
          >
            <span className="workspace-title">
              <span className="eyebrow">Workspace</span>
              <strong>
                {activeProfile ? `${activeProfile.name} research` : "Personal research"}
              </strong>
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
                }}
              >
                <Icon name="folder" />
                Archived desktops ({workspace.archivedDesktops.length})
              </button>
              <span>Desktop names can be edited beside each name</span>
            </div>
          )}
        </div>

        <button type="button" className="panel-search" onClick={openCommandPalette}>
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
                      <Icon name="desktop" />
                    </span>
                    <span>
                      <strong>{desktop.name}</strong>
                      <small>Files and saved data remain in place</small>
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
                        ? "Confirm remove"
                        : "Delete permanently"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p>Permanent removal forgets the desktop record. Vault files are never erased here.</p>
          </section>
        )}

        <div className="section-label desktop-section-label">
          <span>Desktops</span>
          <button type="button" onClick={() => setAddingDesktop(true)} aria-label="Add desktop">
            <Icon name="plus" />
          </button>
        </div>
        <div className="desktop-list">
          {workspace.desktops.map((desktop) => {
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
                      <Icon name="desktop" />
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
                >
                  <button
                    type="button"
                    className="desktop-open-surface"
                    aria-label={`Open ${desktop.name}`}
                    onClick={() => void selectDesktop(desktop.id)}
                  />
                  <button
                    type="button"
                    className="desktop-select"
                    aria-label={`Open ${desktop.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void selectDesktop(desktop.id);
                    }}
                  >
                    <span className={`desktop-glyph ${desktop.color}`}>
                      <Icon name="desktop" />
                    </span>
                  </button>
                  <span className="desktop-copy">
                    <span className="desktop-name-row">
                      <button
                        type="button"
                        className="desktop-name-button"
                        aria-label={`Open ${desktop.name} dashboard`}
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
                      aria-label={`Open ${desktop.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void selectDesktop(desktop.id);
                      }}
                    >
                      <small>
                        {formatCount(tabCount, "tab")} · {linkCount} saved
                      </small>
                    </button>
                  </span>
                  <button
                    type="button"
                    className="desktop-archive-trigger"
                    data-delete-desktop={desktop.id}
                    aria-label={`Archive ${desktop.name}`}
                    title={`Archive ${desktop.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      showDesktopArchiveActions(desktop.id);
                    }}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {archiveDesktopId === desktop.id && (
                  <aside className="desktop-archive-popover" data-archive-panel={desktop.id}>
                    <header>
                      <span>
                        <strong>Archive {desktop.name}?</strong>
                        <small>This can be restored later.</small>
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

        <div className="section-label navigation-label">
          <span>Navigate</span>
        </div>
        <div className="focus-navigation">
          <button
            type="button"
            className={surface === "dashboard" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "dashboard" ? "page" : undefined}
            onClick={showDashboard}
          >
            <span className="navigation-row-icon violet">
              <Icon name="home" />
            </span>
            <span>
              <strong>Dashboard</strong>
              <small>Review what matters</small>
            </span>
          </button>
          <button
            type="button"
            className={surface === "browser" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "browser" ? "page" : undefined}
            onClick={() => void showBrowser()}
          >
            <span className="navigation-row-icon cyan">
              <Icon name="globe" />
            </span>
            <span>
              <strong>Browse</strong>
              <small>Start somewhere new</small>
            </span>
          </button>
          <button
            type="button"
            className={
              surface === "pages"
                ? "library-row navigation-row active"
                : "library-row navigation-row"
            }
            aria-current={surface === "pages" ? "page" : undefined}
            onClick={() => void showCanvasPages()}
          >
            <span className="navigation-row-icon amber">
              <Icon name="grid" />
            </span>
            <span>
              <strong>Canvas pages</strong>
              <small>Connected thinking space</small>
            </span>
            <b>{canvasPages.length}</b>
          </button>
          <button
            type="button"
            className={surface === "apps" ? "navigation-row active" : "navigation-row"}
            aria-current={surface === "apps" ? "page" : undefined}
            onClick={showRunnableApps}
          >
            <span className="navigation-row-icon green">
              <Icon name="timer" />
            </span>
            <span>
              <strong>Runnable apps</strong>
              <small>
                {runnableApps.pomodoro.activeRun
                  ? `Running · ${runnableApps.pomodoro.activeRun.task}`
                  : dailyFlowInboxCount > 0
                    ? `${dailyFlowInboxCount} to clarify`
                    : "Pomodoro · Daily Flow · Wealth Lab"}
              </small>
            </span>
            <kbd>7</kbd>
          </button>
        </div>

        <div className="section-label library-label">
          <span>Library</span>
        </div>
        <button
          type="button"
          className={surface === "library" ? "library-row active" : "library-row"}
          aria-current={surface === "library" ? "page" : undefined}
          onClick={() => void showLibrary()}
        >
          <Icon name="bookmark" />
          <span>Saved links</span>
          <b>{links.length}</b>
        </button>
        <button
          type="button"
          className={surface === "queue" ? "library-row active" : "library-row"}
          aria-current={surface === "queue" ? "page" : undefined}
          onClick={() => void showReadingQueue()}
        >
          <Icon name="folder" />
          <span>Reading queue</span>
          <b>{queueCount}</b>
        </button>
        <div className="workspace-spacer" />
        <div className={vault ? "vault-card connected" : "vault-card"}>
          <div className="vault-card-icon">
            <Icon name={vault ? "check" : "sparkle"} />
          </div>
          <div className="vault-card-copy">
            <strong>{vault ? "Vault connected" : "Connect Obsidian"}</strong>
            <span>
              {vault ? vault.displayPath.split(/[\\/]/).pop() : "Save pages as local Markdown"}
            </span>
          </div>
          {!vault && (
            <button type="button" onClick={() => void connectVault(false)}>
              Connect
            </button>
          )}
          {vault && <span className="vault-card-status" aria-hidden="true" />}
        </div>
      </aside>

      <section
        className={[
          "content-shell",
          showNewTabSurface ? "new-tab-content" : "",
          captureOpen ? "drawer-open" : "",
          focusMode ? "focus-content" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="tab-strip">
          <button className="desktop-context" type="button" onClick={showDashboard}>
            <span className={`context-dot ${activeDesktop?.color ?? "violet"}`} />
            <span className="desktop-context-name">{activeDesktop?.name ?? "Desk 1"}</span>
            <span className="desktop-context-count">{desktopTabs.length}</span>
          </button>
          <div className="tabs-viewport">
            {desktopTabs.map((tab) => (
              <div
                key={tab.id}
                className={
                  tab.id === snapshot.activeTabId &&
                  surface !== "library" &&
                  surface !== "queue" &&
                  surface !== "pages" &&
                  surface !== "apps" &&
                  surface !== "settings"
                    ? "browser-tab active"
                    : "browser-tab"
                }
              >
                <button className="tab-select" type="button" onClick={() => void switchTab(tab)}>
                  <span className="favicon">
                    {tab.url === "about:blank" ? (
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
              </div>
            ))}
          </div>
          <button
            className="new-tab-button"
            type="button"
            onClick={() => void createTab(workspace.activeDesktopId, "browser")}
            aria-label="New tab"
          >
            <Icon name="plus" />
          </button>
          <div className="window-drag-space" />
        </header>

        {surface === "browser" && (
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
          <header className="surface-toolbar">
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
                  <strong>{surfaceDetails[surface].label}</strong>
                  <small>{surfaceDetails[surface].description}</small>
                </span>
              </span>
            </div>
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
                      <Icon name="sparkle" /> New tab
                    </span>
                    <h1 id="new-tab-heading">
                      Where would you
                      <br />
                      like to go?
                    </h1>
                    <p>Search the web, open something nearby, or leave a thought for later.</p>
                  </header>

                  <form className="new-tab-search" onSubmit={navigateFromFocus}>
                    <Icon name="search" />
                    <input
                      ref={omniboxRef}
                      value={homeQuery}
                      onChange={(event) => setHomeQuery(event.target.value)}
                      placeholder="Search the web or enter a URL"
                      aria-label="Search the web or enter a URL"
                      autoComplete="off"
                    />
                    <button type="submit">
                      Search <Icon name="arrow-right" />
                    </button>
                  </form>

                  <div className="new-tab-suggestions">
                    <div className="new-tab-suggestions-heading">
                      <span>{homeQuery.trim() ? "Matching your workspace" : "Quick open"}</span>
                    </div>
                    {newTabSuggestions.length > 0 ? (
                      <div className="new-tab-suggestion-grid">
                        {newTabSuggestions.map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion.id}
                            data-new-tab-suggestion={suggestion.kind}
                            onClick={() => void activateNewTabSuggestion(suggestion)}
                          >
                            <span
                              className={`new-tab-app-icon ${suggestion.kind}${
                                suggestion.kind === "app" ? ` ${suggestion.appId}` : ""
                              }`}
                            >
                              {suggestion.kind === "app" ? (
                                suggestion.appId === "pomodoro" ? (
                                  <Icon name="timer" />
                                ) : suggestion.appId === "daily-flow" ? (
                                  <Icon name="sparkle" />
                                ) : (
                                  <b>₱</b>
                                )
                              ) : (
                                <Icon
                                  name={
                                    suggestion.kind === "tab"
                                      ? "globe"
                                      : suggestion.kind === "link"
                                        ? "bookmark"
                                        : suggestion.kind === "canvas"
                                          ? "grid"
                                          : "folder"
                                  }
                                />
                              )}
                            </span>
                            <span>
                              <strong>
                                {suggestion.label.charAt(0).toUpperCase() +
                                  suggestion.label.slice(1)}
                              </strong>
                              <small>{suggestion.detail}</small>
                            </span>
                            <Icon name="arrow-right" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="new-tab-no-match">
                        <Icon name="search" />
                        <span>
                          <strong>Search the web for “{homeQuery.trim().slice(0, 70)}”</strong>
                          <small>Press Search or Enter to continue</small>
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <form className="quick-note" onSubmit={captureQuickNote}>
                  <span className="quick-note-tape" aria-hidden="true" />
                  <header>
                    <span className="quick-note-accent" aria-hidden="true">
                      <Icon name="edit" />
                    </span>
                    <strong>
                      Leave a note
                      <br />
                      for later you.
                    </strong>
                    <p>No organizing now. Every capture waits safely in your Inbox.</p>
                  </header>
                  <textarea
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    maxLength={2000}
                    placeholder="Write the thought before it disappears…"
                    aria-label="Quick capture note"
                  />
                  <div className="quick-note-actions">
                    <small>
                      Press Ctrl+Enter
                      <br />
                      to capture
                    </small>
                    <button type="submit" disabled={!quickNote.trim() || capturingQuickNote}>
                      {capturingQuickNote ? "Capturing…" : "Capture note"}
                      {!capturingQuickNote && <Icon name="arrow-right" />}
                    </button>
                  </div>
                  <footer>
                    <button type="button" onClick={() => showRunnableApp("daily-flow", "inbox")}>
                      <Icon name="library" /> Open capture Inbox
                    </button>
                    <span>{formatWaitingNotes(quickCaptureInboxCount)}</span>
                  </footer>
                </form>
              </div>
            )}

            {surface === "dashboard" && (
              <DashboardSurface
                greeting={greeting}
                desktopName={activeDesktop?.name ?? "Workspace"}
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
                onOpenTab={(tab) => void switchTab(tab)}
                onCloseTab={(tab) => void closeTab(tab.id)}
                onNewTab={() => void createTab(workspace.activeDesktopId, "browser")}
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
                onSearchTabContents={(tabIds, query) =>
                  window.lattice.browser.searchTabContents(tabIds, query)
                }
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
                      Your data stays on this device. Lattice never sees or stores your content.
                    </small>
                  </span>
                  <em>Local-first</em>
                </div>
              </div>
            )}

            {(surface === "library" || surface === "queue") && (
              <div className="trusted-surface library-surface">
                <header className="library-header">
                  <div>
                    <span className="eyebrow">
                      {surface === "queue" ? "Read with intention" : "Obsidian library"}
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
                        Connect vault
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
                    <p>Connect an Obsidian folder, then save any page with your own description.</p>
                    <div>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void connectVault(false)}
                      >
                        Choose Obsidian vault
                      </button>
                      <button type="button" onClick={() => void connectVault(true)}>
                        Try disposable vault
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

                  <section className="settings-card">
                    <div className="settings-card-icon violet">
                      <Icon name="reload" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Browsing continuity</span>
                      <h2>Restore tabs on launch</h2>
                      <p>
                        Remember HTTPS URLs and desktop membership. History, forms, and page content
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
                      <legend className="sr-only">Lattice theme</legend>
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
                        out of websites but does not touch other profiles or Obsidian notes.
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

                  <section className="settings-card">
                    <div className="settings-card-icon green">
                      <Icon name="folder" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">Obsidian</span>
                      <h2>{vault ? "Vault connected" : "No vault connected"}</h2>
                      <p>
                        {vault
                          ? `${vault.displayPath}. Disconnecting forgets this location and never deletes Markdown.`
                          : "Choose a local Obsidian vault to capture pages and manage your reading queue."}
                      </p>
                    </div>
                    {vault ? (
                      <button
                        type="button"
                        className="settings-action"
                        onClick={() => void disconnectVault()}
                      >
                        Disconnect vault
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-action primary"
                        onClick={() => void connectVault(false)}
                      >
                        Connect vault
                      </button>
                    )}
                  </section>

                  <section className="settings-card about-card">
                    <div className="settings-card-icon amber">
                      <Icon name="lock" />
                    </div>
                    <div className="settings-card-copy">
                      <span className="settings-kicker">About</span>
                      <h2>Lattice 0.15.0</h2>
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
                  <span className="eyebrow">Save to Obsidian</span>
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
                  <h3>Connect your vault first</h3>
                  <p>Lattice writes plain Markdown. Nothing is locked inside the app.</p>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void connectVault(false)}
                  >
                    Choose Obsidian vault
                  </button>
                  <button type="button" onClick={() => void connectVault(true)}>
                    Use a disposable vault
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
                        {queueCapture ? "Saved to reading queue" : "Saved to Obsidian"}
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
    </div>
  );
}
