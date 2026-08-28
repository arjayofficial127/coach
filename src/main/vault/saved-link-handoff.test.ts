import { copyFile, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveProbeNoteAtomically } from "./atomic-note";
import { buildObsidianOpenUri, resolveSavedLinkHandoff } from "./saved-link-handoff";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("saved-link Obsidian handoff", () => {
  it("resolves a unique stable ID to an encoded absolute Obsidian path", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-handoff-test-"));
    temporaryRoots.push(vault);
    const note = await saveProbeNoteAtomically(vault, {
      title: "URI & path proof",
      url: "https://example.com/handoff",
      description: "Open the exact existing note.",
      folder: "Research notes",
    });

    const handoff = await resolveSavedLinkHandoff(vault, note.id);
    expect(handoff.absolutePath).toBe(await realpath(note.absolutePath));
    expect(handoff.obsidianUri.startsWith("obsidian://open?path=")).toBe(true);
    expect(new URL(handoff.obsidianUri).searchParams.get("path")).toBe(
      handoff.absolutePath.split(path.sep).join("/"),
    );
  });

  it("rejects relative paths, missing IDs, and duplicate stable IDs", async () => {
    expect(() => buildObsidianOpenUri("Saved Links/note.md")).toThrow("absolute");

    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-handoff-id-test-"));
    temporaryRoots.push(vault);
    const note = await saveProbeNoteAtomically(vault, {
      title: "Identity check",
      url: "https://example.com/id",
      description: "Reject ambiguity.",
      folder: "Research",
    });
    await expect(resolveSavedLinkHandoff(vault, crypto.randomUUID())).rejects.toThrow(
      "not be found",
    );

    const duplicatePath = path.join(path.dirname(note.absolutePath), `duplicate-${note.id}.md`);
    await copyFile(note.absolutePath, duplicatePath);
    await expect(resolveSavedLinkHandoff(vault, note.id)).rejects.toThrow("Duplicate");
  });
});
