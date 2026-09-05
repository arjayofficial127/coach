import { describe, expect, it, vi } from "vitest";
import type {
  LatticeApi,
  WorkspaceDirectoryEntry,
  WorkspaceFileDocument,
} from "../shared/contracts";
import {
  acceptSavedDocument,
  insertMarkdown,
  loadWorkspaceIndex,
  noteBody,
  noteReferences,
  renamedWorkspacePath,
  renameWorkspaceTabs,
  resolveNoteReference,
  workspaceErrorMessage,
  workspaceFolderCounts,
  workspaceTitle,
} from "./local-workspace-model";

const file = (relativePath: string): WorkspaceDirectoryEntry => ({
  id: relativePath,
  relativePath,
  name: relativePath.split("/").pop() ?? "",
  kind: "file",
  fileType: "markdown",
  size: 10,
  updatedAt: "2026-09-03T00:00:00.000Z",
});
const document: WorkspaceFileDocument = {
  desktopId: "research",
  relativePath: "Brief.md",
  name: "Brief.md",
  fileType: "markdown",
  content: "old",
  updatedAt: "2026-09-03T00:00:00.000Z",
};
describe("workspace view model", () => {
  it("remaps renamed folders without touching drafts, history, or similarly prefixed siblings", () => {
    const tab = {
      document: { ...document, relativePath: "Notes/Project/Brief.md" },
      draft: "unsaved [[Notes/Project/Link]]",
      history: [{ content: "previous", savedAt: document.updatedAt }],
    };
    const next = renameWorkspaceTabs([tab], "Notes/Project", "Notes/Research")[0]!;
    expect(next.document.relativePath).toBe("Notes/Research/Brief.md");
    expect(next.draft).toBe(tab.draft);
    expect(next.history).toBe(tab.history);
    expect(next.document.updatedAt).toBe(tab.document.updatedAt);
    expect(renamedWorkspacePath("Notes/Projects/Other.md", "Notes/Project", "Notes/Research")).toBe(
      "Notes/Projects/Other.md",
    );
    expect(workspaceTitle("Brief.text")).toBe("Brief");
    expect(workspaceTitle("v1.2", "folder")).toBe("v1.2");
  });
  it("keeps private filesystem paths out of diagnostics while retaining known repair messages", () => {
    const fallback = "Could not save. Your draft is still open.";
    for (const message of [
      "EPERM: rename 'C:\\Private\\Vault\\note.md'",
      "ENOENT: open '/private/vault/note.md'",
      "Error invoking remote method 'workspace:save-file': Error: secret device information",
    ])
      expect(workspaceErrorMessage(new Error(message), fallback)).toBe(fallback);
    const known = "This file changed outside Coach. Reopen it before saving your edits.";
    expect(
      workspaceErrorMessage(
        new Error(`Error invoking remote method 'workspace:save-file': Error: ${known}`),
        fallback,
      ),
    ).toBe(known);
    expect(workspaceErrorMessage(null, fallback)).toBe(fallback);
  });
  it("keeps edits typed while a save was in flight", () => {
    const result = acceptSavedDocument(
      { document, draft: "newer draft", history: [] },
      { ...document, content: "submitted", updatedAt: "2026-09-03T01:00:00.000Z" },
      "submitted",
    );
    expect(result.draft).toBe("newer draft");
    expect(result.document.content).toBe("submitted");
    expect(result.history[0]?.content).toBe("old");
    expect(
      acceptSavedDocument(
        { document, draft: "submitted", history: [] },
        { ...document, content: "submitted" },
        "submitted",
      ).draft,
    ).toBe("submitted");
  });
  it("supports nested relative, root, extensionless and unambiguous note links", () => {
    const entries = [file("Notes/Brief.md"), file("Board.coach"), file("Other/Brief.md")];
    expect(resolveNoteReference("[[bad", "", entries).kind).toBe("missing");
    expect(resolveNoteReference("Brief", "Notes/Source.md", entries)).toEqual({
      kind: "file",
      entry: entries[0],
    });
    expect(resolveNoteReference("../Board.coach", "Notes/Source.md", entries)).toEqual({
      kind: "file",
      entry: entries[1],
    });
    expect(resolveNoteReference("Brief", "Source.md", entries).kind).toBe("ambiguous");
    expect(resolveNoteReference("Notes/Brief.md#Heading", "Source.md", entries).kind).toBe("file");
    expect(resolveNoteReference("https://example.com", "", entries).kind).toBe("url");
    expect(resolveNoteReference("#Heading", "Notes/Source.md", entries).kind).toBe("anchor");
  });
  it.each([
    "file:///C:/private/secret.md",
    "C:\\private\\secret.md",
    "javascript:alert(1)",
    "data:text/html,hello",
    "//server/private",
    "/private",
    "../../outside.md",
    "%2e%2e/%2e%2e/outside",
    ".coach/private",
    "https://user:secret@example.com",
  ])("blocks unsafe target %s", (target) => {
    expect(resolveNoteReference(target, "Notes/Source.md", []).kind).toBe("blocked");
  });
  it("ignores frontmatter and code references, preserves the rest, and inserts selected blocks", () => {
    expect(
      noteReferences(
        '---\nsecret: "[[ignore]]"\n---\n[[Brief|Alias]] [Source](https://example.com) `[[code]]`\n```\n[[code]]\n```',
      ),
    ).toEqual([
      { target: "Brief", label: "Alias" },
      { target: "https://example.com", label: "Source" },
    ]);
    expect(noteBody("---\nkind: note\n---\n# Hello")).toBe("# Hello");
    expect(insertMarkdown("Hello world", 6, 11, "**$selection**")).toEqual({
      content: "Hello **world**",
      cursor: 15,
    });
  });
  it("indexes nested files through the broker and marks skipped oversized documents", async () => {
    const rootFiles = [
      { ...file("Notes"), kind: "folder" as const },
      { ...file("Large.md"), size: 150000 },
    ];
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) => ({
      desktopId: "research",
      desktopName: "Research",
      folderName: "Research",
      relativePath,
      breadcrumbs: [],
      entries: relativePath ? [file("Notes/Brief.md")] : rootFiles,
    }));
    const readFile = vi.fn(async () => ({ ...document, relativePath: "Notes/Brief.md" }));
    const api = { listDirectory, readFile } as unknown as LatticeApi["localWorkspace"];
    const index = await loadWorkspaceIndex(api, "research", new AbortController().signal);
    expect(listDirectory).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(index.entries).toHaveLength(3);
    expect(index.partial).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(loadWorkspaceIndex(api, "other", controller.signal)).rejects.toThrow("cancelled");
  });
  it("reports direct and recursive file and folder counts independently", () => {
    const folder = (relativePath: string): WorkspaceDirectoryEntry => ({
      ...file(relativePath),
      kind: "folder",
      fileType: "other",
      size: 0,
    });
    const inbox = folder("Inbox");
    const project = folder("Inbox/Project");
    const archive = folder("Inbox/Project/Archive");
    const index = {
      directories: {
        "": {
          desktopId: "research",
          desktopName: "Research",
          folderName: "Research",
          relativePath: "",
          breadcrumbs: [],
          entries: [inbox],
        },
        Inbox: {
          desktopId: "research",
          desktopName: "Research",
          folderName: "Research",
          relativePath: "Inbox",
          breadcrumbs: [],
          entries: [file("Inbox/Direct.md"), file("Inbox/image.png"), project],
        },
        "Inbox/Project": {
          desktopId: "research",
          desktopName: "Research",
          folderName: "Research",
          relativePath: "Inbox/Project",
          breadcrumbs: [],
          entries: [file("Inbox/Project/Nested.text"), archive],
        },
        "Inbox/Project/Archive": {
          desktopId: "research",
          desktopName: "Research",
          folderName: "Research",
          relativePath: "Inbox/Project/Archive",
          breadcrumbs: [],
          entries: [file("Inbox/Project/Archive/Old.coach")],
        },
      },
      entries: [
        inbox,
        file("Inbox/Direct.md"),
        file("Inbox/image.png"),
        project,
        file("Inbox/Project/Nested.text"),
        archive,
        file("Inbox/Project/Archive/Old.coach"),
      ],
      documents: {},
      partial: false,
    };

    expect(workspaceFolderCounts(index, "Inbox")).toEqual({
      directFiles: 2,
      totalFiles: 4,
      directFolders: 1,
      totalFolders: 2,
      directComplete: true,
      totalComplete: true,
    });
    const { "Inbox/Project/Archive": _missing, ...incompleteDirectories } = index.directories;
    expect(
      workspaceFolderCounts({ ...index, directories: incompleteDirectories }, "Inbox")
        .totalComplete,
    ).toBe(false);
  });
});
