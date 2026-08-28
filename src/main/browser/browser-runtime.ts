import { randomUUID } from "node:crypto";
import type {
  BrowserWindow,
  Certificate,
  DownloadItem,
  Event,
  Session,
  WebContents,
  WebPreferences,
} from "electron";
import { app, WebContentsView } from "electron";
import type {
  BrowserBounds,
  BrowserPrivacySummary,
  BrowserSnapshot,
  BrowserState,
} from "../../shared/contracts";
import { IPC } from "../../shared/contracts";
import { constrainBrowserBounds } from "../policies/bounds";
import { isAllowedRemoteNavigation, normalizeHttpUrl } from "../policies/navigation";

const REMOTE_SECURITY_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
} satisfies WebPreferences;

export interface BrowserRuntimeOptions {
  partition?: string;
}

interface TabRecord {
  id: string;
  view: WebContentsView;
  contents: WebContents;
  state: BrowserState;
}

export class BrowserRuntime {
  private readonly tabs = new Map<string, TabRecord>();
  private readonly allContents: WebContents[] = [];
  private readonly remoteSession: Session;
  private readonly partition: string;
  private activeTabId: string;
  private closed = false;
  private visible = false;
  private lastBounds: BrowserBounds | null = null;
  private popupHandlerTriggered = false;
  private permissionCheckHandlerTriggered = false;

  constructor(
    private readonly window: BrowserWindow,
    options: BrowserRuntimeOptions = {},
  ) {
    this.partition = options.partition ?? "persist:lattice-remote";
    const initialTab = this.createTabRecord();
    this.tabs.set(initialTab.id, initialTab);
    this.activeTabId = initialTab.id;
    this.remoteSession = initialTab.contents.session;
    this.configureSessionPolicy();
    this.configureTab(initialTab);
  }

  async navigate(input: string): Promise<void> {
    await this.navigateTab(this.activeTab(), input);
  }

  async createTab(input?: string): Promise<BrowserSnapshot> {
    const tab = this.createTabRecord();
    this.tabs.set(tab.id, tab);
    this.configureTab(tab);
    this.activate(tab.id);
    if (input && input !== "about:blank") {
      void this.navigateTab(tab, input).catch((error) => {
        if (tab.contents.isDestroyed()) return;
        tab.state.loading = false;
        tab.state.error = error instanceof Error ? error.message : String(error);
        this.emitState(tab);
      });
    }
    return this.snapshot();
  }

  switchTab(tabId: string): BrowserSnapshot {
    this.requireTab(tabId);
    this.activate(tabId);
    return this.snapshot();
  }

  closeTab(tabId: string): BrowserSnapshot {
    const tab = this.requireTab(tabId);
    const tabIds = [...this.tabs.keys()];
    const closedIndex = tabIds.indexOf(tabId);
    const wasActive = tabId === this.activeTabId;
    this.tabs.delete(tabId);
    this.disposeTab(tab);

    if (this.tabs.size === 0) {
      const replacement = this.createTabRecord();
      this.tabs.set(replacement.id, replacement);
      this.configureTab(replacement);
      this.activeTabId = replacement.id;
    } else if (wasActive) {
      const nextId = tabIds[closedIndex + 1] ?? tabIds[closedIndex - 1];
      if (nextId) this.activeTabId = nextId;
    }
    this.activate(this.activeTabId);
    return this.snapshot();
  }

  snapshot(): BrowserSnapshot {
    return {
      activeTabId: this.activeTabId,
      tabs: [...this.tabs.values()].map((tab) => ({ ...tab.state })),
    };
  }

  setBounds(requested: BrowserBounds): void {
    const [width, height] = this.window.getContentSize();
    this.lastBounds = constrainBrowserBounds(requested, {
      width: width ?? 1,
      height: height ?? 1,
    });
    const tab = this.activeTab();
    tab.view.setBounds(this.lastBounds);
    tab.view.setVisible(this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!this.closed) this.activeTab().view.setVisible(visible);
  }

  back(): void {
    const contents = this.activeTab().contents;
    if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
  }

  forward(): void {
    const contents = this.activeTab().contents;
    if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
  }

