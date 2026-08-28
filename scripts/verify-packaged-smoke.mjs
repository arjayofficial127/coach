import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { createSourceManifest } from "./source-manifest.mjs";

const executable = path.resolve("out", "Lattice-win32-x64", "Lattice.exe");
const appAsar = path.resolve("out", "Lattice-win32-x64", "resources", "app.asar");
const sourceManifestPath = path.resolve(
  "out",
  "Lattice-win32-x64",
  "resources",
  "source-manifest.json",
);
const evidenceSource = path.join(os.tmpdir(), "lattice-phase-four", "packaged-smoke-evidence.json");
const evidenceDirectory = path.resolve("artifacts", "phase-4");
const evidenceTarget = path.join(evidenceDirectory, "packaged-smoke-evidence.json");
const screenshotTarget = path.join(evidenceDirectory, "remote-example-com.png");
const shellScreenshotTarget = path.join(evidenceDirectory, "phase-4-shell.png");
const noteTarget = path.join(evidenceDirectory, "packaged-smoke-note.md");

await access(executable);
await access(appAsar);
await access(sourceManifestPath);
await mkdir(evidenceDirectory, { recursive: true });
await rm(evidenceSource, { force: true });
await Promise.all(
  [evidenceTarget, screenshotTarget, shellScreenshotTarget, noteTarget].map((target) =>
    rm(target, { force: true }),
  ),
);

await new Promise((resolve, reject) => {
  const child = spawn(executable, ["--phase4-smoke"], { stdio: "inherit", windowsHide: true });
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Packaged smoke exceeded the 30-second timeout."));
  }, 30_000);
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (code) => {
    clearTimeout(timeout);
    if (code === 0) resolve();
    else reject(new Error(`Packaged smoke exited with code ${code}`));
  });
});

const evidence = JSON.parse(await readFile(evidenceSource, "utf8"));
const failures = [];
if (evidence.packaged !== true) failures.push("app.isPackaged was false");
if (evidence.shell.url !== "lattice://app/index.html")
  failures.push("packaged shell protocol did not load");
if (evidence.shell.title !== "Lattice") failures.push("packaged shell title was missing");
if (!evidence.shell.domReady) failures.push("packaged React shell did not render");
if (!evidence.shell.bridgeVisible) failures.push("packaged preload bridge did not load");
if (!evidence.shell.contentSecurityPolicy?.includes("connect-src 'none'")) {
  failures.push("packaged shell did not receive its strict CSP response header");
}
if (
  evidence.shell.contentSecurityPolicy?.includes("127.0.0.1") ||
  evidence.shell.contentSecurityPolicy?.includes("ws:")
) {
  failures.push("packaged shell CSP retained development network allowances");
}
const rendererBounds = evidence.shell.rendererReportedBounds;
if (
  !rendererBounds ||
  rendererBounds.width < 100 ||
  rendererBounds.height < 100 ||
  rendererBounds.x < 0 ||
  rendererBounds.y < 0
) {
  failures.push("renderer/preload/IPC did not establish usable native-view bounds");
}
const nativeSlotBounds = evidence.shell.nativeSlotBounds;
const vaultPanelBounds = evidence.shell.vaultPanelBounds;
const roundedSlotBounds = Object.fromEntries(
  Object.entries(nativeSlotBounds ?? {}).map(([key, value]) => [key, Math.floor(value)]),
);
if (JSON.stringify(rendererBounds) !== JSON.stringify(roundedSlotBounds)) {
  failures.push("native view bounds did not match the React layout slot");
}
if (!vaultPanelBounds || rendererBounds.x + rendererBounds.width > vaultPanelBounds.x) {
  failures.push("native view overlaps the trusted vault panel");
}
if (!evidence.remote.url.startsWith("https://example.com/"))
  failures.push("real HTTPS page did not load");
if (!evidence.remote.title) failures.push("real HTTPS page had no title");
if (evidence.remote.nativeViewConstructor !== "WebContentsView")
  failures.push("remote page was not hosted by a native WebContentsView");
if (!evidence.remote.sessionSeparatedFromShell)
  failures.push("remote site shared the trusted shell session");
