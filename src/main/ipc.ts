import { app, type BrowserWindow, type IpcMainInvokeEvent, ipcMain, shell } from "electron";
import { z } from "zod";
import type {
  BrowserBounds,
  BrowserPrivacySummary,
  BrowserSnapshot,
  ProfileState,
  ProfileSwitchResult,
} from "../shared/contracts";
import { IPC } from "../shared/contracts";
import { isTrustedShellUrl } from "./policies/shell-origin";
import {
  parseCreateCanvasPageInput,
  parseRevealCanvasReferenceInput,
  parseSaveCanvasPageInput,
} from "./vault/canvas-page";
import type { VaultService } from "./vault/vault-service";

const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const noteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z
    .string()
    .url()
    .max(2048)
    .refine((value) => value.startsWith("https://"), {
      message: "Only HTTPS source URLs are allowed.",
    }),
  description: z.string().max(4000),
  folder: z.string().trim().max(80).optional(),
  desktopId: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  readingStatus: z.enum(["saved", "queued"]).optional(),
});

const readingStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["saved", "queued", "read"]),
});

const savedLinkMetadataSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
});

const tabIdSchema = z.string().uuid();
const profileIdSchema = z.string().uuid();
const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
});
const updateProfileSchema = createProfileSchema.extend({ id: profileIdSchema });

function assertTrustedShell(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  const frameUrl = event.senderFrame?.url ?? "";
  const trustedUrl = isTrustedShellUrl(
    frameUrl,
    app.isPackaged,
    app.isPackaged ? undefined : process.env.LATTICE_DEV_SERVER_URL,
  );

  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !trustedUrl
  ) {
    throw new Error("Rejected IPC from an untrusted renderer.");
  }
}

export interface TrustedShellActions {
  openExternal(uri: string): Promise<void>;
  showItemInFolder(absolutePath: string): void;
}

const defaultShellActions: TrustedShellActions = {
  openExternal: (uri) => shell.openExternal(uri),
  showItemInFolder: (absolutePath) => shell.showItemInFolder(absolutePath),
};

export interface BrowserController {
  setBounds(bounds: BrowserBounds): void;
  navigate(input: string): Promise<void>;
  back(): void;
  forward(): void;
  reload(): void;
  snapshot(): BrowserSnapshot;
  createTab(input?: string): Promise<BrowserSnapshot>;
  switchTab(tabId: string): BrowserSnapshot;
  closeTab(tabId: string): BrowserSnapshot;
  setVisible(visible: boolean): void;
  privacySummary(): Promise<BrowserPrivacySummary>;
  clearWebsiteData(): Promise<BrowserPrivacySummary>;
}

export interface ProfileController {
  state(): ProfileState;
  createProfile(name: string): Promise<ProfileSwitchResult>;
  updateProfile(profileId: string, name: string): Promise<ProfileState>;
  chooseAvatar(profileId: string): Promise<ProfileState>;
  clearAvatar(profileId: string): Promise<ProfileState>;
  switchProfile(profileId: string): Promise<ProfileSwitchResult>;
}

