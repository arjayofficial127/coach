import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dialog } from "electron";
import type {
  CanvasPageRecord,
  CanvasPageSummary,
  CreateCanvasPageInput,
  ProbeNoteInput,
  RevealCanvasReferenceInput,
  SaveCanvasPageInput,
  SavedLinkRecord,
  SaveNoteResult,
  SetReadingStatusInput,
  UpdateSavedLinkMetadataInput,
  VaultInfo,
} from "../../shared/contracts";
import { saveProbeNoteAtomically } from "./atomic-note";
import {
  createCanvasPageAtomically,
  getCanvasPageFromVault,
  listCanvasPagesFromVault,
  resolveCanvasFileReference,
  saveCanvasPageAtomically,
} from "./canvas-page";
import { updateReadingStatusAtomically } from "./reading-status";
import { resolveSavedLinkHandoff, type SavedLinkHandoff } from "./saved-link-handoff";
import { updateSavedLinkMetadataAtomically } from "./saved-link-metadata";
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

  async setReadingStatus(input: SetReadingStatusInput): Promise<SavedLinkRecord> {
    if (!this.activeVault) {
      throw new Error("Choose a vault before updating a reading item.");
    }
    const links = await listSavedLinksFromVault(this.activeVault.canonicalPath);
    const matches = links.filter((link) => link.id === input.id);
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? "The saved link could not be found."
          : "Duplicate saved-link IDs must be resolved in Obsidian first.",
      );
    }
    const link = matches[0];
    if (!link) throw new Error("The saved link could not be found.");
    await updateReadingStatusAtomically(
      this.activeVault.canonicalPath,
      link.relativePath,
      link.id,
      input.status,
    );
    const updated = (await listSavedLinksFromVault(this.activeVault.canonicalPath)).find(
      (candidate) => candidate.id === input.id,
    );
    if (!updated) throw new Error("The updated saved link could not be read back.");
    return updated;
  }

  async updateSavedLinkMetadata(input: UpdateSavedLinkMetadataInput): Promise<SavedLinkRecord> {
    if (!this.activeVault) {
      throw new Error("Choose a vault before editing a saved link.");
    }
    const links = await listSavedLinksFromVault(this.activeVault.canonicalPath);
    const matches = links.filter((link) => link.id === input.id);
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? "The saved link could not be found."
          : "Duplicate saved-link IDs must be resolved in Obsidian first.",
      );
    }
    const link = matches[0];
    if (!link) throw new Error("The saved link could not be found.");
    await updateSavedLinkMetadataAtomically(
      this.activeVault.canonicalPath,
      link.relativePath,
      link.id,
      input.title,
      input.description,
    );
    const updated = (await listSavedLinksFromVault(this.activeVault.canonicalPath)).find(
      (candidate) => candidate.id === input.id,
    );
    if (!updated) throw new Error("The edited saved link could not be read back.");
    return updated;
  }

  async resolveSavedLinkHandoff(id: string): Promise<SavedLinkHandoff> {
    if (!this.activeVault) {
      throw new Error("Choose a vault before opening a saved link.");
    }
    return resolveSavedLinkHandoff(this.activeVault.canonicalPath, id);
  }

  async listCanvasPages(): Promise<CanvasPageSummary[]> {
    if (!this.activeVault) return [];
    return listCanvasPagesFromVault(this.activeVault.canonicalPath);
  }

  async createCanvasPage(input: CreateCanvasPageInput): Promise<CanvasPageRecord> {
    if (!this.activeVault) throw new Error("Choose a vault before creating a canvas page.");
    return createCanvasPageAtomically(this.activeVault.canonicalPath, input);
  }

  async getCanvasPage(id: string): Promise<CanvasPageRecord> {
    if (!this.activeVault) throw new Error("Choose a vault before opening a canvas page.");
    return getCanvasPageFromVault(this.activeVault.canonicalPath, id);
  }

  async saveCanvasPage(input: SaveCanvasPageInput): Promise<CanvasPageRecord> {
    if (!this.activeVault) throw new Error("Choose a vault before saving a canvas page.");
    return saveCanvasPageAtomically(this.activeVault.canonicalPath, input);
  }

  async resolveCanvasReference(input: RevealCanvasReferenceInput): Promise<string> {
    if (!this.activeVault) throw new Error("Choose a vault before revealing a canvas file.");
    return resolveCanvasFileReference(this.activeVault.canonicalPath, input);
  }

  async disconnect(): Promise<void> {
    this.activeVault = null;
    if (this.statePath) await rm(this.statePath, { force: true });
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
