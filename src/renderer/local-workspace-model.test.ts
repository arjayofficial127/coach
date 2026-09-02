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
  resolveNoteReference,
  workspaceErrorMessage,
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
});