if (evidence.remote.isolation.nodeProcessVisible) failures.push("remote process exposed Node");
if (evidence.remote.isolation.requireVisible) failures.push("remote process exposed require");
if (evidence.remote.isolation.latticeBridgeVisible)
  failures.push("remote process exposed the shell bridge");
if (evidence.remote.isolation.webviewTagApiVisible)
  failures.push("remote page exposed the webview tag API");
if (!evidence.remote.isolation.popupReturnedNull) failures.push("remote popup was not denied");
if (!evidence.remote.isolation.popupHandlerTriggered)
  failures.push("Electron popup-denial handler was not exercised");
if (!evidence.remote.isolation.permissionCheckHandlerTriggered)
  failures.push("Electron permission-check denial handler was not exercised");
if (evidence.remote.isolation.geolocationPermissionState !== "denied")
  failures.push("geolocation permission was not denied");
if (evidence.remote.screenshotBytes < 100)
  failures.push("remote WebContentsView screenshot evidence was empty");
if (!evidence.webContentsDestroyedAfterClose) failures.push("WebContents was not destroyed");
if (evidence.tabs.initialCount !== 1) failures.push("smoke did not begin with one browser tab");
if (evidence.tabs.afterCreateCount !== 2) failures.push("native second tab was not created");
if (!evidence.tabs.switchedBackToInitial) failures.push("native tab switching failed");
if (evidence.tabs.afterCloseCount !== 1 || !evidence.tabs.closedTabAbsent) {
  failures.push("native tab closing failed");
}
if (
  evidence.session.beforeReloadCount !== 2 ||
  evidence.session.afterReloadCount !== 2 ||
  !evidence.session.restoredWithoutDuplicates
) {
  failures.push("renderer reload duplicated or lost native tabs");
}
if (evidence.session.activeDesktop !== "Build") {
  failures.push("restored active tab did not return to its desktop");
}
if (!evidence.session.activeDesktopSummary.startsWith("1 tabs")) {
  failures.push("restored desktop tab count was incorrect");
}
if (!evidence.session.tabTitle || evidence.session.tabTitle === "x") {
  failures.push("restored tab title was collapsed or empty");
}
if (!evidence.session.commandPaletteVisible) {
  failures.push("global command palette did not open from its keyboard shortcut");
}
if (!evidence.session.nativeViewHiddenWhilePaletteOpen) {
  failures.push("native website view remained above the trusted command palette");
}
if (!evidence.readingQueue.capturedAsQueued) {
  failures.push("capture did not persist an initial queued state");
}
if (!evidence.readingQueue.markedRead || !evidence.readingQueue.requeued) {
  failures.push("reading status did not round-trip through read and queued states");
}
if (
  evidence.readingQueue.heading !== "Reading queue" ||
  !evidence.readingQueue.summary.startsWith("1 unread") ||
  evidence.readingQueue.itemTitle !== "Phase 4 packaged smoke" ||
  !evidence.readingQueue.markReadVisible
) {
  failures.push("packaged reading queue UI did not expose the queued Markdown item");
}
if (!evidence.readingQueue.nativeViewHidden) {
  failures.push("native website view remained visible beneath the trusted reading queue");
}
if (
  !evidence.privacy.cookieSeeded ||
  !evidence.privacy.localStorageSeeded ||
  !evidence.privacy.cacheStorageSeeded
) {
  failures.push("privacy smoke could not seed isolated website data");
}
if (
  !evidence.privacy.cookieCleared ||
  !evidence.privacy.localStorageCleared ||
  !evidence.privacy.cacheStorageCleared ||
  evidence.privacy.after.cookieCount !== 0
) {
  failures.push("isolated website data was not cleared completely");
}
if (
  evidence.privacy.settingsHeading !== "Settings" ||
  !evidence.privacy.settingsPrivacyText.startsWith("0 cookies") ||
  !evidence.privacy.restoreTabsEnabled
) {
  failures.push("packaged Settings UI did not report the cleared privacy state");
}
if (!evidence.privacy.nativeViewHidden) {
  failures.push("native website view remained visible beneath trusted Settings");
}
if (!evidence.note.disposableVault) failures.push("note was not written to a disposable vault");
if (!evidence.note.obsidianDirectoryPresent)
  failures.push("disposable vault had no .obsidian marker directory");
