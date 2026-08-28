import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveProbeNoteAtomically } from "./atomic-note";
import { updateSavedLinkMetadataAtomically } from "./saved-link-metadata";
import { parseSavedLinkMarkdown } from "./saved-link-reader";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("atomic saved-link metadata updater", () => {
  it("updates frontmatter while preserving identity, path, state, and body", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-metadata-test-"));
    temporaryRoots.push(vault);
    const note = await saveProbeNoteAtomically(vault, {
      title: "Original title",
      url: "https://example.com/metadata",
      description: "Original description.",
      folder: "Research",
      desktopId: "research",
      readingStatus: "queued",
    });
    const before = await readFile(note.absolutePath, "utf8");
    const body = before.slice(before.indexOf("\n---\n", 4) + 5);

    await updateSavedLinkMetadataAtomically(
      vault,
      note.relativePath,
      note.id,
      "  Edited   title  ",
      "Edited description: safe YAML.",
    );

    const after = await readFile(note.absolutePath, "utf8");
    const parsed = parseSavedLinkMarkdown(after, note.relativePath, "Research");
    expect(parsed).toEqual(
      expect.objectContaining({
        id: note.id,
        title: "Edited title",
        description: "Edited description: safe YAML.",
        url: note.url,
        desktopId: "research",
        readingStatus: "queued",
      }),
    );
    expect(after.slice(after.indexOf("\n---\n", 4) + 5)).toBe(body);
    expect(
      (await readdir(path.dirname(note.absolutePath))).some((entry) => entry.endsWith(".tmp")),
    ).toBe(false);
  });

  it("refuses a stale ID and invalid metadata without changing the note", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-metadata-id-test-"));
    temporaryRoots.push(vault);
    const note = await saveProbeNoteAtomically(vault, {
      title: "Identity check",
      url: "https://example.com/id",
      description: "Keep me unchanged.",
    });
    const before = await readFile(note.absolutePath, "utf8");

    await expect(
      updateSavedLinkMetadataAtomically(
        vault,
        note.relativePath,
        crypto.randomUUID(),
        "Edited",
        "No",
      ),
    ).rejects.toThrow("no longer matches");
    await expect(
      updateSavedLinkMetadataAtomically(vault, note.relativePath, note.id, "   ", "No"),
    ).rejects.toThrow("outside the supported limits");
    await expect(readFile(note.absolutePath, "utf8")).resolves.toBe(before);
  });
});
