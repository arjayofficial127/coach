import { contextBridge, ipcRenderer } from "electron";
import { type BrowserState, IPC, type LatticeApi, type ShellCommand } from "../shared/contracts";

const api: LatticeApi = {
  shell: {
    onCommand: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, command: ShellCommand) =>
        listener(command);
      ipcRenderer.on(IPC.shellCommand, handler);
      return () => ipcRenderer.removeListener(IPC.shellCommand, handler);
    },
  },
  browser: {
    setBounds: (bounds) => ipcRenderer.invoke(IPC.browserSetBounds, bounds),
    navigate: (input) => ipcRenderer.invoke(IPC.browserNavigate, input),
    back: () => ipcRenderer.invoke(IPC.browserBack),
    forward: () => ipcRenderer.invoke(IPC.browserForward),
    reload: () => ipcRenderer.invoke(IPC.browserReload),
    snapshot: () => ipcRenderer.invoke(IPC.browserSnapshot),
    createTab: (input) => ipcRenderer.invoke(IPC.browserCreateTab, input),
    switchTab: (tabId) => ipcRenderer.invoke(IPC.browserSwitchTab, tabId),
    closeTab: (tabId) => ipcRenderer.invoke(IPC.browserCloseTab, tabId),
    setVisible: (visible) => ipcRenderer.invoke(IPC.browserSetVisible, visible),
    privacySummary: () => ipcRenderer.invoke(IPC.browserPrivacySummary),
    clearWebsiteData: () => ipcRenderer.invoke(IPC.browserClearWebsiteData),
    onState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => listener(state);
      ipcRenderer.on(IPC.browserState, handler);
      return () => ipcRenderer.removeListener(IPC.browserState, handler);
    },
  },
  vault: {
    createDisposable: () => ipcRenderer.invoke(IPC.vaultCreateDisposable),
    choose: () => ipcRenderer.invoke(IPC.vaultChoose),
    current: () => ipcRenderer.invoke(IPC.vaultCurrent),
    saveProbeNote: (input) => ipcRenderer.invoke(IPC.vaultSaveProbeNote, input),
    listSavedLinks: () => ipcRenderer.invoke(IPC.vaultListSavedLinks),
    setReadingStatus: (input) => ipcRenderer.invoke(IPC.vaultSetReadingStatus, input),
    updateSavedLinkMetadata: (input) => ipcRenderer.invoke(IPC.vaultUpdateSavedLinkMetadata, input),
    openSavedLinkInObsidian: (id) => ipcRenderer.invoke(IPC.vaultOpenSavedLinkInObsidian, id),
    revealSavedLink: (id) => ipcRenderer.invoke(IPC.vaultRevealSavedLink, id),
    listCanvasPages: () => ipcRenderer.invoke(IPC.vaultListCanvasPages),
    createCanvasPage: (input) => ipcRenderer.invoke(IPC.vaultCreateCanvasPage, input),
    getCanvasPage: (id) => ipcRenderer.invoke(IPC.vaultGetCanvasPage, id),
    saveCanvasPage: (input) => ipcRenderer.invoke(IPC.vaultSaveCanvasPage, input),
    revealCanvasReference: (input) => ipcRenderer.invoke(IPC.vaultRevealCanvasReference, input),
    referenceIndex: () => ipcRenderer.invoke(IPC.vaultReferenceIndex),
    disconnect: () => ipcRenderer.invoke(IPC.vaultDisconnect),
  },
};

contextBridge.exposeInMainWorld("lattice", api);
