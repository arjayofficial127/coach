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
const evidenceSource = path.join(os.tmpdir(), "lattice-phase-nine", "packaged-smoke-evidence.json");
const evidenceDirectory = path.resolve("artifacts", "phase-9");
const phaseTenEvidenceDirectory = path.resolve("artifacts", "phase-10");
const phaseTwelveEvidenceDirectory = path.resolve("artifacts", "phase-12");
const phaseThirteenEvidenceDirectory = path.resolve("artifacts", "phase-13");
const phaseFourteenEvidenceDirectory = path.resolve("artifacts", "phase-14");
const phaseFifteenEvidenceDirectory = path.resolve("artifacts", "phase-15");
const evidenceTarget = path.join(evidenceDirectory, "packaged-smoke-evidence.json");
const screenshotTarget = path.join(evidenceDirectory, "remote-example-com.png");
const shellScreenshotTarget = path.join(evidenceDirectory, "phase-9-shell.png");
const metadataScreenshotTarget = path.join(evidenceDirectory, "phase-9-metadata-editor.png");
const handoffScreenshotTarget = path.join(evidenceDirectory, "phase-9-obsidian-handoff.png");
const canvasScreenshotTarget = path.join(evidenceDirectory, "phase-9-canvas.png");
const focusNavigationScreenshotTarget = path.join(
  phaseTenEvidenceDirectory,
  "focus-navigation.png",
);
const profileScreenshotTarget = path.join(phaseTwelveEvidenceDirectory, "website-profiles.png");
const runnableAppsScreenshotTarget = path.join(phaseThirteenEvidenceDirectory, "runnable-apps.png");
const dailyFlowScreenshotTarget = path.join(phaseFourteenEvidenceDirectory, "daily-flow.png");
const wealthLabScreenshotTarget = path.join(phaseFifteenEvidenceDirectory, "wealth-lab.png");
const canvasTarget = path.join(evidenceDirectory, "packaged-smoke-canvas.canvas");
const noteTarget = path.join(evidenceDirectory, "packaged-smoke-note.md");

await access(executable);
await access(appAsar);
await access(sourceManifestPath);
await mkdir(evidenceDirectory, { recursive: true });
await mkdir(phaseTenEvidenceDirectory, { recursive: true });
await mkdir(phaseTwelveEvidenceDirectory, { recursive: true });
await mkdir(phaseThirteenEvidenceDirectory, { recursive: true });
await mkdir(phaseFourteenEvidenceDirectory, { recursive: true });
await mkdir(phaseFifteenEvidenceDirectory, { recursive: true });
await rm(evidenceSource, { force: true });
await Promise.all(
  [
    evidenceTarget,
    screenshotTarget,
    shellScreenshotTarget,
    metadataScreenshotTarget,
    handoffScreenshotTarget,
    canvasScreenshotTarget,
    focusNavigationScreenshotTarget,
    profileScreenshotTarget,
    runnableAppsScreenshotTarget,
    dailyFlowScreenshotTarget,
    wealthLabScreenshotTarget,
    canvasTarget,
    noteTarget,
  ].map((target) => rm(target, { force: true })),
);

await new Promise((resolve, reject) => {
  const child = spawn(executable, ["--phase9-smoke"], { stdio: "inherit", windowsHide: true });
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Packaged smoke exceeded the 60-second timeout."));
  }, 60_000);
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
if (!evidence.shell.brandLogoVisible) failures.push("packaged Lattice logo did not render");
if (!evidence.shell.svgFaviconPresent || !evidence.shell.pngFaviconPresent) {
  failures.push("packaged favicon set was incomplete");
}
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
const contentSize = evidence.shell.windowContentSize;
const expectedConstrainedBounds =
  nativeSlotBounds && contentSize
    ? {
        x: Math.min(Math.max(0, Math.floor(nativeSlotBounds.x)), contentSize.width - 1),
        y: Math.min(Math.max(0, Math.floor(nativeSlotBounds.y)), contentSize.height - 1),
        width: Math.max(
          1,
          Math.min(
            Math.floor(nativeSlotBounds.width),
            contentSize.width - Math.floor(nativeSlotBounds.x),
          ),
        ),
        height: Math.max(
          1,
          Math.min(
            Math.floor(nativeSlotBounds.height),
            contentSize.height - Math.floor(nativeSlotBounds.y),
          ),
        ),
      }
    : null;
