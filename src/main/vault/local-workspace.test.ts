import { mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newCoachBoard } from "../../shared/coach-board";
import * as atomicNote from "./atomic-note";
import {
  captureLocalInboxNote,
  createWorkspaceEntry,
  listWorkspaceDirectory,
  readWorkspaceFile,
  saveWorkspaceFile,
  syncLocalWorkspace,
} from "./local-workspace";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

describe("Coach local workspace", () => {
  it("uses the shared Windows lock-retry replacement for metadata and editor saves", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "coach-replacement-gate-"));
    roots.push(root);
    const replace = vi.spyOn(atomicNote, "replaceFileAtomically");
    try {
      await syncLocalWorkspace(root, [{ id: "research", name: "Research" }]);
      await createWorkspaceEntry(root, {
        desktopId: "research",
        parentPath: "",
        name: "Brief",
        kind: "file",
        fileType: "markdown",
      });
      const document = await readWorkspaceFile(root, {
        desktopId: "research",
        relativePath: "Brief.md",
      });
      await saveWorkspaceFile(root, {
        desktopId: "research",
        relativePath: "Brief.md",
        content: "# Saved",
        expectedUpdatedAt: document.updatedAt,
      });
      expect(replace).toHaveBeenCalledTimes(2);
      expect(replace.mock.calls[0]?.[1]).toBe(path.join(root, ".coach", "workspace.json"));
      expect(replace.mock.calls[1]?.[1]).toBe(
        path.join(root, "Desktops", "Research-research", "Brief.md"),
      );
    } finally {
      replace.mockRestore();
    }
  });
  it("creates visual boards, validates saves, detects external edits and refuses folder junctions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "coach-board-gate-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "coach-board-outside-"));
    roots.push(root, outside);
    await syncLocalWorkspace(root, [{ id: "research", name: "Research" }]);
    await createWorkspaceEntry(root, {
      desktopId: "research",
      parentPath: "",
      name: "Launch",
      kind: "file",
      fileType: "coach",
      coachKind: "board",
    });
    const board = await readWorkspaceFile(root, {
      desktopId: "research",
      relativePath: "Launch.coach",
    });
    expect(JSON.parse(board.content)).toEqual(newCoachBoard("Launch"));
    const content = {
      ...newCoachBoard("Launch"),
      custom: "kept",
      cards: [
        {
          id: "task",
          title: "Review",
          columnId: "doing",
          note: "Notes/Brief.md",
          dueDate: "2026-09-03",
        },
      ],
    };
    const saved = await saveWorkspaceFile(root, {
      desktopId: "research",
      relativePath: board.relativePath,
      expectedUpdatedAt: board.updatedAt,
      content: JSON.stringify(content),
    });
    expect(JSON.parse(saved.content)).toEqual(content);
    await expect(
      saveWorkspaceFile(root, {
        desktopId: "research",
        relativePath: board.relativePath,
        expectedUpdatedAt: saved.updatedAt,
        content: JSON.stringify({
          ...content,
          cards: [{ ...content.cards[0], columnId: "unknown" }],
        }),
      }),
    ).rejects.toThrow("invalid columns");
    const diskFile = path.join(root, "Desktops", "Research-research", "Launch.coach");
    await writeFile(diskFile, JSON.stringify({ ...content, title: "External edit" }));
    await utimes(diskFile, new Date(), new Date(Date.now() + 2000));
    await expect(
      saveWorkspaceFile(root, {
        desktopId: "research",
        relativePath: board.relativePath,
        expectedUpdatedAt: saved.updatedAt,
        content: saved.content,
      }),
    ).rejects.toThrow("changed outside");
    expect(await readFile(diskFile, "utf8")).toContain("External edit");
    const link = path.join(root, "Desktops", "Research-research", "Escape");
    await symlink(outside, link, "junction");
    await expect(
      createWorkspaceEntry(root, {
        desktopId: "research",
        parentPath: "Escape",
        name: "Unsafe",
        kind: "file",
        fileType: "markdown",
      }),
    ).rejects.toThrow("Linked workspace items");
    expect(await readdir(outside)).toEqual([]);
    expect(
      JSON.stringify(
        await listWorkspaceDirectory(root, { desktopId: "research", relativePath: "" }),
      ),
    ).not.toContain(root);
    // Remove only this test-created junction before recursive fixture cleanup.
    await rm(link);
  });
  it("creates stable desktop folders, .coach metadata, and a Markdown Inbox", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "coach-local-workspace-"));
    roots.push(root);
    const desktops = [{ id: "clinigen", name: "Clinigen, Enables" }];
    const initial = await syncLocalWorkspace(root, desktops);
    const desktop = initial.desktops[0];
    expect(desktop?.folderName).toBe("Clinigen, Enables-clinigen");
    expect(await readdir(path.join(root, "Desktops", desktop?.folderName ?? ""))).toEqual([
      "Files",
      "Inbox",
      "Notes",
      "Planner",
    ]);
    expect(JSON.parse(await readFile(path.join(root, ".coach", "workspace.json"), "utf8"))).toEqual(
      {
        version: 1,
        desktops: [{ id: "clinigen", name: "Clinigen, Enables", folderName: desktop?.folderName }],
      },
    );

    await captureLocalInboxNote(root, {
      desktopId: "clinigen",
      title: "Review launch plan",
      content: "Clarify the next action.",
      kind: "note",
    });
    const refreshed = await syncLocalWorkspace(root, [{ id: "clinigen", name: "Client work" }]);
    expect(refreshed.desktops[0]).toMatchObject({
      desktopName: "Client work",
      folderName: desktop?.folderName,
      inboxCount: 1,
      fileCount: 1,
    });
    const inboxFiles = await readdir(
      path.join(root, "Desktops", desktop?.folderName ?? "", "Inbox"),
    );
    const markdown = await readFile(
      path.join(root, "Desktops", desktop?.folderName ?? "", "Inbox", inboxFiles[0] ?? ""),
      "utf8",
    );
    expect(markdown).toContain('coach_type: "inbox-item"');
    expect(markdown).toContain("Clarify the next action.");
    expect(JSON.stringify(refreshed)).not.toContain(root);
  });

  it("navigates nested folders and atomically edits supported Coach files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "coach-local-workspace-"));
    roots.push(root);
    await syncLocalWorkspace(root, [{ id: "clinigen", name: "Clinigen, Enables" }]);

    await createWorkspaceEntry(root, {
      desktopId: "clinigen",
      parentPath: "Notes",
      name: "Projects",
      kind: "folder",
    });
    await createWorkspaceEntry(root, {
      desktopId: "clinigen",
      parentPath: "Notes/Projects",
      name: "Launch brief",
      kind: "file",
      fileType: "markdown",
    });
    await createWorkspaceEntry(root, {
      desktopId: "clinigen",
      parentPath: "Notes/Projects",
      name: "Control room.coach",
      kind: "file",
      fileType: "coach",
    });

    const listing = await listWorkspaceDirectory(root, {
      desktopId: "clinigen",
      relativePath: "Notes/Projects",
    });
    expect(listing.breadcrumbs.map((item) => item.name)).toEqual([
      "Clinigen, Enables",
      "Notes",
      "Projects",
    ]);
    expect(listing.entries.map((item) => [item.name, item.fileType])).toEqual([
      ["Control room.coach", "coach"],
      ["Launch brief.md", "markdown"],
    ]);
    expect(JSON.stringify(listing)).not.toContain(root);

    const markdown = await readWorkspaceFile(root, {
      desktopId: "clinigen",
      relativePath: "Notes/Projects/Launch brief.md",
    });
    const saved = await saveWorkspaceFile(root, {
      desktopId: "clinigen",
      relativePath: markdown.relativePath,
      expectedUpdatedAt: markdown.updatedAt,
      content: "# Launch brief\n\nShip the interactive editor.\n",
    });
    expect(saved.content).toContain("interactive editor");

    const coach = await readWorkspaceFile(root, {
      desktopId: "clinigen",
      relativePath: "Notes/Projects/Control room.coach",
    });
    expect(JSON.parse(coach.content)).toMatchObject({ version: 1, kind: "document" });
    await expect(
      saveWorkspaceFile(root, {
        desktopId: "clinigen",
        relativePath: coach.relativePath,
        expectedUpdatedAt: coach.updatedAt,
        content: "not json",
      }),
    ).rejects.toThrow("valid JSON");
    const planner = await saveWorkspaceFile(root, {
      desktopId: "clinigen",
      relativePath: coach.relativePath,
      expectedUpdatedAt: coach.updatedAt,
      content: `${JSON.stringify({ version: 1, kind: "planner", columns: ["Now", "Next"] }, null, 2)}\n`,
    });
    expect(JSON.parse(planner.content)).toEqual({
      version: 1,
      kind: "planner",
      columns: ["Now", "Next"],
    });
    await writeFile(
      path.join(root, "Desktops", "Clinigen, Enables-clinigen", planner.relativePath),
      "{ needs repair",
      "utf8",
    );
    const repairable = await readWorkspaceFile(root, {
      desktopId: "clinigen",
      relativePath: planner.relativePath,
    });
    expect(repairable.content).toBe("{ needs repair");
    await expect(
      listWorkspaceDirectory(root, { desktopId: "clinigen", relativePath: "../outside" }),
    ).rejects.toThrow("not allowed");
  });
});
