import path from "node:path";
import { app, BrowserWindow } from "electron";
import { BrowserRuntime } from "./browser/browser-runtime";
import { registerIpc } from "./ipc";
import { isTrustedShellUrl } from "./policies/shell-origin";
import { installLatticeProtocol, registerLatticeScheme } from "./protocol";
import { runPhaseFourSmoke } from "./smoke";
import { VaultService } from "./vault/vault-service";

registerLatticeScheme();
app.enableSandbox();

let mainWindow: BrowserWindow | null = null;
let browserRuntime: BrowserRuntime | null = null;
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
    backgroundColor: "#11151c",
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

  if (app.isPackaged) {
    installLatticeProtocol(mainWindow.webContents.session, rendererRoot);
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (details) => {
    if (!isTrustedShellUrl(details.url, app.isPackaged, devServerUrl)) {
      details.preventDefault();
    }
  });

  browserRuntime = new BrowserRuntime(mainWindow);
  unregisterIpc = registerIpc(
    mainWindow,
    browserRuntime,
    new VaultService(path.join(app.getPath("userData"), "vault.json")),
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
  if (process.argv.includes("--phase4-smoke")) {
    try {
      const rendererRoot = path.join(__dirname, "../renderer");
      const evidence = await runPhaseFourSmoke(rendererRoot, path.join(__dirname, "preload.cjs"));
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
