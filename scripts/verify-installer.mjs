import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const installer = path.join(repositoryRoot, "release", `Lattice-Setup-${packageJson.version}.exe`);
const portableRoot = path.join(repositoryRoot, "out", "Lattice-win32-x64");
const installRoot = path.join(os.tmpdir(), `lattice-phase-nine-install-${process.pid}`);
const installedExecutable = path.join(installRoot, "Lattice.exe");
const uninstaller = path.join(installRoot, "Uninstall Lattice.exe");
const smokeEvidenceSource = path.join(
  os.tmpdir(),
  "lattice-phase-nine",
  "packaged-smoke-evidence.json",
);
const evidenceRoot = path.join(repositoryRoot, "artifacts", "phase-9");
const phaseTenEvidenceRoot = path.join(repositoryRoot, "artifacts", "phase-10");
const phaseTwelveEvidenceRoot = path.join(repositoryRoot, "artifacts", "phase-12");
const phaseThirteenEvidenceRoot = path.join(repositoryRoot, "artifacts", "phase-13");
const phaseFourteenEvidenceRoot = path.join(repositoryRoot, "artifacts", "phase-14");
const phaseFifteenEvidenceRoot = path.join(repositoryRoot, "artifacts", "phase-15");
const phaseSixteenEvidenceRoot = path.join(repositoryRoot, "artifacts", "phase-16");
const lifecycleEvidencePath = path.join(evidenceRoot, "installer-lifecycle-evidence.json");
const installedSmokeTarget = path.join(evidenceRoot, "installed-smoke-evidence.json");
const shellScreenshotTarget = path.join(evidenceRoot, "installed-shell.png");
const metadataScreenshotTarget = path.join(evidenceRoot, "installed-metadata-editor.png");
const handoffScreenshotTarget = path.join(evidenceRoot, "installed-obsidian-handoff.png");
const canvasScreenshotTarget = path.join(evidenceRoot, "installed-canvas.png");
const focusNavigationScreenshotTarget = path.join(
  phaseTenEvidenceRoot,
  "installed-focus-navigation.png",
);
const profileScreenshotTarget = path.join(
  phaseTwelveEvidenceRoot,
  "installed-website-profiles.png",
);
const runnableAppsScreenshotTarget = path.join(
  phaseThirteenEvidenceRoot,
  "installed-runnable-apps.png",
);
const dailyFlowScreenshotTarget = path.join(phaseFourteenEvidenceRoot, "installed-daily-flow.png");
const wealthLabScreenshotTarget = path.join(phaseFifteenEvidenceRoot, "installed-wealth-lab.png");
const newTabScreenshotTarget = path.join(phaseSixteenEvidenceRoot, "installed-new-tab.png");
const remoteScreenshotTarget = path.join(evidenceRoot, "installed-remote-example-com.png");
const noteTarget = path.join(evidenceRoot, "installed-smoke-note.md");
const canvasTarget = path.join(evidenceRoot, "installed-smoke-canvas.canvas");
const startMenuShortcut = path.join(
  process.env.APPDATA ?? "",
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Lattice.lnk",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function runProcess(command, args, timeoutMilliseconds) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(command)} exceeded its timeout.`));
    }, timeoutMilliseconds);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}.`));
    });
  });
}

function runPowerShell(command, environment = process.env) {
  const commonArguments = ["-NoProfile", "-NonInteractive", "-Command", command];
  let result = spawnSync("pwsh.exe", commonArguments, {
    encoding: "utf8",
    windowsHide: true,
    env: environment,
  });
  if (result.error?.code === "ENOENT") {
    result = spawnSync("powershell.exe", ["-ExecutionPolicy", "Bypass", ...commonArguments], {
      encoding: "utf8",
      windowsHide: true,
      env: environment,
    });
  }
  if (result.status !== 0) {
    throw new Error(`PowerShell inspection failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function authenticodeStatus(target) {
  return runPowerShell(
    "(Get-AuthenticodeSignature -LiteralPath $env:LATTICE_SIGNATURE_TARGET).Status.ToString()",
    { ...process.env, LATTICE_SIGNATURE_TARGET: target },
  );
}

