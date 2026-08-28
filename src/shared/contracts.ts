export const IPC = {
  browserSetBounds: "browser:set-bounds",
  browserNavigate: "browser:navigate",
  browserBack: "browser:back",
  browserForward: "browser:forward",
  browserReload: "browser:reload",
  browserSnapshot: "browser:snapshot",
  browserCreateTab: "browser:create-tab",
  browserSwitchTab: "browser:switch-tab",
  browserCloseTab: "browser:close-tab",
  browserSetVisible: "browser:set-visible",
  browserPrivacySummary: "browser:privacy-summary",
  browserClearWebsiteData: "browser:clear-website-data",
  browserState: "browser:state",
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
  vaultRevealCanvasReference: "vault:reveal-canvas-reference",
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
  | "show-settings";

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
}

export interface BrowserSnapshot {
  activeTabId: string;
  tabs: BrowserState[];
}

export interface BrowserPrivacySummary {
  cookieCount: number;
  cacheBytes: number;
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

export interface LatticeApi {
  shell: {
    onCommand(listener: (command: ShellCommand) => void): () => void;
  };
  browser: {
    setBounds(bounds: BrowserBounds): Promise<void>;
    navigate(input: string): Promise<void>;
    back(): Promise<void>;
    forward(): Promise<void>;
    reload(): Promise<void>;
    snapshot(): Promise<BrowserSnapshot>;
    createTab(input?: string): Promise<BrowserSnapshot>;
    switchTab(tabId: string): Promise<BrowserSnapshot>;
    closeTab(tabId: string): Promise<BrowserSnapshot>;
    setVisible(visible: boolean): Promise<void>;
    privacySummary(): Promise<BrowserPrivacySummary>;
    clearWebsiteData(): Promise<BrowserPrivacySummary>;
    onState(listener: (state: BrowserState) => void): () => void;
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
    revealCanvasReference(input: RevealCanvasReferenceInput): Promise<void>;
    disconnect(): Promise<void>;
  };
}
