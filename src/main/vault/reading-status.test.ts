import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveProbeNoteAtomically } from "./atomic-note";
import { updateReadingStatusAtomically } from "./reading-status";
import { parseSavedLinkMarkdown } from "./saved-link-reader";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("atomic reading-status updater", () => {
  it("queues and completes a note while preserving its body", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-reading-status-test-"));
    temporaryRoots.push(vault);
    const note = await saveProbeNoteAtomically(vault, {
      title: "Durable queue item",
      url: "https://example.com/read-later",
      description: "Keep this exact body.",
      folder: "Research",
    });

    const queuedAt = "2026-08-28T01:00:00.000Z";
    await updateReadingStatusAtomically(vault, note.relativePath, note.id, "queued", queuedAt);
    const queuedMarkdown = await readFile(note.absolutePath, "utf8");
    expect(queuedMarkdown).toContain('reading_status: "queued"');
    expect(queuedMarkdown).toContain(`queued_at: "${queuedAt}"`);
    expect(queuedMarkdown).toContain("Keep this exact body.");

    const readAt = "2026-08-28T02:00:00.000Z";
    await updateReadingStatusAtomically(vault, note.relativePath, note.id, "read", readAt);
    const readMarkdown = await readFile(note.absolutePath, "utf8");
    const parsed = parseSavedLinkMarkdown(readMarkdown, note.relativePath, "Research");
    expect(parsed).toEqual(
      expect.objectContaining({
        id: note.id,
        readingStatus: "read",
        queuedAt,
        readAt,
      }),
    );
    expect(
      (await readdir(path.dirname(note.absolutePath))).some((entry) => entry.endsWith(".tmp")),
    ).toBe(false);
  });

  it("refuses to update a note whose stable ID changed", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-reading-id-test-"));
    temporaryRoots.push(vault);
    const note = await saveProbeNoteAtomically(vault, {
      title: "Identity check",
      url: "https://example.com/id",
      description: "Do not mutate the wrong note.",
    });

    await expect(
      updateReadingStatusAtomically(vault, note.relativePath, crypto.randomUUID(), "queued"),
    ).rejects.toThrow("no longer matches");
    await expect(readFile(note.absolutePath, "utf8")).resolves.toContain('reading_status: "saved"');
  });
});
