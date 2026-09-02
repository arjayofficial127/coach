import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as atomic from "./atomic-note";
import {
  captureLocalInboxNote,
  listWorkspaceDirectory,
  readWorkspaceFile,
  renameWorkspaceEntry,
  saveWorkspaceFile,
  syncLocalWorkspace,
} from "./local-workspace";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "coach-rename-"));
  roots.push(root);
  const snapshot = await syncLocalWorkspace(root, [{ id: "work", name: "Work" }]);
  return { root, desktop: path.join(root, "Desktops", snapshot.desktops[0]!.folderName) };
}
async function input(root: string, relativePath: string, newName: string) {
  const parent = relativePath.split("/").slice(0, -1).join("/");
  const listing = await listWorkspaceDirectory(root, { desktopId: "work", relativePath: parent });
  const entry = listing.entries.find((item) => item.relativePath === relativePath)!;
  return {
    desktopId: "work",
    relativePath,
    newName,
    kind: entry.kind,
    expectedUpdatedAt: entry.updatedAt,
  };
}
describe("explicit workspace title changes", () => {
  it("renames a file exclusively, preserves its bytes and revision, and saves at the new name", async () => {
    const { root, desktop } = await fixture();
    const content = "# Original title\r\n[[Other.md]]\r\n";
    await writeFile(path.join(desktop, "Brief.md"), content);
    const before = await readWorkspaceFile(root, { desktopId: "work", relativePath: "Brief.md" });
    const renamed = await renameWorkspaceEntry(root, await input(root, "Brief.md", "Renamed.md"));
    expect(renamed).toEqual({
      fromPath: "Brief.md",
      toPath: "Renamed.md",
      name: "Renamed.md",
      kind: "file",
    });
    expect(await readFile(path.join(desktop, "Renamed.md"), "utf8")).toBe(content);
    expect(await readdir(desktop)).not.toContain("Brief.md");
    const saved = await saveWorkspaceFile(root, {
      desktopId: "work",
      relativePath: renamed.toPath,
      expectedUpdatedAt: before.updatedAt,
      content: "explicitly saved draft",
    });
    expect(saved.content).toBe("explicitly saved draft");
    expect(JSON.stringify(renamed)).not.toContain(root);
  });
  it.each(["../escape.md", "Bad/name.md", ".hidden.md", "CON.md", "Bad?.md", "bad.md."])(
    "rejects unsafe new name %s without changing the source",
    async (newName) => {
      const { root, desktop } = await fixture();
      await writeFile(path.join(desktop, "Brief.md"), "keep");
      await expect(
        renameWorkspaceEntry(root, await input(root, "Brief.md", newName)),
      ).rejects.toThrow();
      expect(await readFile(path.join(desktop, "Brief.md"), "utf8")).toBe("keep");
    },
  );
  it("rejects file-type changes, occupied destinations, stale sources, and desktop-root renames", async () => {
    const { root, desktop } = await fixture();
    await writeFile(path.join(desktop, "Brief.text"), "first");
    await writeFile(path.join(desktop, "Taken.text"), "second");
    const request = await input(root, "Brief.text", "Taken.text");
    await expect(renameWorkspaceEntry(root, request)).rejects.toThrow("already exists");
    await expect(renameWorkspaceEntry(root, { ...request, newName: "Bad.md" })).rejects.toThrow(
      "extension",
    );
    await utimes(path.join(desktop, "Brief.text"), new Date(), new Date(Date.now() + 2000));
    await expect(renameWorkspaceEntry(root, { ...request, newName: "Fresh.text" })).rejects.toThrow(
      "changed outside",
    );
    await expect(
      renameWorkspaceEntry(root, { ...request, relativePath: "", kind: "folder" }),
    ).rejects.toThrow("sidebar");
    expect(await readFile(path.join(desktop, "Taken.text"), "utf8")).toBe("second");
  });
  it("serializes competing renames without replacing either file", async () => {
    const { root, desktop } = await fixture();
    await writeFile(path.join(desktop, "One.text"), "one");
    await writeFile(path.join(desktop, "Two.text"), "two");
    const first = await input(root, "One.text", "Same.text");
    const second = await input(root, "Two.text", "Same.text");
    const results = await Promise.allSettled([
      renameWorkspaceEntry(root, first),
      renameWorkspaceEntry(root, second),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const content = await readFile(path.join(desktop, "Same.text"), "utf8");
    expect(["one", "two"]).toContain(content);
    expect(
      await readFile(path.join(desktop, content === "one" ? "Two.text" : "One.text"), "utf8"),
    ).toBe(content === "one" ? "two" : "one");
  });
  it.skipIf(process.platform !== "win32")(
    "renames nested folders and case-only titles without touching content",
    async () => {
      const { root, desktop } = await fixture();
      await mkdir(path.join(desktop, "Notes", "Project", "Deep"), { recursive: true });
      const bytes = Buffer.from([0, 1, 2, 254, 255]);
      await writeFile(path.join(desktop, "Notes", "Project", "Deep", "image.bin"), bytes);
      await renameWorkspaceEntry(root, await input(root, "Notes/Project", "Research"));
      expect(await readFile(path.join(desktop, "Notes", "Research", "Deep", "image.bin"))).toEqual(
        bytes,
      );
      await renameWorkspaceEntry(root, await input(root, "Notes/Research", "RESEARCH"));
      expect(await readdir(path.join(desktop, "Notes"))).toContain("RESEARCH");
      await writeFile(path.join(desktop, "Case.md"), "case unchanged");
      await renameWorkspaceEntry(root, await input(root, "Case.md", "CASE.md"));
      expect(await readdir(desktop)).toContain("CASE.md");
    },
  );
  it.skipIf(process.platform !== "win32")(
    "keeps renamed Inbox roles across refresh and subsequent captures",
    async () => {
      const { root, desktop } = await fixture();
      await captureLocalInboxNote(root, {
        desktopId: "work",
        title: "Before",
        content: "keep before",
        kind: "note",
      });
      await renameWorkspaceEntry(root, await input(root, "Inbox", "Incoming"));
      await syncLocalWorkspace(root, [{ id: "work", name: "Work renamed" }]);
      await captureLocalInboxNote(root, {
        desktopId: "work",
        title: "After",
        content: "keep after",
        kind: "note",
      });
      const snapshot = await syncLocalWorkspace(root, [{ id: "work", name: "Work renamed" }]);
      expect(snapshot.desktops[0]?.inboxCount).toBe(2);
      expect(await readdir(desktop)).not.toContain("Inbox");
      expect(await readdir(path.join(desktop, "Incoming"))).toHaveLength(2);
      const listing = await listWorkspaceDirectory(root, { desktopId: "work", relativePath: "" });
      expect(listing.areaFolders?.Inbox).toBe("Incoming");
      expect(JSON.stringify(listing)).not.toContain(root);
    },
  );
  it.skipIf(process.platform !== "win32")(
    "restores an area's original folder name when its metadata write fails",
    async () => {
      const { root, desktop } = await fixture();
      const request = await input(root, "Inbox", "Incoming");
      vi.spyOn(atomic, "replaceFileAtomically").mockRejectedValueOnce(
        new Error("test write failure"),
      );
      await expect(renameWorkspaceEntry(root, request)).rejects.toThrow(
        "original name was restored",
      );
      expect(await readdir(desktop)).toContain("Inbox");
      expect(await readdir(desktop)).not.toContain("Incoming");
    },
  );
  it.skipIf(process.platform !== "win32")(
    "refuses junction sources and private error paths",
    async () => {
      const { root, desktop } = await fixture();
      const outside = await mkdtemp(path.join(os.tmpdir(), "coach-rename-outside-"));
      roots.push(outside);
      const shortcut = path.join(desktop, "Linked");
      await symlink(outside, shortcut, "junction");
      try {
        await expect(
          renameWorkspaceEntry(root, {
            desktopId: "work",
            relativePath: "Linked",
            kind: "folder",
            newName: "Elsewhere",
            expectedUpdatedAt: (await stat(shortcut)).mtime.toISOString(),
          }),
        ).rejects.toThrow("Linked workspace");
        const missing = await renameWorkspaceEntry(root, {
          desktopId: "work",
          relativePath: "Missing.md",
          kind: "file",
          newName: "Gone.md",
          expectedUpdatedAt: new Date().toISOString(),
        }).catch((error: Error) => error.message);
        expect(missing).not.toContain(root);
        expect(await readdir(outside)).toEqual([]);
      } finally {
        await rm(shortcut);
      }
    },
  );
});
