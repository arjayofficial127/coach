import { readdir, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { VaultService } from "./vault-service";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("recoverable vault trash", () => {
  it("moves a saved Markdown capture to trash and restores it", async () => {
    const vault = new VaultService();
    const info = await vault.createDisposable();
    temporaryRoots.push(info.displayPath);
    const saved = await vault.saveProbeNote({
      title: "Recoverable link",
      url: "https://example.com/recover",
      description: "Keep the original Markdown recoverable.",
    });

    const trashed = await vault.trashSavedLink(saved.id);
    expect(trashed).toMatchObject({ kind: "saved-link", title: "Recoverable link" });
    await expect(vault.listSavedLinks()).resolves.toEqual([]);
    await expect(readdir(`${info.displayPath}/.lattice-trash`)).resolves.toHaveLength(1);

    await vault.restoreTrash(trashed.token);
    await expect(vault.listSavedLinks()).resolves.toEqual([
      expect.objectContaining({ id: saved.id, title: "Recoverable link" }),
    ]);
  });

  it("moves an Obsidian Canvas page to trash and restores it", async () => {
    const vault = new VaultService();
    const info = await vault.createDisposable();
    temporaryRoots.push(info.displayPath);
    const page = await vault.createCanvasPage({
      title: "Recoverable canvas",
      description: "A whole local page.",
      folder: "Projects",
    });

    const trashed = await vault.trashCanvasPage(page.id);
    expect(trashed).toMatchObject({ kind: "canvas-page", title: "Recoverable canvas" });
    await expect(vault.listCanvasPages()).resolves.toEqual([]);

    await vault.restoreTrash(trashed.token);
    await expect(vault.getCanvasPage(page.id)).resolves.toMatchObject({ id: page.id });
  });
});
