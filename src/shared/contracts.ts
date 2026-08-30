export const IPC = {
  shellSetAppearance: "shell:set-appearance",
  shellGetZoom: "shell:get-zoom",
  shellSetZoom: "shell:set-zoom",
  browserSetBounds: "browser:set-bounds",
  browserNavigate: "browser:navigate",
  browserBack: "browser:back",
  browserForward: "browser:forward",
  browserReload: "browser:reload",
  browserSnapshot: "browser:snapshot",
  browserCaptureTabPreview: "browser:capture-tab-preview",
  browserSearchTabContents: "browser:search-tab-contents",
  browserCreateTab: "browser:create-tab",
  browserSwitchTab: "browser:switch-tab",
  browserCloseTab: "browser:close-tab",
  browserSetVisible: "browser:set-visible",
  browserPrivacySummary: "browser:privacy-summary",
  browserClearWebsiteData: "browser:clear-website-data",
  browserState: "browser:state",
  profilesState: "profiles:state",
  profilesCreate: "profiles:create",
  profilesUpdate: "profiles:update",
  profilesChooseAvatar: "profiles:choose-avatar",
  profilesClearAvatar: "profiles:clear-avatar",
  profilesSwitch: "profiles:switch",
  shellCommand: "shell:command",
  vaultCreateDisposable: "vault:create-disposable",
  vaultChoose: "vault:choose",
  vaultCurrent: "vault:current",
  vaultSaveProbeNote: "vault:save-probe-note",
  vaultListSavedLinks: "vault:list-saved-links",
  vaultSetReadingStatus: "vault:set-reading-status",
  vaultUpdateSavedLinkMetadata: "vault:update-saved-link-metadata",
  vaultOpenSavedLinkInObsidian: "vault:open-saved-link-in-obsidian",
  vaultRevealSavedLink: "vault:reveal-saved-link",
  vaultListCanvasPages: "vault:list-canvas-pages",
  vaultCreateCanvasPage: "vault:create-canvas-page",
  vaultGetCanvasPage: "vault:get-canvas-page",
  vaultSaveCanvasPage: "vault:save-canvas-page",
  vaultTrashSavedLink: "vault:trash-saved-link",
  vaultTrashCanvasPage: "vault:trash-canvas-page",
  vaultRestoreTrash: "vault:restore-trash",
  vaultRevealCanvasReference: "vault:reveal-canvas-reference",
  vaultReferenceIndex: "vault:reference-index",
  vaultDisconnect: "vault:disconnect",
} as const;

export type ShellCommand =
  | "focus-location"
  | "new-tab"
  | "close-tab"
  | "search"
  | "toggle-focus"
  | "show-focus"
  | "show-browser"
  | "show-pages"
  | "show-library"
  | "show-queue"
  | "show-apps"
  | "show-settings"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset";

export interface ShellAppearance {
  backgroundColor: string;
  symbolColor: string;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
  siteIconDataUrl?: string | null;
}

export interface BrowserSnapshot {
  activeTabId: string;
  tabs: BrowserState[];
}

export interface BrowserPrivacySummary {
  cookieCount: number;
  cacheBytes: number;
}

export interface ProfileSummary {
  id: string;
  name: string;
  avatarDataUrl: string | null;
  primary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileState {
  activeProfileId: string;
  profiles: ProfileSummary[];
}

export interface CreateProfileInput {
  name: string;
}

export interface UpdateProfileInput {
  id: string;
  name: string;
}

export interface ProfileSwitchResult {
  state: ProfileState;
  browser: BrowserSnapshot;
}

export interface VaultInfo {
  id: string;
  displayPath: string;
  disposable: boolean;
}

export interface ProbeNoteInput {
  title: string;
  url: string;
  description: string;
  folder?: string;
  desktopId?: string;
  readingStatus?: Extract<ReadingStatus, "saved" | "queued">;
}

export type ReadingStatus = "saved" | "queued" | "read";

export interface SaveNoteResult {
  id: string;
  title: string;
  url: string;
  description: string;
  savedAt: string;
  folder: string;
  desktopId: string;
  readingStatus: ReadingStatus;
  queuedAt: string;
  readAt: string;
  relativePath: string;
  absolutePath: string;
  bytesWritten: number;
}

export interface VaultTrashResult {
  token: string;
  kind: "saved-link" | "canvas-page";
  title: string;
}

export interface SavedLinkRecord {
  id: string;
  title: string;
  url: string;
  description: string;
  savedAt: string;
  folder: string;
  desktopId: string;
  readingStatus: ReadingStatus;
  queuedAt: string;
  readAt: string;
  relativePath: string;
}

export interface SetReadingStatusInput {
  id: string;
  status: ReadingStatus;
}

export interface UpdateSavedLinkMetadataInput {
  id: string;
  title: string;
  description: string;
}

export type CanvasLinkKind = "page" | "object" | "url" | "document" | "image" | "file";

export interface CanvasTypedLink {
  id: string;
  label: string;
  kind: CanvasLinkKind;
  target: string;
}

export interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface CanvasTextNode extends CanvasNodeBase {
  type: "text";
  text: string;
  latticeKind: "note" | "links";
  latticeTitle: string;
  latticeLinks?: CanvasTypedLink[];
}

export interface CanvasWebsiteNode extends CanvasNodeBase {
  type: "link";
  url: string;
  latticeKind: "iframe";
  latticeTitle: string;
  latticeDescription: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
  type: "file";
  file: string;
  subpath?: string;
  latticeKind: "document" | "image" | "file";
  latticeTitle: string;
  latticeDescription: string;
}

export type CanvasPageNode = CanvasTextNode | CanvasWebsiteNode | CanvasFileNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toNode: string;
  toSide?: "top" | "right" | "bottom" | "left";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
}

