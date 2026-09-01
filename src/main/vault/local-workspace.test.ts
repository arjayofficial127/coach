import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureLocalInboxNote, syncLocalWorkspace } from "./local-workspace";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

describe("Coach local workspace", () => {
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
});