if (!evidence.note.relativePath.startsWith(`Saved Links${path.sep}`))
  failures.push("note was not published under the Saved Links folder");
if (!evidence.note.relativePath.includes(`${path.sep}Research${path.sep}`))
  failures.push("note was not published under its desktop folder");
if (evidence.note.bytesWritten < 1 || evidence.note.bytesWritten !== evidence.note.bytesReadBack) {
  failures.push("atomic note read-back did not match the written byte count");
}
if (evidence.note.temporaryFilesRemaining !== 0) failures.push("temporary note files remain");
if (evidence.note.libraryCount !== 1 || !evidence.note.libraryRoundTrip) {
  failures.push("saved note did not round-trip through the Obsidian library reader");
}
if (!evidence.note.disconnectedWithoutDeleting) {
  failures.push("disconnecting the vault removed or retained authority over the Markdown note");
}
if (
  !vaultPanelBounds ||
  evidence.remote.viewBounds.width < 100 ||
  evidence.remote.viewBounds.height < 100 ||
  evidence.remote.viewBounds.x + evidence.remote.viewBounds.width > vaultPanelBounds.x
) {
  failures.push("WebContentsView did not retain a usable non-overlapping layout");
}
const expectedPreferences = {
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  preloadConfigured: false,
};
for (const [preference, expected] of Object.entries(expectedPreferences)) {
  if (evidence.remote.configuredPreferences[preference] !== expected) {
    failures.push(`remote configured preference ${preference} was not ${expected}`);
  }
}
if (failures.length > 0) {
  throw new Error(`Packaged smoke failed:\n- ${failures.join("\n- ")}`);
}