  reload(): void {
    this.activeTab().contents.reload();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.remoteSession.removeListener("will-download", this.onWillDownload);
    app.removeListener("select-client-certificate", this.onSelectClientCertificate);
    for (const tab of this.tabs.values()) this.disposeTab(tab);
    this.tabs.clear();
  }

  getBounds(): BrowserBounds {
    return this.activeTab().view.getBounds();
  }

  isVisible(): boolean {
    return !this.closed && this.activeTab().view.getVisible();
  }

  async privacySummary(): Promise<BrowserPrivacySummary> {
    const [cookies, cacheBytes] = await Promise.all([
      this.remoteSession.cookies.get({}),
      this.remoteSession.getCacheSize(),
    ]);
    return { cookieCount: cookies.length, cacheBytes };
  }

  async clearWebsiteData(): Promise<BrowserPrivacySummary> {
    await Promise.all([
      this.remoteSession.clearData({
        dataTypes: [
          "backgroundFetch",
          "cache",
          "cookies",
          "fileSystems",
          "indexedDB",
          "localStorage",
          "serviceWorkers",
          "webSQL",
        ],
      }),
      this.remoteSession.clearAuthCache(),
    ]);
    return this.privacySummary();
  }

  async collectPrivacyClearProbe(): Promise<{
    before: BrowserPrivacySummary;
    after: BrowserPrivacySummary;
    cookieSeeded: boolean;
    localStorageSeeded: boolean;
    cacheStorageSeeded: boolean;
    cookieCleared: boolean;
    localStorageCleared: boolean;
    cacheStorageCleared: boolean;
  }> {
    const tab = this.activeTab();
    const seeded = (await tab.contents.executeJavaScript(`(async () => {
      document.cookie = "lattice_privacy_probe=present; SameSite=Lax";
      localStorage.setItem("lattice_privacy_probe", "present");
      const cache = await caches.open("lattice-privacy-probe");
      await cache.put("/lattice-privacy-probe", new Response("present"));
      return {
        cookieSeeded: document.cookie.includes("lattice_privacy_probe=present"),
        localStorageSeeded: localStorage.getItem("lattice_privacy_probe") === "present",
        cacheStorageSeeded: (await caches.keys()).includes("lattice-privacy-probe")
      };
    })()`)) as {
      cookieSeeded: boolean;
      localStorageSeeded: boolean;
      cacheStorageSeeded: boolean;
    };
    const before = await this.privacySummary();
    const after = await this.clearWebsiteData();
    const cleared = (await tab.contents.executeJavaScript(`(async () => ({
      cookieCleared: !document.cookie.includes("lattice_privacy_probe=present"),
      localStorageCleared: localStorage.getItem("lattice_privacy_probe") === null,
      cacheStorageCleared: !(await caches.keys()).includes("lattice-privacy-probe")
    }))()`)) as {
      cookieCleared: boolean;
      localStorageCleared: boolean;
      cacheStorageCleared: boolean;
    };
    return { before, after, ...seeded, ...cleared };
  }