export function registerIpc(
  window: BrowserWindow,
  browser: BrowserController,
  vault: VaultService,
  profiles: ProfileController,
  shellActions: TrustedShellActions = defaultShellActions,
): () => void {
  const handle = <T>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, payload: T) => unknown,
  ) => {
    ipcMain.handle(channel, (event, payload: T) => {
      assertTrustedShell(event, window);
      return handler(event, payload);
    });
  };

  handle(IPC.browserSetBounds, (_event, payload) => browser.setBounds(boundsSchema.parse(payload)));
  handle(IPC.browserNavigate, (_event, payload) => browser.navigate(z.string().parse(payload)));
  handle(IPC.browserBack, () => browser.back());
  handle(IPC.browserForward, () => browser.forward());
  handle(IPC.browserReload, () => browser.reload());
  handle(IPC.browserSnapshot, () => browser.snapshot());
  handle(IPC.browserCreateTab, (_event, payload) =>
    browser.createTab(z.string().optional().parse(payload)),
  );
  handle(IPC.browserSwitchTab, (_event, payload) => browser.switchTab(tabIdSchema.parse(payload)));
  handle(IPC.browserCloseTab, (_event, payload) => browser.closeTab(tabIdSchema.parse(payload)));
  handle(IPC.browserSetVisible, (_event, payload) =>
    browser.setVisible(z.boolean().parse(payload)),
  );
  handle(IPC.browserPrivacySummary, () => browser.privacySummary());
  handle(IPC.browserClearWebsiteData, () => browser.clearWebsiteData());
  handle(IPC.profilesState, () => profiles.state());
  handle(IPC.profilesCreate, (_event, payload) => {
    const input = createProfileSchema.parse(payload);
    return profiles.createProfile(input.name);
  });
  handle(IPC.profilesUpdate, (_event, payload) => {
    const input = updateProfileSchema.parse(payload);
    return profiles.updateProfile(input.id, input.name);
  });
  handle(IPC.profilesChooseAvatar, (_event, payload) =>
    profiles.chooseAvatar(profileIdSchema.parse(payload)),
  );
  handle(IPC.profilesClearAvatar, (_event, payload) =>
    profiles.clearAvatar(profileIdSchema.parse(payload)),
  );
  handle(IPC.profilesSwitch, (_event, payload) =>
    profiles.switchProfile(profileIdSchema.parse(payload)),
  );
  handle(IPC.vaultCreateDisposable, () => vault.createDisposable());
  handle(IPC.vaultChoose, () => vault.choose());
  handle(IPC.vaultCurrent, () => vault.current());
  handle(IPC.vaultSaveProbeNote, (_event, payload) =>
    vault.saveProbeNote(noteSchema.parse(payload)),
  );
  handle(IPC.vaultListSavedLinks, () => vault.listSavedLinks());
  handle(IPC.vaultSetReadingStatus, (_event, payload) =>
    vault.setReadingStatus(readingStatusSchema.parse(payload)),
  );
  handle(IPC.vaultUpdateSavedLinkMetadata, (_event, payload) =>
    vault.updateSavedLinkMetadata(savedLinkMetadataSchema.parse(payload)),
  );
  handle(IPC.vaultOpenSavedLinkInObsidian, async (_event, payload) => {
    const handoff = await vault.resolveSavedLinkHandoff(z.string().uuid().parse(payload));
    await shellActions.openExternal(handoff.obsidianUri);
  });
  handle(IPC.vaultRevealSavedLink, async (_event, payload) => {
    const handoff = await vault.resolveSavedLinkHandoff(z.string().uuid().parse(payload));
    shellActions.showItemInFolder(handoff.absolutePath);
  });
  handle(IPC.vaultListCanvasPages, () => vault.listCanvasPages());
  handle(IPC.vaultCreateCanvasPage, (_event, payload) =>
    vault.createCanvasPage(parseCreateCanvasPageInput(payload)),
  );
  handle(IPC.vaultGetCanvasPage, (_event, payload) =>
    vault.getCanvasPage(z.string().uuid().parse(payload)),
  );
  handle(IPC.vaultSaveCanvasPage, (_event, payload) =>
    vault.saveCanvasPage(parseSaveCanvasPageInput(payload)),
  );
  handle(IPC.vaultRevealCanvasReference, async (_event, payload) => {
    const absolutePath = await vault.resolveCanvasReference(
      parseRevealCanvasReferenceInput(payload),
    );
    shellActions.showItemInFolder(absolutePath);
  });
  handle(IPC.vaultReferenceIndex, () => vault.referenceIndex());
  handle(IPC.vaultDisconnect, () => vault.disconnect());

  return () => {
    for (const channel of Object.values(IPC)) {
      if (channel !== IPC.browserState && channel !== IPC.shellCommand) {
        ipcMain.removeHandler(channel);
      }
    }
  };
}
