import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dialog } from "electron";
import type {
  CanvasPageRecord,
  CanvasPageSummary,
  CaptureDesktopInboxInput,
  CreateCanvasPageInput,
  CreateWorkspaceEntryInput,
  DesktopFolderInput,
  LocalWorkspaceSnapshot,
  ProbeNoteInput,
  RenameWorkspaceEntryInput,
  RenameWorkspaceEntryResult,
  RevealCanvasReferenceInput,
  SaveCanvasPageInput,
  SavedLinkRecord,
  SaveNoteResult,
  SaveWorkspaceFileInput,
  SetReadingStatusInput,
  UpdateSavedLinkMetadataInput,
  VaultInfo,
  VaultReferenceIndex,
  VaultTrashResult,
  WorkspaceDirectoryListing,
  WorkspaceFileDocument,
  WorkspacePathInput,
} from "../../shared/contracts";
import { assertPathWithinRoot, saveProbeNoteAtomically } from "./atomic-note";
import {
  createCanvasPageAtomically,
  getCanvasPageFromVault,
  listCanvasPagesFromVault,
  resolveCanvasFileReference,
  resolveCanvasPagePath,
  saveCanvasPageAtomically,
} from "./canvas-page";
import {
  captureLocalInboxNote,
  createWorkspaceEntry,
  listWorkspaceDirectory,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveDesktopFolder,
  saveWorkspaceFile,
  syncLocalWorkspace,
} from "./local-workspace";
import { updateReadingStatusAtomically } from "./reading-status";
import { buildVaultReferenceIndex } from "./reference-index";
import { resolveSavedLinkHandoff, type SavedLinkHandoff } from "./saved-link-handoff";
import { updateSavedLinkMetadataAtomically } from "./saved-link-metadata";
import { listSavedLinksFromVault } from "./saved-link-reader";

interface ActiveVault extends VaultInfo {
  canonicalPath: string;
}

interface TrashedVaultFile {
  vaultRoot: string;
  originalPath: string;
  trashPath: string;
}

export class VaultService {
  private activeVault: ActiveVault | null = null;
  private readonly trashedFiles = new Map<string, TrashedVaultFile>();

  constructor(private readonly statePath?: string) {}

  async createDisposable(): Promise<VaultInfo> {
    const directory = path.join(
      os.tmpdir(),
      "coach-disposable-workspaces",
      `workspace-${randomUUID()}`,
    );
    await mkdir(directory, { recursive: true });
    return this.setActiveVault(directory, true, false);
  }

