import { stat } from "node:fs/promises";
import type { BrowserWindow } from "electron";
import { dialog, nativeImage } from "electron";
import type {
  BrowserBounds,
  BrowserPrivacySummary,
  BrowserSnapshot,
  LiveTabPreviewBounds,
  ProfileState,
  ProfileSwitchResult,
} from "../../shared/contracts";
import { IPC } from "../../shared/contracts";
import { BrowserRuntime } from "../browser/browser-runtime";
import type { ProfileStore } from "./profile-store";

const MAX_SOURCE_AVATAR_BYTES = 10 * 1024 * 1024;

export class ProfileRuntime {
  private readonly runtimes = new Map<string, BrowserRuntime>();
  private activeProfileId: string;
  private visible = false;
  private bounds: BrowserBounds | null = null;
  private closed = false;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: ProfileStore,
  ) {
    this.activeProfileId = store.state().activeProfileId;
    this.runtimes.set(this.activeProfileId, this.createRuntime(this.activeProfileId));
  }

  state(): ProfileState {
    return this.store.state();
  }

  async createProfile(name: string): Promise<ProfileSwitchResult> {
    const state = await this.store.create(name);
    return { state, browser: this.activateRuntime(state.activeProfileId) };
  }

  updateProfile(profileId: string, name: string): Promise<ProfileState> {
    return this.store.updateName(profileId, name);
  }

  async chooseAvatar(profileId: string): Promise<ProfileState> {
    const result = await dialog.showOpenDialog(this.window, {
      title: "Choose a profile picture",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    const selected = result.filePaths[0];
    if (result.canceled || !selected) return this.store.state();
    const source = await stat(selected);
    if (!source.isFile() || source.size > MAX_SOURCE_AVATAR_BYTES) {
      throw new Error("Choose an image smaller than 10 MB.");
    }
    const image = nativeImage.createFromPath(selected);
    if (image.isEmpty()) throw new Error("The selected profile picture could not be read.");
    const size = image.getSize();
    const edge = Math.min(size.width, size.height);
    if (edge < 1) throw new Error("The selected profile picture has invalid dimensions.");
    const square = image.crop({
      x: Math.floor((size.width - edge) / 2),
      y: Math.floor((size.height - edge) / 2),
      width: edge,
      height: edge,
    });
    const png = square.resize({ width: 128, height: 128, quality: "best" }).toPNG();
    return this.store.setAvatar(profileId, png);
  }

  clearAvatar(profileId: string): Promise<ProfileState> {
    return this.store.clearAvatar(profileId);
  }

  async switchProfile(profileId: string): Promise<ProfileSwitchResult> {
    const state = await this.store.activate(profileId);
    return { state, browser: this.activateRuntime(profileId) };
  }

  navigate(input: string): Promise<void> {
    return this.activeRuntime().navigate(input);
  }

  back(): void {
    this.activeRuntime().back();
  }

  forward(): void {
    this.activeRuntime().forward();
  }

  reload(): void {
    this.activeRuntime().reload();
  }

  snapshot(): BrowserSnapshot {
    return this.activeRuntime().snapshot();
  }

  captureTabPreview(tabId: string): Promise<string | null> {
    return this.activeRuntime().captureTabPreview(tabId);
  }

  searchTabContents(tabIds: string[], query: string): Promise<string[]> {
    return this.activeRuntime().searchTabContents(tabIds, query);
  }

  async captureSelection(tabId: string) {
    const runtime = this.activeRuntime();
    const result = await runtime.captureSelection(tabId);
    if (this.closed || runtime !== this.activeRuntime())
      throw new Error("Website profile changed.");
    return result;
  }

  loadSiteIcons(urls: string[]): Promise<Record<string, string>> {
    return this.activeRuntime().loadSiteIcons(urls);
  }

  createTab(input?: string): Promise<BrowserSnapshot> {
    return this.activeRuntime().createTab(input);
  }

  switchTab(tabId: string): BrowserSnapshot {
    return this.activeRuntime().switchTab(tabId);
  }

  closeTab(tabId: string): BrowserSnapshot {
    return this.activeRuntime().closeTab(tabId);
  }

  setBounds(bounds: BrowserBounds): void {
    this.bounds = bounds;
    this.activeRuntime().setBounds(bounds);
  }

  setLivePreviews(previews: LiveTabPreviewBounds[]): void {
    this.activeRuntime().setLivePreviews(previews);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.activeRuntime().setVisible(visible);
  }

  privacySummary(): Promise<BrowserPrivacySummary> {
    return this.activeRuntime().privacySummary();
  }

  clearWebsiteData(): Promise<BrowserPrivacySummary> {
    return this.activeRuntime().clearWebsiteData();
  }

  collectPrivacyClearProbe(): ReturnType<BrowserRuntime["collectPrivacyClearProbe"]> {
    return this.activeRuntime().collectPrivacyClearProbe();
  }

  collectSecurityProbe(): ReturnType<BrowserRuntime["collectSecurityProbe"]> {
    return this.activeRuntime().collectSecurityProbe();
  }

  getBounds(): BrowserBounds {
    return this.activeRuntime().getBounds();
  }

  isVisible(): boolean {
    return this.activeRuntime().isVisible();
  }

  isDestroyed(): boolean {
    return [...this.runtimes.values()].every((runtime) => runtime.isDestroyed());
  }

  async collectProfileIsolationProbe(): Promise<{
    firstProfileId: string;
    secondProfileId: string;
    firstCookieRetained: boolean;
    secondCookieInitiallyAbsent: boolean;
    secondCookieRetained: boolean;
    partitionsDistinct: boolean;
  }> {
    const firstProfileId = this.activeProfileId;
    const cookieName = "lattice_profile_isolation_probe";
    await this.activeRuntime().setCookieProbe(cookieName, "first");
    const existing = this.store.state().profiles.find((profile) => profile.id !== firstProfileId);
    const secondProfileId = existing
      ? (await this.switchProfile(existing.id)).state.activeProfileId
      : (await this.createProfile("Work")).state.activeProfileId;
    const secondCookieInitiallyAbsent =
      (await this.activeRuntime().readCookieProbe(cookieName)) === null;
    await this.activeRuntime().setCookieProbe(cookieName, "second");
    await this.switchProfile(firstProfileId);
    const firstCookieRetained =
      (await this.activeRuntime().readCookieProbe(cookieName)) === "first";
    await this.switchProfile(secondProfileId);
    const secondCookieRetained =
      (await this.activeRuntime().readCookieProbe(cookieName)) === "second";
    await this.switchProfile(firstProfileId);
    return {
      firstProfileId,
      secondProfileId,
      firstCookieRetained,
      secondCookieInitiallyAbsent,
      secondCookieRetained,
      partitionsDistinct:
        this.store.partitionForProfile(firstProfileId) !==
        this.store.partitionForProfile(secondProfileId),
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const runtime of this.runtimes.values()) runtime.close();
    this.runtimes.clear();
  }

  private activateRuntime(profileId: string): BrowserSnapshot {
    if (this.closed) throw new Error("The profile runtime is closed.");
    const current = this.runtimes.get(this.activeProfileId);
    current?.setVisible(false);
    current?.setLivePreviews([]);
    this.activeProfileId = profileId;
    let next = this.runtimes.get(profileId);
    if (!next) {
      next = this.createRuntime(profileId);
      this.runtimes.set(profileId, next);
    }
    if (this.bounds) next.setBounds(this.bounds);
    next.setVisible(this.visible);
    return next.snapshot();
  }

  private activeRuntime(): BrowserRuntime {
    const runtime = this.runtimes.get(this.activeProfileId);
    if (!runtime) throw new Error("The active website profile is unavailable.");
    return runtime;
  }

  private createRuntime(profileId: string): BrowserRuntime {
    return new BrowserRuntime(this.window, {
      partition: this.store.partitionForProfile(profileId),
      emitState: (state) => {
        if (profileId === this.activeProfileId && !this.window.isDestroyed()) {
          this.window.webContents.send(IPC.browserState, state);
        }
      },
    });
  }
}
