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

let mainWindow: BrowserWindow | null = null;
let browserRuntime: ProfileRuntime | null = null;
let unregisterIpc: (() => void) | null = null;

async function createMainWindow(): Promise<void> {
  const rendererRoot = path.join(__dirname, "../renderer");
  const devServerUrl = app.isPackaged ? undefined : process.env.LATTICE_DEV_SERVER_URL;

  mainWindow = new BrowserWindow({
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

  if (app.isPackaged) {
    installLatticeProtocol(mainWindow.webContents.session, rendererRoot);
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (details) => {
    if (!isTrustedShellUrl(details.url, app.isPackaged, devServerUrl)) {
      details.preventDefault();
    }
  });

  const profileStore = new ProfileStore(
    path.join(app.getPath("userData"), "profiles.json"),
    path.join(app.getPath("userData"), "profile-avatars"),
  );
  await profileStore.initialize();
  browserRuntime = new ProfileRuntime(mainWindow, profileStore);
  unregisterIpc = registerIpc(
    mainWindow,
    browserRuntime,
    new VaultService(path.join(app.getPath("userData"), "vault.json")),
    browserRuntime,
  );

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
    mainWindow?.webContents.session.flushStorageData();
    browserRuntime?.close();
  });
  mainWindow.on("closed", () => {
    unregisterIpc?.();
    unregisterIpc = null;
    browserRuntime = null;
    mainWindow = null;
  });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadURL("lattice://app/index.html");
  }
  revealMainWindow();
}

app.whenReady().then(async () => {
  if (process.argv.includes("--new-tab-reactivation-smoke")) {
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

  if (
    process.argv.includes("--phase4-smoke") ||
    process.argv.includes("--phase5-smoke") ||
    process.argv.includes("--phase6-smoke") ||
    process.argv.includes("--phase7-smoke") ||
    process.argv.includes("--phase8-smoke") ||
    process.argv.includes("--phase9-smoke")
  ) {
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
    await createMainWindow();
  } catch (error) {
    console.error("[startup] main window failed", error);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
