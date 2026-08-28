import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPathWithinRoot,
  publishNewFileAtomically,
  renderProbeMarkdown,
  sanitizeFileComponent,
  saveProbeNoteAtomically,
} from "./atomic-note";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("atomic Obsidian note writer", () => {
  it("creates a complete Markdown note and leaves no temporary files", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-vault-test-"));
    temporaryRoots.push(vault);
    const result = await saveProbeNoteAtomically(vault, {
      title: "Architecture: calm / safe",
      url: "https://example.com/article?source=test",
      description: "Captured safely.",
    });

    const markdown = await readFile(result.absolutePath, "utf8");
    const entries = await readdir(path.dirname(result.absolutePath));
    expect(markdown).toContain('type: "saved-link"');
    expect(markdown).toContain('url: "https://example.com/article?source=test"');
    expect(markdown.endsWith("\n")).toBe(true);
    expect(entries.some((entry) => entry.endsWith(".tmp"))).toBe(false);
    expect(result.relativePath.startsWith(`Saved Links${path.sep}`)).toBe(true);
  });

  it("writes into a sanitized desktop folder", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-folder-test-"));
    temporaryRoots.push(vault);
    const result = await saveProbeNoteAtomically(vault, {
      title: "Folder-aware capture",
      url: "https://example.com/folder",
      description: "Organized by desktop.",
      folder: "Build / Ideas",
    });

    expect(result.folder).toBe("Build Ideas");
    expect(result.relativePath).toContain(`${path.join("Saved Links", "Build Ideas")}${path.sep}`);
    await expect(readFile(result.absolutePath, "utf8")).resolves.toContain('folder: "Build Ideas"');
  });

  it("captures reading-queue state in portable frontmatter", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-queue-capture-test-"));
    temporaryRoots.push(vault);
    const result = await saveProbeNoteAtomically(vault, {
      title: "Read this later",
      url: "https://example.com/queued",
      description: "Queued during capture.",
      readingStatus: "queued",
    });

    const markdown = await readFile(result.absolutePath, "utf8");
    expect(result.readingStatus).toBe("queued");
    expect(result.queuedAt).toBe(result.savedAt);
    expect(markdown).toContain('reading_status: "queued"');
    expect(markdown).toContain(`queued_at: "${result.savedAt}"`);
  });

  it("uses a safe fallback for Windows device names", () => {
    expect(sanitizeFileComponent("CON")).toBe("saved-page");
    expect(sanitizeFileComponent('a<b>:c"d/e\\f|g?h*')).toBe("a b c d e f g h");
  });

  it("rejects paths outside the vault", () => {
    const vault = path.resolve("C:/vault");
    expect(() => assertPathWithinRoot(vault, path.resolve("C:/elsewhere/note.md"))).toThrow(
      "escapes",
    );
  });

  it("never replaces a pre-existing final file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "lattice-publish-test-"));
    temporaryRoots.push(directory);
    const temporaryPath = path.join(directory, "note.tmp");
    const finalPath = path.join(directory, "note.md");
    await writeFile(temporaryPath, "new bytes", "utf8");
    await writeFile(finalPath, "existing bytes", "utf8");

    await expect(publishNewFileAtomically(temporaryPath, finalPath)).rejects.toMatchObject({
      code: "EEXIST",
    });
    await expect(readFile(finalPath, "utf8")).resolves.toBe("existing bytes");
  });

  it("serializes frontmatter values as escaped YAML strings", () => {
    const markdown = renderProbeMarkdown(
      {
        title: 'Quoted "title"\nsecond line',
        url: "https://example.com",
        description: "description: with YAML syntax",
      },
      "id-1",
      "2026-08-28T00:00:00.000Z",
    );
    expect(markdown).toContain('title: "Quoted \\"title\\"\\nsecond line"');
    expect(markdown).toContain('description: "description: with YAML syntax"');
  });
});