if (
  !expectedConstrainedBounds ||
  JSON.stringify(rendererBounds) !== JSON.stringify(expectedConstrainedBounds)
) {
  failures.push("native view bounds did not match the safely constrained React layout slot");
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
if (
  evidence.profiles?.profileCount !== 2 ||
  evidence.profiles?.activeProfileName !== "Personal" ||
  !evidence.profiles?.profileMenuVisible ||
  !evidence.profiles?.privacyExplanationVisible ||
  !evidence.profiles?.nativeViewHiddenWhileMenuOpen
) {
  failures.push("trusted website-profile creation, switching, or menu isolation failed");
}
if (
  !evidence.profiles?.firstCookieRetained ||
  !evidence.profiles?.secondCookieInitiallyAbsent ||
  !evidence.profiles?.secondCookieRetained ||
  !evidence.profiles?.partitionsDistinct ||
  !evidence.profiles?.registryContainsNoCredentials
) {
  failures.push(
    "website identity partitions were not isolated or profile metadata held credentials",
  );
}
if (
  evidence.navigation?.heading !== "Welcome back. Choose one thing." ||
  evidence.navigation?.resumeCardCount !== 3 ||
  evidence.navigation?.intention !== "Finish one meaningful thread"
) {
  failures.push("focus home did not expose the intended calm resume model");
}
if (
  !evidence.navigation?.focusMode ||
  !evidence.navigation?.chromeHidden ||
  !evidence.navigation?.nativeViewHidden ||
  !evidence.navigation?.escapeRestoredNavigation
) {
  failures.push("distraction-free focus view was not reversible or isolated");
}
if (
  JSON.stringify(evidence.navigation?.shortcutRouteSequence) !==
    JSON.stringify([
      "Canvas pages",
      "Saved links",
      "Reading queue",
      "Settings",
      "Runnable apps",
      "Focus",
      "Browse",
    ]) ||
  !evidence.navigation?.browserRestoredAfterShortcuts
) {
  failures.push("focus navigation shortcuts did not route through every stable destination");
}
if (
  evidence.runnableApps?.heading !== "Runnable apps" ||
  evidence.runnableApps?.appName !== "Pomodoro" ||
  !evidence.runnableApps?.originalResult.startsWith("Original: Stopped at") ||
  evidence.runnableApps?.correctedResult !== "Corrected: Completed at 1h 00m" ||
  !evidence.runnableApps?.overridden ||
  !evidence.runnableApps?.originalPreserved ||
  !evidence.runnableApps?.persisted ||
  !evidence.runnableApps?.activeRunCleared ||
  !evidence.runnableApps?.profileScoped ||
  !evidence.runnableApps?.adaptiveLightSurface ||
  !evidence.runnableApps?.nativeViewHidden
) {
  failures.push("runnable Pomodoro workflow did not preserve its original and corrected results");
}
if (
  evidence.dailyFlow?.heading !== "Daily Flow" ||
  evidence.dailyFlow?.catalogCount !== 3 ||
  evidence.dailyFlow?.nowTask !== "Prepare Phase 14 council synthesis" ||
  evidence.dailyFlow?.todaySummary !== "1 of 3 chosen" ||
  evidence.dailyFlow?.originalText !== "Prepare Phase 14 council synthesis" ||
  evidence.dailyFlow?.effectiveText !== "Prepare and ship Phase 14 council synthesis" ||
  !["organized", "now-set", "completed", "text-corrected"].every((type) =>
    evidence.dailyFlow?.activityTypes?.includes(type),
  ) ||
  !evidence.dailyFlow?.originalPreserved ||
  !evidence.dailyFlow?.explicitlyCompleted ||
  !evidence.dailyFlow?.linkedPomodoro ||
  !evidence.dailyFlow?.linkedTimerStopped ||
  !evidence.dailyFlow?.persisted ||
  !evidence.dailyFlow?.profileScoped ||
  !evidence.dailyFlow?.activeRunCleared ||
  !evidence.dailyFlow?.adaptiveLightSurface ||
  !evidence.dailyFlow?.nativeViewHidden
) {
  failures.push(
    "Daily Flow capture, GTD, linked focus, correction, or persistence workflow failed",
  );
}
if (
  evidence.wealthLab?.heading !== "Wealth Lab" ||
  evidence.wealthLab?.catalogCount !== 3 ||
  evidence.wealthLab?.incomeTargetMinor !== 12_000_000 ||
  evidence.wealthLab?.investmentTargetMinor !== 2_500_000 ||
  evidence.wealthLab?.incomeMinor !== 10_000_000 ||
  evidence.wealthLab?.expenseMinor !== 3_500_000 ||
  evidence.wealthLab?.investmentMinor !== 2_000_000 ||
  evidence.wealthLab?.netCashMinor !== 6_500_000 ||
  evidence.wealthLab?.originalExpenseMinor !== 4_000_000 ||
  evidence.wealthLab?.correctedExpenseMinor !== 3_500_000 ||
  !evidence.wealthLab?.originalExpensePreserved ||
  evidence.wealthLab?.ideaTitle !== "Productized clinic launch audit" ||
  evidence.wealthLab?.ideaNextStep !== "Offer one paid pilot to a clinic owner" ||
  evidence.wealthLab?.ideaStatus !== "testing" ||
  !evidence.wealthLab?.ideaFeatured ||
  evidence.wealthLab?.netWorthMinor !== 40_000_000 ||
  !evidence.wealthLab?.linkedPomodoro ||
  !evidence.wealthLab?.linkedTimerStopped ||
  !evidence.wealthLab?.safetyBoundaryVisible ||
  !evidence.wealthLab?.persisted ||
  !evidence.wealthLab?.profileScoped ||
  !evidence.wealthLab?.activeRunCleared ||
  !evidence.wealthLab?.adaptiveLightSurface ||
  !evidence.wealthLab?.nativeViewHidden
) {
  failures.push("Wealth Lab money, earning experiment, net worth, or safety workflow failed");
}
if (!evidence.desktopLifecycle.guardedDeleteBlockedForOpenTab) {
  failures.push("occupied desktop deletion was not blocked");
}
if (!evidence.desktopLifecycle.menuVisible) {
  failures.push("tab-move browser menu did not render");
}
if (!evidence.desktopLifecycle.nativeViewHiddenWhileMenuOpen) {
  failures.push("native website view remained above the trusted browser menu");
}
if (
  evidence.desktopLifecycle.movedToDesktop !== "Inspiration" ||
  !evidence.desktopLifecycle.movedTabRetained ||
  !evidence.desktopLifecycle.emptiedSourceDesktop
) {
  failures.push("live tab did not move between desktops without closing");
}
if (
  !evidence.desktopLifecycle.deletionConfirmationVisible ||
  !evidence.desktopLifecycle.deletedEmptyDesktop ||
  !evidence.desktopLifecycle.adjacentDesktopActivated
) {
  failures.push("confirmed empty-desktop deletion did not select the adjacent desktop");
}
if (!evidence.desktopLifecycle.savedResearchDesktopPreserved) {
  failures.push("desktop lifecycle changed the saved Research desktop");
}
if (
  !evidence.metadataEditing.formVisible ||
  evidence.metadataEditing.title !== "Phase 8 edited research note" ||
  !evidence.metadataEditing.description.startsWith("Refined after capture")
) {
  failures.push("saved-link metadata edit form did not publish the requested values");
}
if (
  !evidence.metadataEditing.pathPreserved ||
  !evidence.metadataEditing.bodyPreserved ||
  !evidence.metadataEditing.urlPreserved ||
  !evidence.metadataEditing.readingStatePreserved ||
  evidence.metadataEditing.temporaryFilesRemaining !== 0
) {
  failures.push("saved-link metadata editing changed protected note state or left temp files");
}
if (
  !evidence.obsidianHandoff.openActionVisible ||
  !evidence.obsidianHandoff.revealActionVisible ||
  evidence.obsidianHandoff.openInvocations !== 1 ||
  evidence.obsidianHandoff.revealInvocations !== 1
) {
  failures.push("trusted Obsidian handoff controls did not dispatch exactly once");
}
if (
  !evidence.obsidianHandoff.obsidianUri.startsWith("obsidian://open?path=") ||
  !evidence.obsidianHandoff.decodedPathMatches ||
  !evidence.obsidianHandoff.revealedPathMatches ||
  !evidence.obsidianHandoff.notePathNotRendered
) {
  failures.push("Obsidian handoff did not resolve the exact private note target safely");
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
  evidence.readingQueue.itemTitle !== "Phase 8 packaged smoke" ||
  !evidence.readingQueue.markReadVisible
) {
  failures.push("packaged reading queue UI did not expose the queued Markdown item");
}
if (!evidence.readingQueue.nativeViewHidden) {
  failures.push("native website view remained visible beneath the trusted reading queue");
}
if (
  evidence.canvas.pageCount !== 2 ||
  evidence.canvas.title !== "Phase 9 research canvas" ||
  evidence.canvas.folder !== "Projects/Browser" ||
  evidence.canvas.nodeCount !== 3
) {
  failures.push("nested canvas pages did not round-trip through the packaged UI");
}
if (
  JSON.stringify(evidence.canvas.nodeKinds) !==
    JSON.stringify(["text:note", "link:iframe", "text:links"]) ||
  JSON.stringify(evidence.canvas.typedLinkKinds) !==
    JSON.stringify(["page", "object", "url", "document", "image", "file"])
) {
  failures.push("canvas object or typed-link kinds did not retain their portable representation");
}
if (
  !evidence.canvas.jsonCanvasShape ||
  !evidence.canvas.pageLinkNavigated ||
  !evidence.canvas.objectLinkFocused ||
  !evidence.canvas.websiteOpenedInIsolatedView
) {
  failures.push("canvas page, object, or isolated website actions failed");
}
if (
  evidence.canvas.localRevealInvocations !== 1 ||
  !evidence.canvas.revealedPathMatches ||
  !evidence.canvas.nativeViewHidden ||
  !evidence.canvas.pathNotRendered ||
  evidence.canvas.temporaryFilesRemaining !== 0
) {
  failures.push("canvas file reveal or trusted-shell boundary failed");
}
if (
  evidence.canvas.unresolvedReferenceCount !== 1 ||
  !evidence.canvas.repairDiagnosticsVisible ||
  !evidence.canvas.backlinkSourceVisible ||
  !evidence.canvas.privateReferencePathHidden
) {
  failures.push("backlinks or privacy-safe broken-reference diagnostics failed");
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
if (
  evidence.themes?.optionCount !== 3 ||
  evidence.themes?.defaultTheme !== "lattice-dark" ||
  !evidence.themes?.feltApplied ||
  !evidence.themes?.feltTextureVisible ||
  evidence.themes?.customName !== "Smoke Aubergine" ||
  !evidence.themes?.customApplied ||
  !evidence.themes?.customPersisted ||
  !evidence.themes?.customProfileScoped ||
  !evidence.themes?.undoRestored ||
  !evidence.themes?.returnedToDark ||
  !evidence.themes?.nativeTitleBarSynced
) {
  failures.push("profile-scoped Dark, Felt White, or named Custom theme workflow failed");
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
const metadataScreenshotBytes = await readFile(evidence.metadataEditing.screenshotPath);
const handoffScreenshotBytes = await readFile(evidence.obsidianHandoff.screenshotPath);
const canvasScreenshotBytes = await readFile(evidence.canvas.screenshotPath);
const focusNavigationScreenshotBytes = await readFile(evidence.navigation.screenshotPath);
const profileScreenshotBytes = await readFile(evidence.profiles.screenshotPath);
const runnableAppsScreenshotBytes = await readFile(evidence.runnableApps.screenshotPath);
const dailyFlowScreenshotBytes = await readFile(evidence.dailyFlow.screenshotPath);
const wealthLabScreenshotBytes = await readFile(evidence.wealthLab.screenshotPath);
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
  throw new Error("Phase 8 shell screenshot is not a PNG file.");
}
if (shellScreenshotBytes.byteLength !== evidence.shell.screenshotBytes) {
  throw new Error("Phase 8 shell screenshot byte count changed before evidence collection.");
}
const shellScreenshotPixels = {
  width: shellScreenshotBytes.readUInt32BE(16),
  height: shellScreenshotBytes.readUInt32BE(20),
};
if (shellScreenshotPixels.width < 900 || shellScreenshotPixels.height < 620) {
  throw new Error("Phase 8 shell screenshot dimensions were not usable.");
}
evidence.shell.screenshotPixels = shellScreenshotPixels;
evidence.shell.screenshotSha256 = createHash("sha256").update(shellScreenshotBytes).digest("hex");
if (!metadataScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 8 metadata editor screenshot is not a PNG file.");
}
if (metadataScreenshotBytes.byteLength !== evidence.metadataEditing.screenshotBytes) {
  throw new Error("Phase 8 metadata editor screenshot byte count changed before collection.");
}
const metadataScreenshotPixels = {
  width: metadataScreenshotBytes.readUInt32BE(16),
  height: metadataScreenshotBytes.readUInt32BE(20),
};
if (metadataScreenshotPixels.width < 900 || metadataScreenshotPixels.height < 620) {
  throw new Error("Phase 8 metadata editor screenshot dimensions were not usable.");
}
evidence.metadataEditing.screenshotPixels = metadataScreenshotPixels;
evidence.metadataEditing.screenshotSha256 = createHash("sha256")
  .update(metadataScreenshotBytes)
  .digest("hex");
if (!handoffScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 8 Obsidian handoff screenshot is not a PNG file.");
}
if (handoffScreenshotBytes.byteLength !== evidence.obsidianHandoff.screenshotBytes) {
  throw new Error("Phase 8 Obsidian handoff screenshot byte count changed before collection.");
}
const handoffScreenshotPixels = {
  width: handoffScreenshotBytes.readUInt32BE(16),
  height: handoffScreenshotBytes.readUInt32BE(20),
};
if (handoffScreenshotPixels.width < 900 || handoffScreenshotPixels.height < 620) {
  throw new Error("Phase 8 Obsidian handoff screenshot dimensions were not usable.");
}
evidence.obsidianHandoff.screenshotPixels = handoffScreenshotPixels;
evidence.obsidianHandoff.screenshotSha256 = createHash("sha256")
  .update(handoffScreenshotBytes)
  .digest("hex");
if (!canvasScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 9 canvas screenshot is not a PNG file.");
}
if (canvasScreenshotBytes.byteLength !== evidence.canvas.screenshotBytes) {
  throw new Error("Phase 9 canvas screenshot byte count changed before collection.");
}
const canvasScreenshotPixels = {
  width: canvasScreenshotBytes.readUInt32BE(16),
  height: canvasScreenshotBytes.readUInt32BE(20),
};
if (canvasScreenshotPixels.width < 900 || canvasScreenshotPixels.height < 620) {
  throw new Error("Phase 9 canvas screenshot dimensions were not usable.");
}
evidence.canvas.screenshotPixels = canvasScreenshotPixels;
evidence.canvas.screenshotSha256 = createHash("sha256").update(canvasScreenshotBytes).digest("hex");
if (!focusNavigationScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 10 focus navigation screenshot is not a PNG file.");
}
if (focusNavigationScreenshotBytes.byteLength !== evidence.navigation.screenshotBytes) {
  throw new Error("Phase 10 focus navigation screenshot byte count changed before collection.");
}
const focusNavigationPixels = {
  width: focusNavigationScreenshotBytes.readUInt32BE(16),
  height: focusNavigationScreenshotBytes.readUInt32BE(20),
};
if (focusNavigationPixels.width < 900 || focusNavigationPixels.height < 620) {
  throw new Error("Phase 10 focus navigation screenshot dimensions were not usable.");
}
evidence.navigation.screenshotPixels = focusNavigationPixels;
evidence.navigation.screenshotSha256 = createHash("sha256")
  .update(focusNavigationScreenshotBytes)
  .digest("hex");
if (!profileScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 12 profile screenshot is not a PNG file.");
}
if (profileScreenshotBytes.byteLength !== evidence.profiles.screenshotBytes) {
  throw new Error("Phase 12 profile screenshot byte count changed before collection.");
}
const profileScreenshotPixels = {
  width: profileScreenshotBytes.readUInt32BE(16),
  height: profileScreenshotBytes.readUInt32BE(20),
};
if (profileScreenshotPixels.width < 900 || profileScreenshotPixels.height < 620) {
  throw new Error("Phase 12 profile screenshot dimensions were not usable.");
}
evidence.profiles.screenshotPixels = profileScreenshotPixels;
evidence.profiles.screenshotSha256 = createHash("sha256")
  .update(profileScreenshotBytes)
  .digest("hex");
if (!runnableAppsScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 13 runnable-app screenshot is not a PNG file.");
}
if (runnableAppsScreenshotBytes.byteLength !== evidence.runnableApps.screenshotBytes) {
  throw new Error("Phase 13 runnable-app screenshot byte count changed before collection.");
}
const runnableAppsScreenshotPixels = {
  width: runnableAppsScreenshotBytes.readUInt32BE(16),
  height: runnableAppsScreenshotBytes.readUInt32BE(20),
};
if (runnableAppsScreenshotPixels.width < 900 || runnableAppsScreenshotPixels.height < 620) {
  throw new Error("Phase 13 runnable-app screenshot dimensions were not usable.");
}
evidence.runnableApps.screenshotPixels = runnableAppsScreenshotPixels;
evidence.runnableApps.screenshotSha256 = createHash("sha256")
  .update(runnableAppsScreenshotBytes)
  .digest("hex");
if (!dailyFlowScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 14 Daily Flow screenshot is not a PNG file.");
}
if (dailyFlowScreenshotBytes.byteLength !== evidence.dailyFlow.screenshotBytes) {
  throw new Error("Phase 14 Daily Flow screenshot byte count changed before collection.");
}
const dailyFlowScreenshotPixels = {
  width: dailyFlowScreenshotBytes.readUInt32BE(16),
  height: dailyFlowScreenshotBytes.readUInt32BE(20),
};
if (dailyFlowScreenshotPixels.width < 900 || dailyFlowScreenshotPixels.height < 620) {
  throw new Error("Phase 14 Daily Flow screenshot dimensions were not usable.");
}
evidence.dailyFlow.screenshotPixels = dailyFlowScreenshotPixels;
evidence.dailyFlow.screenshotSha256 = createHash("sha256")
  .update(dailyFlowScreenshotBytes)
  .digest("hex");
if (!wealthLabScreenshotBytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("Phase 15 Wealth Lab screenshot is not a PNG file.");
}
if (wealthLabScreenshotBytes.byteLength !== evidence.wealthLab.screenshotBytes) {
  throw new Error("Phase 15 Wealth Lab screenshot byte count changed before collection.");
}
const wealthLabScreenshotPixels = {
  width: wealthLabScreenshotBytes.readUInt32BE(16),
  height: wealthLabScreenshotBytes.readUInt32BE(20),
};
if (wealthLabScreenshotPixels.width < 900 || wealthLabScreenshotPixels.height < 620) {
  throw new Error("Phase 15 Wealth Lab screenshot dimensions were not usable.");
}
evidence.wealthLab.screenshotPixels = wealthLabScreenshotPixels;
evidence.wealthLab.screenshotSha256 = createHash("sha256")
  .update(wealthLabScreenshotBytes)
  .digest("hex");
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
if (
  !noteText.includes('title: "Phase 8 edited research note"') ||
  !noteText.includes(
    'description: "Refined after capture without replacing the Obsidian note body."',
  )
) {
  throw new Error("Saved Markdown did not retain the edited metadata.");
}
if (!noteText.includes('reading_status: "queued"') || !noteText.match(/^queued_at: ".+"$/m)) {
  throw new Error("Saved Markdown did not retain its reading-queue state.");
}
const canvasBytes = await readFile(evidence.canvas.absolutePath);
if (createHash("sha256").update(canvasBytes).digest("hex") !== evidence.canvas.sha256) {
  throw new Error("Saved JSON Canvas hash does not match the packaged-app evidence.");
}
const canvasDocument = JSON.parse(canvasBytes.toString("utf8"));
if (
  !Array.isArray(canvasDocument.nodes) ||
  !Array.isArray(canvasDocument.edges) ||
  canvasDocument.lattice?.version !== 1 ||
  canvasDocument.nodes.length !== 3
) {
  throw new Error("Saved .canvas file does not use the expected JSON Canvas shape.");
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
  throw new Error(`Expected an unsigned Phase 9 executable, got ${authenticodeStatus}.`);
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
await copyFile(evidence.metadataEditing.screenshotPath, metadataScreenshotTarget);
await copyFile(evidence.obsidianHandoff.screenshotPath, handoffScreenshotTarget);
await copyFile(evidence.canvas.screenshotPath, canvasScreenshotTarget);
await copyFile(evidence.navigation.screenshotPath, focusNavigationScreenshotTarget);
await copyFile(evidence.profiles.screenshotPath, profileScreenshotTarget);
await copyFile(evidence.runnableApps.screenshotPath, runnableAppsScreenshotTarget);
await copyFile(evidence.dailyFlow.screenshotPath, dailyFlowScreenshotTarget);
await copyFile(evidence.wealthLab.screenshotPath, wealthLabScreenshotTarget);
await copyFile(evidence.canvas.absolutePath, canvasTarget);
await copyFile(evidence.note.absolutePath, noteTarget);
const copiedScreenshotBytes = await readFile(screenshotTarget);
const copiedShellScreenshotBytes = await readFile(shellScreenshotTarget);
const copiedMetadataScreenshotBytes = await readFile(metadataScreenshotTarget);
const copiedHandoffScreenshotBytes = await readFile(handoffScreenshotTarget);
const copiedCanvasScreenshotBytes = await readFile(canvasScreenshotTarget);
const copiedFocusNavigationScreenshotBytes = await readFile(focusNavigationScreenshotTarget);
const copiedProfileScreenshotBytes = await readFile(profileScreenshotTarget);
const copiedRunnableAppsScreenshotBytes = await readFile(runnableAppsScreenshotTarget);
const copiedDailyFlowScreenshotBytes = await readFile(dailyFlowScreenshotTarget);
const copiedWealthLabScreenshotBytes = await readFile(wealthLabScreenshotTarget);
const copiedCanvasBytes = await readFile(canvasTarget);
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
if (
  createHash("sha256").update(copiedMetadataScreenshotBytes).digest("hex") !==
  evidence.metadataEditing.screenshotSha256
) {
  throw new Error("Collected metadata editor screenshot hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedHandoffScreenshotBytes).digest("hex") !==
  evidence.obsidianHandoff.screenshotSha256
) {
  throw new Error("Collected Obsidian handoff screenshot hash changed while publishing evidence.");
}
if (createHash("sha256").update(copiedNoteBytes).digest("hex") !== evidence.note.sha256) {
  throw new Error("Collected Markdown hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedCanvasScreenshotBytes).digest("hex") !==
  evidence.canvas.screenshotSha256
) {
  throw new Error("Collected canvas screenshot hash changed while publishing evidence.");
}
if (createHash("sha256").update(copiedCanvasBytes).digest("hex") !== evidence.canvas.sha256) {
  throw new Error("Collected JSON Canvas hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedFocusNavigationScreenshotBytes).digest("hex") !==
  evidence.navigation.screenshotSha256
) {
  throw new Error("Collected focus navigation screenshot hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedProfileScreenshotBytes).digest("hex") !==
  evidence.profiles.screenshotSha256
) {
  throw new Error("Collected profile screenshot hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedRunnableAppsScreenshotBytes).digest("hex") !==
  evidence.runnableApps.screenshotSha256
) {
  throw new Error("Collected runnable-app screenshot hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedDailyFlowScreenshotBytes).digest("hex") !==
  evidence.dailyFlow.screenshotSha256
) {
  throw new Error("Collected Daily Flow screenshot hash changed while publishing evidence.");
}
if (
  createHash("sha256").update(copiedWealthLabScreenshotBytes).digest("hex") !==
  evidence.wealthLab.screenshotSha256
) {
  throw new Error("Collected Wealth Lab screenshot hash changed while publishing evidence.");
}
evidence.remote.artifactPath = screenshotTarget;
evidence.shell.artifactPath = shellScreenshotTarget;
evidence.metadataEditing.artifactPath = metadataScreenshotTarget;
evidence.obsidianHandoff.artifactPath = handoffScreenshotTarget;
evidence.canvas.screenshotArtifactPath = canvasScreenshotTarget;
evidence.canvas.artifactPath = canvasTarget;
evidence.navigation.artifactPath = focusNavigationScreenshotTarget;
evidence.profiles.artifactPath = profileScreenshotTarget;
evidence.runnableApps.artifactPath = runnableAppsScreenshotTarget;
evidence.dailyFlow.artifactPath = dailyFlowScreenshotTarget;
evidence.wealthLab.artifactPath = wealthLabScreenshotTarget;
evidence.note.artifactPath = noteTarget;
await writeFile(evidenceTarget, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`Packaged Phase 9 smoke passed. Evidence: ${evidenceTarget}`);
