import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dialog } from "electron";
import type {
  ProbeNoteInput,
  SavedLinkRecord,
  SaveNoteResult,
  VaultInfo,
} from "../../shared/contracts";
import { saveProbeNoteAtomically } from "./atomic-note";
import { listSavedLinksFromVault } from "./saved-link-reader";

interface ActiveVault extends VaultInfo {
  canonicalPath: string;
}

export class VaultService {
  private activeVault: ActiveVault | null = null;

  constructor(private readonly statePath?: string) {}

  async createDisposable(): Promise<VaultInfo> {
    const directory = path.join(os.tmpdir(), "lattice-disposable-vaults", `vault-${randomUUID()}`);
    await mkdir(path.join(directory, ".obsidian"), { recursive: true });
    return this.setActiveVault(directory, true, false);
  }

  async choose(): Promise<VaultInfo | null> {
    const result = await dialog.showOpenDialog({
      title: "Choose an Obsidian vault",
      properties: ["openDirectory", "createDirectory"],
    });
    const selected = result.filePaths[0];
    if (result.canceled || !selected) {
      return null;
    }
    return this.setActiveVault(selected, false, true);
  }

  async current(): Promise<VaultInfo | null> {
    if (this.activeVault) return this.publicVault(this.activeVault);
    if (!this.statePath) return null;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.statePath, "utf8"));
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("directory" in parsed) ||
        typeof parsed.directory !== "string"
      ) {
        return null;
      }
      return this.setActiveVault(parsed.directory, false, false);
    } catch {
      return null;
    }
  }

  async saveProbeNote(input: ProbeNoteInput): Promise<SaveNoteResult> {
    if (!this.activeVault) {
      throw new Error("Create or choose a vault before saving a note.");
    }
    return saveProbeNoteAtomically(this.activeVault.canonicalPath, input);
  }

  async listSavedLinks(): Promise<SavedLinkRecord[]> {
    if (!this.activeVault) return [];
    return listSavedLinksFromVault(this.activeVault.canonicalPath);
  }

  private async setActiveVault(
    directory: string,
    disposable: boolean,
    persist: boolean,
  ): Promise<VaultInfo> {
    const canonicalPath = await realpath(directory);
    this.activeVault = {
      id: randomUUID(),
      canonicalPath,
      displayPath: canonicalPath,
      disposable,
    };
    if (persist) await this.persistVault(canonicalPath);
    return this.publicVault(this.activeVault);
  }

  private publicVault(vault: ActiveVault): VaultInfo {
    const { canonicalPath: _privatePath, ...publicInfo } = vault;
    return publicInfo;
  }

  private async persistVault(directory: string): Promise<void> {
    if (!this.statePath) return;
    await mkdir(path.dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify({ version: 1, directory }, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