export interface CanvasPageSummary {
  id: string;
  title: string;
  description: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
}

export interface CanvasPageRecord extends CanvasPageSummary {
  version: 1;
  nodes: CanvasPageNode[];
  edges: CanvasEdge[];
}

export interface CreateCanvasPageInput {
  title: string;
  description: string;
  folder: string;
}

export interface SaveCanvasPageInput {
  id: string;
  title: string;
  description: string;
  nodes: CanvasPageNode[];
  edges: CanvasEdge[];
}

export interface RevealCanvasReferenceInput {
  pageId: string;
  nodeId: string;
  linkId?: string;
}

export type VaultReferenceStatus = "resolved" | "unresolved" | "external";

export interface VaultReferenceSource {
  kind: "page" | "saved-link";
  id: string;
  title: string;
  objectId?: string;
  objectTitle?: string;
}

export interface VaultReferenceEntry {
  id: string;
  kind: CanvasLinkKind;
  source: VaultReferenceSource;
  label: string;
  targetKey: string;
  targetLabel: string;
  status: VaultReferenceStatus;
  diagnostic: string;
  repairHint: string;
}

export interface VaultReferenceIndex {
  generatedAt: string;
  entries: VaultReferenceEntry[];
  unresolvedCount: number;
}

export interface LatticeApi {
  shell: {
    onCommand(listener: (command: ShellCommand) => void): () => void;
    setAppearance(input: ShellAppearance): Promise<ShellAppearance>;
    getZoom(): Promise<number>;
    setZoom(percent: number): Promise<number>;
  };
  browser: {
    setBounds(bounds: BrowserBounds): Promise<void>;
    navigate(input: string): Promise<void>;
    back(): Promise<void>;
    forward(): Promise<void>;
    reload(): Promise<void>;
    snapshot(): Promise<BrowserSnapshot>;
    captureTabPreview(tabId: string): Promise<string | null>;
    searchTabContents(tabIds: string[], query: string): Promise<string[]>;
    createTab(input?: string): Promise<BrowserSnapshot>;
    switchTab(tabId: string): Promise<BrowserSnapshot>;
    closeTab(tabId: string): Promise<BrowserSnapshot>;
    setVisible(visible: boolean): Promise<void>;
    privacySummary(): Promise<BrowserPrivacySummary>;
    clearWebsiteData(): Promise<BrowserPrivacySummary>;
    onState(listener: (state: BrowserState) => void): () => void;
  };
  profiles: {
    state(): Promise<ProfileState>;
    create(input: CreateProfileInput): Promise<ProfileSwitchResult>;
    update(input: UpdateProfileInput): Promise<ProfileState>;
    chooseAvatar(profileId: string): Promise<ProfileState>;
    clearAvatar(profileId: string): Promise<ProfileState>;
    switch(profileId: string): Promise<ProfileSwitchResult>;
  };
  vault: {
    createDisposable(): Promise<VaultInfo>;
    choose(): Promise<VaultInfo | null>;
    current(): Promise<VaultInfo | null>;
    saveProbeNote(input: ProbeNoteInput): Promise<SaveNoteResult>;
    listSavedLinks(): Promise<SavedLinkRecord[]>;
    setReadingStatus(input: SetReadingStatusInput): Promise<SavedLinkRecord>;
    updateSavedLinkMetadata(input: UpdateSavedLinkMetadataInput): Promise<SavedLinkRecord>;
    openSavedLinkInObsidian(id: string): Promise<void>;
    revealSavedLink(id: string): Promise<void>;
    listCanvasPages(): Promise<CanvasPageSummary[]>;
    createCanvasPage(input: CreateCanvasPageInput): Promise<CanvasPageRecord>;
    getCanvasPage(id: string): Promise<CanvasPageRecord>;
    saveCanvasPage(input: SaveCanvasPageInput): Promise<CanvasPageRecord>;
    trashSavedLink(id: string): Promise<VaultTrashResult>;
    trashCanvasPage(id: string): Promise<VaultTrashResult>;
    restoreTrash(token: string): Promise<void>;
    revealCanvasReference(input: RevealCanvasReferenceInput): Promise<void>;
    referenceIndex(): Promise<VaultReferenceIndex>;
    disconnect(): Promise<void>;
  };
}
