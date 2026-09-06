import path from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpc } from "./ipc";
import { isTrustedShellUrl } from "./policies/shell-origin";
import { ProfileRuntime } from "./profiles/profile-runtime";
import { ProfileStore } from "./profiles/profile-store";
import { installLatticeProtocol, registerLatticeScheme } from "./protocol";
import { runNewTabReactivationSmoke, runPhaseNineSmoke } from "./smoke";
import { VaultService } from "./vault/vault-service";

registerLatticeScheme();
app.setName("Coach Browser");
app.enableSandbox();
app.commandLine.appendSwitch("autoplay-policy", "user-gesture-required");
if (process.platform === "win32") {
  app.setAppUserModelId("app.lattice.browser");
}

interface CoachWindowContext {
  window: BrowserWindow;
  runtime: ProfileRuntime;
  unregisterIpc: () => void;
}

const coachWindows = new Map<number, CoachWindowContext>();
let profileStore: ProfileStore | null = null;
let vaultService: VaultService | null = null;
let mostRecentWindowId: number | null = null;
let focusWhenReady = false;
let latticeProtocolInstalled = false;

function focusMostRecentWindow(): boolean {
  const recent = mostRecentWindowId ? coachWindows.get(mostRecentWindowId)?.window : null;
  const target =
    recent && !recent.isDestroyed()
      ? recent
      : [...coachWindows.values()].find(({ window }) => !window.isDestroyed())?.window;
  if (!target) return false;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
  mostRecentWindowId = target.id;
  return true;
}

async function openProfileWindow(profileId: string): Promise<void> {
  const existing = [...coachWindows.values()].find(
    ({ window, runtime }) => !window.isDestroyed() && runtime.activeProfile() === profileId,
  );
  if (existing) {
    if (existing.window.isMinimized()) existing.window.restore();
    existing.window.show();
    existing.window.focus();
    mostRecentWindowId = existing.window.id;
    return;
  }
  await createMainWindow(profileId);
}

async function createMainWindow(initialProfileId?: string): Promise<void> {
  if (!profileStore || !vaultService) throw new Error("Coach storage is not ready.");
  if (initialProfileId) await profileStore.activate(initialProfileId);
  const rendererRoot = path.join(__dirname, "../renderer");
  const devServerUrl = app.isPackaged ? undefined : process.env.LATTICE_DEV_SERVER_URL;

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: "Coach Browser",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#e9e9e5",
      symbolColor: "#2b2d31",
      height: 43,
    },
    backgroundColor: "#f2f2ef",
    webPreferences: {
      partition: "persist:lattice-shell",
      preload: path.join(__dirname, "preload.cjs"),
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
  mainWindow.setMenuBarVisibility(false);

  if (app.isPackaged && !latticeProtocolInstalled) {
    installLatticeProtocol(mainWindow.webContents.session, rendererRoot);
    latticeProtocolInstalled = true;
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (details) => {
    if (!isTrustedShellUrl(details.url, app.isPackaged, devServerUrl)) {
      details.preventDefault();
    }
  });

  const browserRuntime = new ProfileRuntime(mainWindow, profileStore, {
    initialProfileId,
    openProfileWindow,
  });
  const unregisterIpc = registerIpc(mainWindow, browserRuntime, vaultService, browserRuntime);
  coachWindows.set(mainWindow.id, { window: mainWindow, runtime: browserRuntime, unregisterIpc });
  mostRecentWindowId = mainWindow.id;

  const revealMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once("ready-to-show", revealMainWindow);
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) =>
    console.error(`[startup] renderer load failed: ${code} ${description} ${url}`),
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) =>
    console.error(`[startup] renderer process gone: ${details.reason}`),
  );
  mainWindow.on("close", () => {
    // Shell storage holds the restorable session. Chromium batches those writes, so force them
    // to disk before the window tears down instead of losing the last minutes of tab state.
    mainWindow.webContents.session.flushStorageData();
    browserRuntime.close();
  });
  mainWindow.on("closed", () => {
    unregisterIpc();
    coachWindows.delete(mainWindow.id);
    if (mostRecentWindowId === mainWindow.id) {
      mostRecentWindowId = [...coachWindows.keys()].at(-1) ?? null;
    }
  });
  mainWindow.on("focus", () => {
    mostRecentWindowId = mainWindow.id;
    void profileStore?.activate(browserRuntime.activeProfile()).catch((error) => {
      console.error("[profiles] could not remember the most recent profile", error);
    });
  });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadURL("lattice://app/index.html");
  }
  revealMainWindow();
  if (focusWhenReady) {
    focusWhenReady = false;
    focusMostRecentWindow();
  }
}

const newTabSmoke = process.argv.includes("--new-tab-reactivation-smoke");
const phaseSmoke =
  process.argv.includes("--phase4-smoke") ||
  process.argv.includes("--phase5-smoke") ||
  process.argv.includes("--phase6-smoke") ||
  process.argv.includes("--phase7-smoke") ||
  process.argv.includes("--phase8-smoke") ||
  process.argv.includes("--phase9-smoke");
const smokeRun = newTabSmoke || phaseSmoke;
const ownsSingleInstance = smokeRun || app.requestSingleInstanceLock();

if (!ownsSingleInstance) {
  app.quit();
} else if (!smokeRun) {
  app.on("second-instance", () => {
    if (!focusMostRecentWindow()) focusWhenReady = true;
  });
}

app.whenReady().then(async () => {
  if (!ownsSingleInstance) return;
  if (newTabSmoke) {
    try {
      const rendererRoot = path.join(__dirname, "../renderer");
      const evidence = await runNewTabReactivationSmoke(
        rendererRoot,
        path.join(__dirname, "preload.cjs"),
      );
      console.log(JSON.stringify(evidence));
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
    return;
  }

  if (phaseSmoke) {
    try {
      const rendererRoot = path.join(__dirname, "../renderer");
      const evidence = await runPhaseNineSmoke(rendererRoot, path.join(__dirname, "preload.cjs"));
      console.log(JSON.stringify(evidence));
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
    return;
  }

  try {
    profileStore = new ProfileStore(
      path.join(app.getPath("userData"), "profiles.json"),
      path.join(app.getPath("userData"), "profile-avatars"),
    );
    await profileStore.initialize();
    vaultService = new VaultService(path.join(app.getPath("userData"), "vault.json"));
    await createMainWindow();
  } catch (error) {
    console.error("[startup] main window failed", error);
  }
  app.on("activate", () => {
    if (!focusMostRecentWindow()) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
