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
  browserState: "browser:state",
  shellCommand: "shell:command",
  vaultCreateDisposable: "vault:create-disposable",
  vaultChoose: "vault:choose",
  vaultCurrent: "vault:current",
  vaultSaveProbeNote: "vault:save-probe-note",
  vaultListSavedLinks: "vault:list-saved-links",
} as const;

export type ShellCommand = "focus-location" | "new-tab" | "close-tab" | "search";

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
}

export interface SaveNoteResult {
  id: string;
  title: string;
  url: string;
  description: string;
  savedAt: string;
  folder: string;
  desktopId: string;
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
  relativePath: string;
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
    onState(listener: (state: BrowserState) => void): () => void;
  };
  vault: {
    createDisposable(): Promise<VaultInfo>;
    choose(): Promise<VaultInfo | null>;
    current(): Promise<VaultInfo | null>;
    saveProbeNote(input: ProbeNoteInput): Promise<SaveNoteResult>;
    listSavedLinks(): Promise<SavedLinkRecord[]>;
  };
}
