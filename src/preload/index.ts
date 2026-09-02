import { contextBridge, ipcRenderer } from "electron";
import {
  type BrowserLinkAction,
  type BrowserState,
  IPC,
  type LatticeApi,
  type ShellCommand,
} from "../shared/contracts";

const api: LatticeApi = {
  shell: {
    setAppearance: (input) => ipcRenderer.invoke(IPC.shellSetAppearance, input),
    getZoom: () => ipcRenderer.invoke(IPC.shellGetZoom),
    setZoom: (percent) => ipcRenderer.invoke(IPC.shellSetZoom, percent),
    onCommand: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, command: ShellCommand) =>
        listener(command);
      ipcRenderer.on(IPC.shellCommand, handler);
      return () => ipcRenderer.removeListener(IPC.shellCommand, handler);
    },
  },
  browser: {
    setBounds: (bounds) => ipcRenderer.invoke(IPC.browserSetBounds, bounds),
    setLivePreviews: (previews) => ipcRenderer.invoke(IPC.browserSetLivePreviews, previews),
    navigate: (input) => ipcRenderer.invoke(IPC.browserNavigate, input),
    back: () => ipcRenderer.invoke(IPC.browserBack),
    forward: () => ipcRenderer.invoke(IPC.browserForward),
    reload: () => ipcRenderer.invoke(IPC.browserReload),
    snapshot: () => ipcRenderer.invoke(IPC.browserSnapshot),
    captureTabPreview: (tabId) => ipcRenderer.invoke(IPC.browserCaptureTabPreview, tabId),
    searchTabContents: (tabIds, query) =>
      ipcRenderer.invoke(IPC.browserSearchTabContents, { tabIds, query }),
    loadSiteIcons: (urls) => ipcRenderer.invoke(IPC.browserLoadSiteIcons, urls),
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
    onLinkAction: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, action: BrowserLinkAction) =>
        listener(action);
      ipcRenderer.on(IPC.browserLinkAction, handler);
      return () => ipcRenderer.removeListener(IPC.browserLinkAction, handler);
    },
  },
  profiles: {
    state: () => ipcRenderer.invoke(IPC.profilesState),
    create: (input) => ipcRenderer.invoke(IPC.profilesCreate, input),
    update: (input) => ipcRenderer.invoke(IPC.profilesUpdate, input),
    chooseAvatar: (profileId) => ipcRenderer.invoke(IPC.profilesChooseAvatar, profileId),
    clearAvatar: (profileId) => ipcRenderer.invoke(IPC.profilesClearAvatar, profileId),
    switch: (profileId) => ipcRenderer.invoke(IPC.profilesSwitch, profileId),
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
    trashSavedLink: (id) => ipcRenderer.invoke(IPC.vaultTrashSavedLink, id),
    trashCanvasPage: (id) => ipcRenderer.invoke(IPC.vaultTrashCanvasPage, id),
    restoreTrash: (token) => ipcRenderer.invoke(IPC.vaultRestoreTrash, token),
    revealCanvasReference: (input) => ipcRenderer.invoke(IPC.vaultRevealCanvasReference, input),
    referenceIndex: () => ipcRenderer.invoke(IPC.vaultReferenceIndex),
    disconnect: () => ipcRenderer.invoke(IPC.vaultDisconnect),
  },
  localWorkspace: {
    syncDesktops: (desktops) => ipcRenderer.invoke(IPC.workspaceSyncDesktops, desktops),
    captureInbox: (input) => ipcRenderer.invoke(IPC.workspaceCaptureInbox, input),
    revealDesktop: (desktopId) => ipcRenderer.invoke(IPC.workspaceRevealDesktop, desktopId),
    listDirectory: (input) => ipcRenderer.invoke(IPC.workspaceListDirectory, input),
    readFile: (input) => ipcRenderer.invoke(IPC.workspaceReadFile, input),
    createEntry: (input) => ipcRenderer.invoke(IPC.workspaceCreateEntry, input),
    saveFile: (input) => ipcRenderer.invoke(IPC.workspaceSaveFile, input),
    renameEntry: (input) => ipcRenderer.invoke(IPC.workspaceRenameEntry, input),
  },
};

contextBridge.exposeInMainWorld("lattice", api);
