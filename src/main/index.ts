import path from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpc } from "./ipc";
import { isTrustedShellUrl } from "./policies/shell-origin";
import { ProfileRuntime } from "./profiles/profile-runtime";
import { ProfileStore } from "./profiles/profile-store";
import { installLatticeProtocol, registerLatticeScheme } from "./protocol";
import { runPhaseNineSmoke } from "./smoke";
import { VaultService } from "./vault/vault-service";

registerLatticeScheme();
app.enableSandbox();
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
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f3f3f0",
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

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", () => {
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
}

app.whenReady().then(async () => {
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

  await createMainWindow();
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