  async choose(): Promise<VaultInfo | null> {
    const result = await dialog.showOpenDialog({
      title: "Choose a local Coach workspace folder",
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

  async trashSavedLink(id: string): Promise<VaultTrashResult> {
    const root = this.requireActiveVault("Choose a vault before removing a saved link.");
    const matches = (await listSavedLinksFromVault(root)).filter((link) => link.id === id);
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? "The saved link could not be found."
          : "Duplicate saved-link IDs must be resolved in Obsidian first.",
      );
    }
    const link = matches[0];
    if (!link) throw new Error("The saved link could not be found.");
    const source = path.resolve(root, link.relativePath);
    const token = await this.moveToTrash(root, source);
    return { token, kind: "saved-link", title: link.title };
  }

  async trashCanvasPage(id: string): Promise<VaultTrashResult> {
    const root = this.requireActiveVault("Choose a vault before removing a canvas page.");
    const page = await getCanvasPageFromVault(root, id);
    const source = await resolveCanvasPagePath(root, id);
    const token = await this.moveToTrash(root, source);
    return { token, kind: "canvas-page", title: page.title };
  }

  async restoreTrash(token: string): Promise<void> {
    const entry = this.trashedFiles.get(token);
    if (!entry)
      throw new Error("This recovery action has expired. The file remains in .lattice-trash.");
    const root = this.requireActiveVault(
      "Reconnect the original vault before restoring this file.",
    );
    if (root !== entry.vaultRoot) {
      throw new Error("Reconnect the original vault before restoring this file.");
    }
    assertPathWithinRoot(root, entry.originalPath);
    assertPathWithinRoot(root, entry.trashPath);
    const trashStats = await lstat(entry.trashPath);
    if (!trashStats.isFile() || trashStats.isSymbolicLink()) {
      throw new Error("The recoverable file is no longer available.");
    }
    try {
      await lstat(entry.originalPath);
      throw new Error(
        "A file now exists at the original location; the trashed copy was left safe.",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const originalDirectory = path.dirname(entry.originalPath);
    await mkdir(originalDirectory, { recursive: true });
    const canonicalOriginalDirectory = await realpath(originalDirectory);
    assertPathWithinRoot(root, canonicalOriginalDirectory);
    await rename(entry.trashPath, entry.originalPath);
    this.trashedFiles.delete(token);
  }

  async resolveCanvasReference(input: RevealCanvasReferenceInput): Promise<string> {
    if (!this.activeVault) throw new Error("Choose a vault before revealing a canvas file.");
    return resolveCanvasFileReference(this.activeVault.canonicalPath, input);
  }

  async referenceIndex(): Promise<VaultReferenceIndex> {
    if (!this.activeVault)
      return { generatedAt: new Date().toISOString(), entries: [], unresolvedCount: 0 };
    const root = this.activeVault.canonicalPath;
    const [savedLinks, pageSummaries] = await Promise.all([
      listSavedLinksFromVault(root),
      listCanvasPagesFromVault(root),
    ]);
    const pages = await Promise.all(
      pageSummaries.map((page) => getCanvasPageFromVault(root, page.id)),
    );
    return buildVaultReferenceIndex(root, savedLinks, pages);
  }

  async syncDesktopFolders(desktops: DesktopFolderInput[]): Promise<LocalWorkspaceSnapshot> {
    if (!this.activeVault) return { connected: false, rootName: "", desktops: [] };
    return syncLocalWorkspace(this.activeVault.canonicalPath, desktops);
  }

  async captureDesktopInbox(input: CaptureDesktopInboxInput): Promise<LocalWorkspaceSnapshot> {
    const root = this.requireActiveVault("Connect a local folder before capturing to Inbox.");
    await captureLocalInboxNote(root, input);
    const manifest = await this.currentDesktopInputs(root);
    return syncLocalWorkspace(root, manifest);
  }

  async resolveDesktopFolder(desktopId: string): Promise<string> {
    const root = this.requireActiveVault("Connect a local folder before opening desktop files.");
    return resolveDesktopFolder(root, desktopId);
  }

  async listWorkspaceDirectory(input: WorkspacePathInput): Promise<WorkspaceDirectoryListing> {
    const root = this.requireActiveVault("Connect a local folder before browsing desktop files.");
    return listWorkspaceDirectory(root, input);
  }

  async readWorkspaceFile(input: WorkspacePathInput): Promise<WorkspaceFileDocument> {
    const root = this.requireActiveVault("Connect a local folder before opening desktop files.");
    return readWorkspaceFile(root, input);
  }

  async createWorkspaceEntry(input: CreateWorkspaceEntryInput): Promise<WorkspaceDirectoryListing> {
    const root = this.requireActiveVault("Connect a local folder before creating desktop files.");
    return createWorkspaceEntry(root, input);
  }

  async saveWorkspaceFile(input: SaveWorkspaceFileInput): Promise<WorkspaceFileDocument> {
    const root = this.requireActiveVault("Connect a local folder before saving desktop files.");
    return saveWorkspaceFile(root, input);
  }

  async renameWorkspaceEntry(
    input: RenameWorkspaceEntryInput,
  ): Promise<RenameWorkspaceEntryResult> {
    const root = this.requireActiveVault("Connect a local folder before renaming desktop files.");
    return renameWorkspaceEntry(root, input);
  }

  async disconnect(): Promise<void> {
    this.activeVault = null;
    if (this.statePath) await rm(this.statePath, { force: true });
  }

  private requireActiveVault(message: string): string {
    if (!this.activeVault) throw new Error(message);
    return this.activeVault.canonicalPath;
  }

  private async currentDesktopInputs(root: string): Promise<DesktopFolderInput[]> {
    const manifestPath = path.join(root, ".coach", "workspace.json");
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as {
      desktops?: Array<{ id?: unknown; name?: unknown }>;
    };
    return (parsed.desktops ?? [])
      .filter(
        (desktop): desktop is { id: string; name: string } =>
          typeof desktop.id === "string" && typeof desktop.name === "string",
      )
      .map(({ id, name }) => ({ id, name }));
  }

  private async moveToTrash(root: string, source: string): Promise<string> {
    assertPathWithinRoot(root, source);
    const sourceStats = await lstat(source);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      throw new Error("Only regular vault files can be moved to Lattice Trash.");
    }
    const canonicalSource = await realpath(source);
    assertPathWithinRoot(root, canonicalSource);
    const trashDirectory = path.join(root, ".lattice-trash");
    assertPathWithinRoot(root, trashDirectory);
    await mkdir(trashDirectory, { recursive: true });
    const canonicalTrashDirectory = await realpath(trashDirectory);
    assertPathWithinRoot(root, canonicalTrashDirectory);
    const token = randomUUID();
    const trashPath = path.join(
      canonicalTrashDirectory,
      `${Date.now()}-${token}-${path.basename(canonicalSource)}`,
    );
    assertPathWithinRoot(root, trashPath);
    await rename(source, trashPath);
    this.trashedFiles.set(token, {
      vaultRoot: root,
      originalPath: source,
      trashPath,
    });
    return token;
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