function currentUserInstallRecords() {
  const output = runPowerShell(
    "$items = @(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue); $items | Select-Object PSChildName,DisplayName,DisplayVersion,InstallLocation,UninstallString | ConvertTo-Json -Compress",
  );
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function waitForRemoval(target, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (!(await exists(target))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !(await exists(target));
}

async function verifyFuses(target) {
  const fuseWire = await getCurrentFuseWire(target);
  const expected = {
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
  const result = {};
  for (const [name, [option, expectedState]] of Object.entries(expected)) {
    if (fuseWire[option] !== expectedState) {
      throw new Error(`Installed fuse ${name} has unexpected state ${fuseWire[option]}.`);
    }
    result[name] = expectedState === FuseState.ENABLE;
  }
  return result;
}

if (process.platform !== "win32") {
  throw new Error("The Phase 9 installer lifecycle gate must run on Windows.");
}
if (
  path.resolve(path.dirname(installRoot)).toLowerCase() !==
    path.resolve(os.tmpdir()).toLowerCase() ||
  !path.basename(installRoot).startsWith("lattice-phase-nine-install-")
) {
  throw new Error("Refusing to manage an install test directory outside the OS temp directory.");
}
if (!process.env.APPDATA) {
  throw new Error("APPDATA is required to validate the current-user Start-menu shortcut.");
}

await Promise.all([
  access(installer),
  access(path.join(portableRoot, "Lattice.exe")),
  access(path.join(portableRoot, "resources", "app.asar")),
  access(path.join(portableRoot, "resources", "source-manifest.json")),
]);
if (
  currentUserInstallRecords().some((record) =>
    String(record.DisplayName ?? "")
      .toLowerCase()
      .startsWith("lattice"),
  )
) {
  throw new Error("Refusing the lifecycle smoke because a current-user Lattice install exists.");
}
if (await exists(startMenuShortcut)) {
  throw new Error("Refusing the lifecycle smoke because a Lattice Start-menu shortcut exists.");
}

await rm(installRoot, { recursive: true, force: true });
await rm(smokeEvidenceSource, { force: true });
await mkdir(evidenceRoot, { recursive: true });
await mkdir(phaseTenEvidenceRoot, { recursive: true });
await Promise.all(
  [
    lifecycleEvidencePath,
    installedSmokeTarget,
    shellScreenshotTarget,
    metadataScreenshotTarget,
    handoffScreenshotTarget,
    canvasScreenshotTarget,
    focusNavigationScreenshotTarget,
    profileScreenshotTarget,
    runnableAppsScreenshotTarget,
    dailyFlowScreenshotTarget,
    wealthLabScreenshotTarget,
    newTabScreenshotTarget,
    remoteScreenshotTarget,
    noteTarget,
    canvasTarget,
  ].map((target) => rm(target, { force: true })),
);

const installerBytes = await readFile(installer);
const installerSignature = authenticodeStatus(installer);
if (installerSignature !== "NotSigned") {
  throw new Error(`Expected an unsigned Phase 9 installer, got ${installerSignature}.`);
}

await runProcess(installer, ["/S", "/currentuser", `/D=${installRoot}`], 120_000);
await Promise.all([access(installedExecutable), access(uninstaller)]);
const installRecords = currentUserInstallRecords().filter(
  (record) =>
    record.DisplayName === "Lattice" &&
    record.DisplayVersion === packageJson.version &&
    String(record.UninstallString ?? "")
      .toLowerCase()
      .includes(uninstaller.toLowerCase()),
);
if (installRecords.length !== 1) {
  throw new Error(`Expected one current-user uninstall record, found ${installRecords.length}.`);
}
if (!(await exists(startMenuShortcut))) {
  throw new Error("The current-user installer did not create its Start-menu shortcut.");
}

const portableFiles = {
  executable: path.join(portableRoot, "Lattice.exe"),
  appAsar: path.join(portableRoot, "resources", "app.asar"),
  sourceManifest: path.join(portableRoot, "resources", "source-manifest.json"),
};
const installedFiles = {
  executable: installedExecutable,
  appAsar: path.join(installRoot, "resources", "app.asar"),
  sourceManifest: path.join(installRoot, "resources", "source-manifest.json"),
};
const portableHashes = Object.fromEntries(
  await Promise.all(
    Object.entries(portableFiles).map(async ([name, target]) => [
      name,
      sha256(await readFile(target)),
    ]),
  ),
);
const installedHashes = Object.fromEntries(
  await Promise.all(
    Object.entries(installedFiles).map(async ([name, target]) => [
      name,
      sha256(await readFile(target)),
    ]),
  ),
);
if (JSON.stringify(portableHashes) !== JSON.stringify(installedHashes)) {
  throw new Error("Installed application bytes differ from the hardened portable package.");
}
const installedSignature = authenticodeStatus(installedExecutable);
if (installedSignature !== "NotSigned") {
  throw new Error(`Expected an unsigned installed executable, got ${installedSignature}.`);
}
const fuses = await verifyFuses(installedExecutable);

await runProcess(installedExecutable, ["--phase9-smoke"], 90_000);
const smoke = JSON.parse(await readFile(smokeEvidenceSource, "utf8"));
const smokeFailures = [];
if (smoke.packaged !== true) smokeFailures.push("installed app was not packaged");
if (!smoke.shell?.domReady || !smoke.shell?.bridgeVisible) {
  smokeFailures.push("trusted shell did not render through preload");
}
if (
  !smoke.shell?.brandLogoVisible ||
  !smoke.shell?.svgFaviconPresent ||
  !smoke.shell?.pngFaviconPresent
) {
  smokeFailures.push("installed Lattice logo and favicon set did not render");
}
if (smoke.remote?.nativeViewConstructor !== "WebContentsView") {
  smokeFailures.push("real website did not use WebContentsView");
}
if (
  smoke.remote?.isolation?.nodeProcessVisible ||
  smoke.remote?.isolation?.requireVisible ||
  smoke.remote?.isolation?.latticeBridgeVisible
) {
  smokeFailures.push("installed remote page crossed the trust boundary");
}
if (!smoke.webContentsDestroyedAfterClose) {
  smokeFailures.push("installed native web contents did not close cleanly");
}
if (
  smoke.navigation?.heading !== "Let's focus on what matters." ||
  JSON.stringify(smoke.navigation?.dashboardCards) !==
    JSON.stringify(["recent-thread", "canvas", "today-focus", "reading-queue"]) ||
  JSON.stringify(smoke.navigation?.desktopNames) !==
    JSON.stringify(["Desk 1", "Desk 2", "Desk 3"]) ||
  !smoke.navigation?.desktopsBeforeNavigate ||
  !smoke.navigation?.inlineRenameRoundTrip ||
  smoke.navigation?.readingPreviewCount < 1 ||
  smoke.navigation?.privacyPromise !== "Private by design. Always local." ||
  !smoke.navigation?.focusBarThemed ||
  !smoke.navigation?.focusMode ||
  !smoke.navigation?.chromeHidden ||
  !smoke.navigation?.nativeViewHidden ||
  !smoke.navigation?.escapeRestoredNavigation ||
  !smoke.navigation?.browserRestoredAfterShortcuts ||
  smoke.navigation?.newTabHeading !== "Where would you like to go?" ||
  !smoke.navigation?.newTabSuggestionKinds?.includes("app") ||
  !smoke.navigation?.quickCaptureVisible ||
  smoke.navigation?.capturedInboxCount < 1 ||
  !smoke.navigation?.capturedNoteVisibleInInbox
) {
  smokeFailures.push("installed focus-first navigation workflow failed");
}
if (!smoke.note?.libraryRoundTrip || !smoke.note?.disconnectedWithoutDeleting) {
  smokeFailures.push("installed Obsidian Markdown workflow failed");
}
if (!smoke.privacy?.cookieCleared || !smoke.privacy?.localStorageCleared) {
  smokeFailures.push("installed privacy clearing failed");
}
if (
  smoke.profiles?.profileCount !== 2 ||
  smoke.profiles?.activeProfileName !== "Personal" ||
  !smoke.profiles?.loadingLabelAbsent ||
  !smoke.profiles?.createActionEnabled ||
  !smoke.profiles?.menuActionsLookEnabled ||
  !smoke.profiles?.identityTilesThemed ||
  !smoke.profiles?.nativeViewHiddenWhileMenuOpen ||
  !smoke.profiles?.firstCookieRetained ||
  !smoke.profiles?.secondCookieInitiallyAbsent ||
  !smoke.profiles?.secondCookieRetained ||
  !smoke.profiles?.partitionsDistinct ||
  !smoke.profiles?.registryContainsNoCredentials
) {
  smokeFailures.push("installed website-profile isolation workflow failed");
}
if (
  smoke.runnableApps?.heading !== "Runnable apps" ||
  smoke.runnableApps?.appName !== "Pomodoro" ||
  !smoke.runnableApps?.overridden ||
  !smoke.runnableApps?.originalPreserved ||
  !smoke.runnableApps?.persisted ||
  !smoke.runnableApps?.activeRunCleared ||
  !smoke.runnableApps?.profileScoped ||
  !smoke.runnableApps?.adaptiveLightSurface ||
  !smoke.runnableApps?.nativeViewHidden
) {
  smokeFailures.push("installed runnable Pomodoro workflow failed");
}
if (
  smoke.dailyFlow?.heading !== "Daily Flow" ||
  smoke.dailyFlow?.catalogCount !== 3 ||
  smoke.dailyFlow?.nowTask !== "Prepare Phase 14 council synthesis" ||
  smoke.dailyFlow?.todaySummary !== "1 of 3 chosen" ||
  smoke.dailyFlow?.originalText !== "Prepare Phase 14 council synthesis" ||
  smoke.dailyFlow?.effectiveText !== "Prepare and ship Phase 14 council synthesis" ||
  !smoke.dailyFlow?.originalPreserved ||
  !smoke.dailyFlow?.explicitlyCompleted ||
  !smoke.dailyFlow?.linkedPomodoro ||
  !smoke.dailyFlow?.linkedTimerStopped ||
  !smoke.dailyFlow?.persisted ||
  !smoke.dailyFlow?.profileScoped ||
  !smoke.dailyFlow?.activeRunCleared ||
  !smoke.dailyFlow?.adaptiveLightSurface ||
  !smoke.dailyFlow?.nativeViewHidden
) {
  smokeFailures.push("installed Daily Flow workflow failed");
}
if (
  smoke.wealthLab?.heading !== "Wealth Lab" ||
  smoke.wealthLab?.catalogCount !== 3 ||
  smoke.wealthLab?.incomeTargetMinor !== 12_000_000 ||
  smoke.wealthLab?.investmentTargetMinor !== 2_500_000 ||
  smoke.wealthLab?.incomeMinor !== 10_000_000 ||
  smoke.wealthLab?.expenseMinor !== 3_500_000 ||
  smoke.wealthLab?.investmentMinor !== 2_000_000 ||
  smoke.wealthLab?.netCashMinor !== 6_500_000 ||
  !smoke.wealthLab?.originalExpensePreserved ||
  smoke.wealthLab?.ideaStatus !== "testing" ||
  !smoke.wealthLab?.ideaFeatured ||
  smoke.wealthLab?.netWorthMinor !== 40_000_000 ||
  !smoke.wealthLab?.linkedPomodoro ||
  !smoke.wealthLab?.linkedTimerStopped ||
  !smoke.wealthLab?.safetyBoundaryVisible ||
  !smoke.wealthLab?.persisted ||
  !smoke.wealthLab?.profileScoped ||
  !smoke.wealthLab?.activeRunCleared ||
  !smoke.wealthLab?.adaptiveLightSurface ||
  !smoke.wealthLab?.nativeViewHidden
) {
  smokeFailures.push("installed Wealth Lab workflow failed");
}
if (
  !smoke.desktopLifecycle?.guardedDeleteBlockedForOpenTab ||
  !smoke.desktopLifecycle?.movedTabRetained ||
  !smoke.desktopLifecycle?.deletedEmptyDesktop ||
  !smoke.desktopLifecycle?.savedResearchDesktopPreserved
) {
  smokeFailures.push("installed desktop lifecycle workflow failed");
}
if (
  smoke.metadataEditing?.title !== "Phase 8 edited research note" ||
  !smoke.metadataEditing?.bodyPreserved ||
  !smoke.metadataEditing?.pathPreserved ||
  !smoke.metadataEditing?.readingStatePreserved
) {
  smokeFailures.push("installed saved-link metadata editing failed");
}
if (
  smoke.obsidianHandoff?.openInvocations !== 1 ||
  smoke.obsidianHandoff?.revealInvocations !== 1 ||
  !smoke.obsidianHandoff?.decodedPathMatches ||
  !smoke.obsidianHandoff?.revealedPathMatches ||
  !smoke.obsidianHandoff?.notePathNotRendered
) {
  smokeFailures.push("installed Obsidian handoff workflow failed");
}
if (
  smoke.canvas?.pageCount !== 2 ||
  smoke.canvas?.nodeCount !== 3 ||
  !smoke.canvas?.jsonCanvasShape ||
  !smoke.canvas?.pageLinkNavigated ||
  !smoke.canvas?.objectLinkFocused ||
  !smoke.canvas?.websiteOpenedInIsolatedView ||
  !smoke.canvas?.revealedPathMatches ||
  !smoke.canvas?.nativeViewHidden ||
  smoke.canvas?.temporaryFilesRemaining !== 0
) {
  smokeFailures.push("installed JSON Canvas page workflow failed");
}
if (
  smoke.themes?.optionCount !== 3 ||
  smoke.themes?.defaultTheme !== "paper-felt" ||
  !smoke.themes?.feltApplied ||
  !smoke.themes?.feltTextureVisible ||
  !smoke.themes?.feltRecoveryThemed ||
  !smoke.themes?.feltProfileTilesThemed ||
  smoke.themes?.customName !== "Smoke Aubergine" ||
  !smoke.themes?.customApplied ||
  !smoke.themes?.customPersisted ||
  !smoke.themes?.customProfileScoped ||
  !smoke.themes?.undoRestored ||
  !smoke.themes?.returnedToDark ||
  !smoke.themes?.nativeTitleBarSynced
) {
  smokeFailures.push("installed theme selection, customization, persistence, or Undo failed");
}
if (smokeFailures.length > 0) {
  throw new Error(`Installed application smoke failed:\n- ${smokeFailures.join("\n- ")}`);
}

await copyFile(smoke.shell.screenshotPath, shellScreenshotTarget);
await copyFile(smoke.metadataEditing.screenshotPath, metadataScreenshotTarget);
await copyFile(smoke.obsidianHandoff.screenshotPath, handoffScreenshotTarget);
await copyFile(smoke.canvas.screenshotPath, canvasScreenshotTarget);
await copyFile(smoke.navigation.screenshotPath, focusNavigationScreenshotTarget);
await mkdir(phaseSixteenEvidenceRoot, { recursive: true });
await copyFile(smoke.navigation.newTabScreenshotPath, newTabScreenshotTarget);
await mkdir(phaseTwelveEvidenceRoot, { recursive: true });
await copyFile(smoke.profiles.screenshotPath, profileScreenshotTarget);
await mkdir(phaseThirteenEvidenceRoot, { recursive: true });
await copyFile(smoke.runnableApps.screenshotPath, runnableAppsScreenshotTarget);
await mkdir(phaseFourteenEvidenceRoot, { recursive: true });
await copyFile(smoke.dailyFlow.screenshotPath, dailyFlowScreenshotTarget);
await mkdir(phaseFifteenEvidenceRoot, { recursive: true });
await copyFile(smoke.wealthLab.screenshotPath, wealthLabScreenshotTarget);
await copyFile(smoke.remote.screenshotPath, remoteScreenshotTarget);
await copyFile(smoke.note.absolutePath, noteTarget);
await copyFile(smoke.canvas.absolutePath, canvasTarget);
smoke.shell.artifactPath = shellScreenshotTarget;
smoke.metadataEditing.artifactPath = metadataScreenshotTarget;
smoke.obsidianHandoff.artifactPath = handoffScreenshotTarget;
smoke.canvas.screenshotArtifactPath = canvasScreenshotTarget;
smoke.canvas.artifactPath = canvasTarget;
smoke.navigation.artifactPath = focusNavigationScreenshotTarget;
smoke.navigation.newTabArtifactPath = newTabScreenshotTarget;
smoke.profiles.artifactPath = profileScreenshotTarget;
smoke.runnableApps.artifactPath = runnableAppsScreenshotTarget;
smoke.dailyFlow.artifactPath = dailyFlowScreenshotTarget;
smoke.wealthLab.artifactPath = wealthLabScreenshotTarget;
smoke.remote.artifactPath = remoteScreenshotTarget;
smoke.note.artifactPath = noteTarget;
smoke.installedExecutable = installedExecutable;
smoke.installedExecutableSha256 = installedHashes.executable;
await writeFile(installedSmokeTarget, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");

await runProcess(uninstaller, ["/S", "/currentuser"], 120_000);
const executableRemoved = await waitForRemoval(installedExecutable, 20_000);
const installRootRemoved = await waitForRemoval(installRoot, 20_000);
const registryRemoved = !currentUserInstallRecords().some(
  (record) =>
    record.DisplayName === "Lattice" &&
    record.DisplayVersion === packageJson.version &&
    String(record.UninstallString ?? "")
      .toLowerCase()
      .includes(uninstaller.toLowerCase()),
);
const shortcutRemoved = !(await exists(startMenuShortcut));
if (!executableRemoved || !installRootRemoved || !registryRemoved || !shortcutRemoved) {
  throw new Error(
    `Uninstall cleanup failed (exe=${executableRemoved}, root=${installRootRemoved}, registry=${registryRemoved}, shortcut=${shortcutRemoved}).`,
  );
}

const lifecycleEvidence = {
  verifiedAt: new Date().toISOString(),
  version: packageJson.version,
  installer: {
    path: installer,
    bytes: (await stat(installer)).size,
    sha256: sha256(installerBytes),
    authenticodeStatus: installerSignature,
    signed: false,
  },
  installation: {
    mode: "current-user",
    silent: true,
    isolatedTestDirectory: installRoot,
    uninstallRecordCreated: true,
    uninstallRecord: installRecords[0],
    startMenuShortcutCreated: true,
    desktopShortcutConfigured: false,
    portableHashes,
    installedHashes,
    hardenedPackagePreserved: true,
    authenticodeStatus: installedSignature,
    fuses,
    smokeEvidence: installedSmokeTarget,
  },
  uninstall: {
    silent: true,
    executableRemoved,
    installRootRemoved,
    uninstallRecordRemoved: registryRemoved,
    startMenuShortcutRemoved: shortcutRemoved,
    userDataDeletionConfigured: false,
  },
};
await writeFile(lifecycleEvidencePath, `${JSON.stringify(lifecycleEvidence, null, 2)}\n`, "utf8");

console.log(`Phase 9 installer lifecycle passed. Evidence: ${lifecycleEvidencePath}`);
