import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CanvasPageRecord, SavedLinkRecord } from "../../shared/contracts";
import { buildVaultReferenceIndex } from "./reference-index";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

function saved(id: string, title: string, url: string): SavedLinkRecord {
  return {
    id,
    title,
    url,
    description: "",
    savedAt: "2026-08-29T00:00:00.000Z",
    folder: "",
    desktopId: "",
    readingStatus: "saved",
    queuedAt: "",
    readAt: "",
    relativePath: `Saved Links/${title}.md`,
  };
}

describe("vault reference index", () => {
  it("indexes every reference kind, backlinks, and explicit unresolved diagnostics without paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lattice-reference-index-"));
    roots.push(root);
    await mkdir(path.join(root, "Files"));
    await writeFile(path.join(root, "Files", "paper.pdf"), "paper");
    const childId = "22222222-2222-4222-8222-222222222222";
    const parent: CanvasPageRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      title: "Research map",
      description: "",
      folder: "",
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
      nodeCount: 2,
      edges: [],
      nodes: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          type: "text",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          latticeKind: "links",
          latticeTitle: "Connections",
          text: "",
          latticeLinks: [
            { id: "p", label: "Child", kind: "page", target: childId },
            {
              id: "o",
              label: "Object",
              kind: "object",
              target: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            },
            { id: "u", label: "Site", kind: "url", target: "https://example.com/topic#part" },
            { id: "d", label: "Paper", kind: "document", target: "Files/paper.pdf" },
            { id: "i", label: "Missing image", kind: "image", target: "Images/missing.png" },
            { id: "f", label: "Unsafe", kind: "file", target: "../secret.txt" },
          ],
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          type: "text",
          x: 320,
          y: 0,
          width: 300,
          height: 200,
          latticeKind: "note",
          latticeTitle: "Finding",
          text: "Text",
        },
      ],
    };
    const child = { ...parent, id: childId, title: "Child", nodeCount: 0, nodes: [] };
    const index = await buildVaultReferenceIndex(
      root,
      [saved("33333333-3333-4333-8333-333333333333", "Example", "https://example.com/topic")],
      [parent, child],
      "2026-08-29T01:00:00.000Z",
    );
    expect(new Set(index.entries.map((entry) => entry.kind))).toEqual(
      new Set(["page", "object", "url", "document", "image", "file"]),
    );
    expect(index.entries.find((entry) => entry.label === "Child")?.targetKey).toBe(
      `page:${childId}`,
    );
    expect(index.entries.find((entry) => entry.label === "Paper")?.status).toBe("resolved");
    expect(index.entries.find((entry) => entry.label === "Missing image")?.repairHint).toMatch(
      /Restore/,
    );
    expect(index.unresolvedCount).toBe(2);
    expect(JSON.stringify(index)).not.toContain(root);
    expect(JSON.stringify(index)).not.toContain("../secret.txt");
  });
});