const executableBytes = await readFile(executable);
const executableStats = await stat(executable);
const asarBytes = await readFile(appAsar);
const asarStats = await stat(appAsar);
const screenshotBytes = await readFile(evidence.remote.screenshotPath);
const shellScreenshotBytes = await readFile(evidence.shell.screenshotPath);
if (screenshotBytes.byteLength !== evidence.remote.screenshotBytes) {
  throw new Error("Screenshot byte count changed before evidence collection.");
}
if (!screenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("WebContentsView screenshot is not a PNG file.");
}
const screenshotPixels = {
  width: screenshotBytes.readUInt32BE(16),
  height: screenshotBytes.readUInt32BE(20),
};
if (screenshotPixels.width < 100 || screenshotPixels.height < 100) {
  throw new Error("WebContentsView screenshot dimensions were not usable.");
}
if (!shellScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 4 shell screenshot is not a PNG file.");
}
if (shellScreenshotBytes.byteLength !== evidence.shell.screenshotBytes) {
  throw new Error("Phase 4 shell screenshot byte count changed before evidence collection.");
}
const shellScreenshotPixels = {
  width: shellScreenshotBytes.readUInt32BE(16),
  height: shellScreenshotBytes.readUInt32BE(20),
};
if (shellScreenshotPixels.width < 900 || shellScreenshotPixels.height < 620) {
  throw new Error("Phase 4 shell screenshot dimensions were not usable.");
}
evidence.shell.screenshotPixels = shellScreenshotPixels;
evidence.shell.screenshotSha256 = createHash("sha256").update(shellScreenshotBytes).digest("hex");
evidence.remote.screenshotPixels = screenshotPixels;
evidence.remote.screenshotSha256 = createHash("sha256").update(screenshotBytes).digest("hex");
const noteBytes = await readFile(evidence.note.absolutePath);
const noteHash = createHash("sha256").update(noteBytes).digest("hex");
if (noteHash !== evidence.note.sha256) {
  throw new Error("Saved Markdown hash does not match the packaged-app evidence.");
}
const noteText = noteBytes.toString("utf8");
if (!noteText.startsWith("---\n") || !noteText.includes('type: "saved-link"')) {
  throw new Error("Saved file is not the expected Obsidian-compatible Markdown note.");
}
if (!noteText.includes('desktop_id: "research"')) {
  throw new Error("Saved Markdown did not retain its stable desktop ID.");
}
if (!noteText.includes('reading_status: "queued"') || !noteText.match(/^queued_at: ".+"$/m)) {
  throw new Error("Saved Markdown did not retain its reading-queue state.");
}
const signatureArguments = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "(Get-AuthenticodeSignature -LiteralPath $env:LATTICE_SIGNATURE_TARGET).Status.ToString()",
];
const signatureOptions = {
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, LATTICE_SIGNATURE_TARGET: executable },
};
let signatureResult = spawnSync("pwsh.exe", signatureArguments, signatureOptions);
if (signatureResult.error?.code === "ENOENT") {
  signatureResult = spawnSync(
    "powershell.exe",
    ["-ExecutionPolicy", "Bypass", ...signatureArguments],
    signatureOptions,
  );
}
if (signatureResult.status !== 0) {
  throw new Error(`Authenticode inspection failed: ${signatureResult.stderr}`);
}
const authenticodeStatus = signatureResult.stdout.trim();
if (authenticodeStatus !== "NotSigned") {
  throw new Error(`Expected an unsigned Phase 4 executable, got ${authenticodeStatus}.`);
}
const fuseWire = await getCurrentFuseWire(executable);
const expectedFuses = {
  RunAsNode: [FuseV1Options.RunAsNode, FuseState.DISABLE],
  EnableCookieEncryption: [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  EnableNodeOptionsEnvironmentVariable: [
    FuseV1Options.EnableNodeOptionsEnvironmentVariable,
    FuseState.DISABLE,
  ],
  EnableNodeCliInspectArguments: [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  EnableEmbeddedAsarIntegrityValidation: [
    FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
    FuseState.ENABLE,
  ],
  OnlyLoadAppFromAsar: [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  GrantFileProtocolExtraPrivileges: [
    FuseV1Options.GrantFileProtocolExtraPrivileges,
    FuseState.DISABLE,
  ],
};
const fuses = {};
for (const [name, [option, expectedState]] of Object.entries(expectedFuses)) {
  const actualState = fuseWire[option];
  if (actualState !== expectedState) {
    throw new Error(`Packaged fuse ${name} has unexpected state ${actualState}.`);
  }
  fuses[name] = actualState === FuseState.ENABLE;
}
const packagedSourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const currentSourceManifest = await createSourceManifest(process.cwd());
if (packagedSourceManifest.sha256 !== currentSourceManifest.sha256) {
  throw new Error(
    `Source manifest changed after packaging (${packagedSourceManifest.sha256} != ${currentSourceManifest.sha256}).`,
  );
}
evidence.verifiedAt = new Date().toISOString();
evidence.package = {
  executable,
  appAsar,
  sourceManifestPath,
  sourceManifestSha256: packagedSourceManifest.sha256,
  sourceManifestFiles: packagedSourceManifest.files.length,
  bytes: executableStats.size,
  sha256: createHash("sha256").update(executableBytes).digest("hex"),
  asarBytes: asarStats.size,
  asarSha256: createHash("sha256").update(asarBytes).digest("hex"),
  authenticodeStatus,
  signed: false,
  fuses,
};

await copyFile(evidence.remote.screenshotPath, screenshotTarget);
await copyFile(evidence.shell.screenshotPath, shellScreenshotTarget);
await copyFile(evidence.note.absolutePath, noteTarget);
const copiedScreenshotBytes = await readFile(screenshotTarget);
const copiedShellScreenshotBytes = await readFile(shellScreenshotTarget);
const copiedNoteBytes = await readFile(noteTarget);
if (
  createHash("sha256").update(copiedScreenshotBytes).digest("hex") !==
  evidence.remote.screenshotSha256
) {
  throw new Error("Collected screenshot hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedShellScreenshotBytes).digest("hex") !==
  evidence.shell.screenshotSha256
) {
  throw new Error("Collected shell screenshot hash changed while publishing evidence.");
}
if (createHash("sha256").update(copiedNoteBytes).digest("hex") !== evidence.note.sha256) {
  throw new Error("Collected Markdown hash changed while publishing evidence.");
}
evidence.remote.artifactPath = screenshotTarget;
evidence.shell.artifactPath = shellScreenshotTarget;
evidence.note.artifactPath = noteTarget;
await writeFile(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`Packaged Phase 4 smoke passed. Evidence: ${evidenceTarget}`);