  async collectSecurityProbe(): Promise<{
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
    url: string;
    title: string;
    configuredPreferences: Record<string, boolean>;
    webContentsType: string;
    nativeViewConstructor: string;
    sessionSeparatedFromShell: boolean;
    screenshot: Buffer;
    screenshotMethod: "capture-page" | "devtools-protocol";
  }> {
    const tab = this.activeTab();
    this.popupHandlerTriggered = false;
    this.permissionCheckHandlerTriggered = false;
    const isolation = (await tab.contents.executeJavaScript(
      `(async () => {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        return {
          nodeProcessVisible: typeof process !== "undefined" && Boolean(process?.versions?.node),
          requireVisible: typeof require !== "undefined",
          latticeBridgeVisible: typeof window.lattice !== "undefined",
          webviewTagApiVisible: typeof document.createElement("webview").loadURL === "function",
          popupReturnedNull: window.open("https://example.com/popup") === null,
          geolocationPermissionState: permission.state
        };
      })()`,
      true,
    )) as {
      nodeProcessVisible: boolean;
      requireVisible: boolean;
      latticeBridgeVisible: boolean;
      webviewTagApiVisible: boolean;
      popupReturnedNull: boolean;
      geolocationPermissionState: string;
    };
    let screenshot: Buffer;
    let screenshotMethod: "capture-page" | "devtools-protocol" = "capture-page";
    try {
      const image = await tab.contents.capturePage();
      if (image.isEmpty()) throw new Error("Electron returned an empty native-view capture.");
      screenshot = image.toPNG();
    } catch {
      screenshotMethod = "devtools-protocol";
      screenshot = await this.captureWithDevToolsProtocol(tab.contents);
    }

    return {
      isolation: {
        ...isolation,
        popupHandlerTriggered: this.popupHandlerTriggered,
        permissionCheckHandlerTriggered: this.permissionCheckHandlerTriggered,
      },
      url: tab.contents.getURL(),
      title: tab.contents.getTitle(),
      configuredPreferences: {
        nodeIntegration: REMOTE_SECURITY_PREFERENCES.nodeIntegration,
        nodeIntegrationInWorker: REMOTE_SECURITY_PREFERENCES.nodeIntegrationInWorker,
        nodeIntegrationInSubFrames: REMOTE_SECURITY_PREFERENCES.nodeIntegrationInSubFrames,
        contextIsolation: REMOTE_SECURITY_PREFERENCES.contextIsolation,
        sandbox: REMOTE_SECURITY_PREFERENCES.sandbox,
        webSecurity: REMOTE_SECURITY_PREFERENCES.webSecurity,
        allowRunningInsecureContent: REMOTE_SECURITY_PREFERENCES.allowRunningInsecureContent,
        experimentalFeatures: REMOTE_SECURITY_PREFERENCES.experimentalFeatures,
        webviewTag: REMOTE_SECURITY_PREFERENCES.webviewTag,
        preloadConfigured: false,
      },
      webContentsType: tab.contents.getType(),
      nativeViewConstructor: tab.view.constructor.name,
      sessionSeparatedFromShell: tab.contents.session !== this.window.webContents.session,
      screenshot,
      screenshotMethod,
    };
  }

  isDestroyed(): boolean {
    return (
      this.allContents.length > 0 && this.allContents.every((contents) => contents.isDestroyed())
    );
  }

  private createTabRecord(): TabRecord {
    const id = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        partition: this.partition,
        ...REMOTE_SECURITY_PREFERENCES,
        spellcheck: true,
      },
    });
    const contents = view.webContents;
    const tab: TabRecord = {
      id,
      view,
      contents,
      state: {
        id,
        url: "about:blank",
        title: "New tab",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        error: null,
      },
    };
    this.allContents.push(contents);
    this.window.contentView.addChildView(view);
    view.setVisible(false);
    return tab;
  }

  private configureSessionPolicy(): void {
    this.remoteSession.setPermissionCheckHandler(() => {
      this.permissionCheckHandlerTriggered = true;
      return false;
    });
    this.remoteSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    this.remoteSession.setDevicePermissionHandler(() => false);
    this.remoteSession.on("will-download", this.onWillDownload);
    app.on("select-client-certificate", this.onSelectClientCertificate);
  }

  private configureTab(tab: TabRecord): void {
    tab.contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown" || (!input.control && !input.meta)) return;
      const command =
        input.key.toLowerCase() === "l"
          ? "focus-location"
          : input.key.toLowerCase() === "t"
            ? "new-tab"
            : input.key.toLowerCase() === "w"
              ? "close-tab"
              : input.key.toLowerCase() === "k"
                ? "search"
                : null;
      if (!command) return;
      event.preventDefault();
      if (!this.window.isDestroyed()) this.window.webContents.send(IPC.shellCommand, command);
    });
    tab.contents.setWindowOpenHandler(({ url }) => {
      this.popupHandlerTriggered = true;
      tab.state.error = isAllowedRemoteNavigation(url)
        ? "Popups are blocked in this phase; OAuth handling remains a gated capability."
        : "A website attempted to open a blocked protocol.";
      this.emitState(tab);
      return { action: "deny" };
    });
    tab.contents.on("will-navigate", (details) => {
      if (!isAllowedRemoteNavigation(details.url)) {
        details.preventDefault();
        tab.state.error = "Navigation to a non-HTTPS protocol was blocked.";
        this.emitState(tab);
      }
    });
    tab.contents.on("will-redirect", (details) => {
      if (!isAllowedRemoteNavigation(details.url)) {
        details.preventDefault();
        tab.state.error = "A redirect to a non-HTTPS protocol was blocked.";
        this.emitState(tab);
      }
    });
    this.bindEvents(tab);
  }

  private bindEvents(tab: TabRecord): void {
    const syncNavigationState = () => {
      tab.state.url = tab.contents.getURL();
      tab.state.canGoBack = tab.contents.navigationHistory.canGoBack();
      tab.state.canGoForward = tab.contents.navigationHistory.canGoForward();
      if (!tab.state.title && tab.state.url !== "about:blank") tab.state.title = tab.state.url;
      this.emitState(tab);
    };
    tab.contents.on("did-start-loading", () => {
      tab.state.loading = true;
      this.emitState(tab);
    });
    tab.contents.on("did-stop-loading", () => {
      tab.state.loading = false;
      syncNavigationState();
    });
    tab.contents.on("did-navigate", syncNavigationState);
    tab.contents.on("did-navigate-in-page", syncNavigationState);
    tab.contents.on("page-title-updated", (_event, title) => {
      tab.state.title = title;
      this.emitState(tab);
    });
    tab.contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        tab.state.error = `${description} (${code}) while loading ${url}`;
        tab.state.loading = false;
        this.emitState(tab);
      }
    });
    tab.contents.on("render-process-gone", (_event, details) => {
      tab.state.error = `The website renderer exited: ${details.reason}.`;
      tab.state.loading = false;
      this.emitState(tab);
    });
  }

  private async navigateTab(tab: TabRecord, input: string): Promise<void> {
    const url = normalizeHttpUrl(input);
    tab.state.url = url;
    tab.state.title = url;
    tab.state.loading = true;
    tab.state.error = null;
    this.emitState(tab);
    await tab.contents.loadURL(url);
  }

  private activate(tabId: string): void {
    for (const [id, tab] of this.tabs) tab.view.setVisible(id === tabId && this.visible);
    this.activeTabId = tabId;
    const tab = this.activeTab();
    if (this.lastBounds) tab.view.setBounds(this.lastBounds);
    tab.view.setVisible(this.visible);
    this.emitState(tab);
  }

  private activeTab(): TabRecord {
    return this.requireTab(this.activeTabId);
  }

  private requireTab(tabId: string): TabRecord {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error("Unknown browser tab.");
    return tab;
  }

  private disposeTab(tab: TabRecord): void {
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
    if (!tab.contents.isDestroyed()) tab.contents.close();
  }

  private emitState(tab: TabRecord): void {
    if (!this.window.isDestroyed())
      this.window.webContents.send(IPC.browserState, { ...tab.state });
  }

  private readonly onWillDownload = (event: Event, item: DownloadItem): void => {
    event.preventDefault();
    item.cancel();
    const tab = this.tabs.get(this.activeTabId);
    if (tab) {
      tab.state.error = "Downloads are intentionally blocked in this phase.";
      this.emitState(tab);
    }
  };

  private readonly onSelectClientCertificate = (
    event: Event,
    webContents: WebContents,
    _url: string,
    _certificateList: Certificate[],
    callback: (certificate?: Certificate) => void,
  ): void => {
    if (![...this.tabs.values()].some((tab) => tab.contents === webContents)) return;
    event.preventDefault();
    callback();
  };

  private async captureWithDevToolsProtocol(contents: WebContents): Promise<Buffer> {
    const client = contents.debugger;
    const attachedHere = !client.isAttached();
    if (attachedHere) client.attach("1.3");
    try {
      await client.sendCommand("Page.enable");
      const result = (await client.sendCommand("Page.captureScreenshot", {
        format: "png",
        fromSurface: false,
      })) as { data?: string };
      if (!result.data) throw new Error("DevTools screenshot did not return image data.");
      return Buffer.from(result.data, "base64");
    } finally {
      if (attachedHere && client.isAttached()) client.detach();
    }
  }
}
