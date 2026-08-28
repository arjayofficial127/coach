import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CanvasPageNode, SaveCanvasPageInput } from "../../shared/contracts";
import {
  createCanvasPageAtomically,
  getCanvasPageFromVault,
  isSafeRelativeVaultPath,
  listCanvasPagesFromVault,
  parseCanvasPage,
  parseSaveCanvasPageInput,
  resolveCanvasFileReference,
  sanitizeCanvasFolder,
  saveCanvasPageAtomically,
} from "./canvas-page";

const roots: string[] = [];

async function vault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "lattice-canvas-test-"));
  roots.push(root);
  await mkdir(path.join(root, ".obsidian"));
  return root;
}

function nodes(): CanvasPageNode[] {
  const noteId = randomUUID();
  return [
    {
      id: noteId,
      type: "text",
      x: 40,
      y: 40,
      width: 320,
      height: 220,
      latticeKind: "note",
      latticeTitle: "Description",
      text: "A Markdown description.",
    },
    {
      id: randomUUID(),
      type: "link",
      x: 400,
      y: 40,
      width: 360,
      height: 240,
      latticeKind: "iframe",
      latticeTitle: "Reference website",
      latticeDescription: "Runs in the isolated native browser view.",
      url: "https://example.com/reference",
    },
    {
      id: randomUUID(),
      type: "text",
      x: 40,
      y: 320,
      width: 420,
      height: 280,
      latticeKind: "links",
      latticeTitle: "Related material",
      text: "Typed links",
      latticeLinks: [
        { id: randomUUID(), label: "This note", kind: "object", target: noteId },
        { id: randomUUID(), label: "Source", kind: "url", target: "https://example.com" },
        { id: randomUUID(), label: "Brief", kind: "document", target: "Files/brief.pdf" },
      ],
    },
  ];
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Obsidian-compatible canvas pages", () => {
  it("creates an atomic JSON Canvas page inside nested folders", async () => {
    const root = await vault();
    const created = await createCanvasPageAtomically(root, {
      title: "Research map",
      description: "A page made of reusable objects.",
      folder: "Projects/Browser",
    });

    const directory = path.join(root, "Lattice Pages", "Projects", "Browser");
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^Research map-[a-f0-9]{8}\.canvas$/);
    expect(files.some((entry) => entry.endsWith(".tmp"))).toBe(false);

    const onDisk = JSON.parse(await readFile(path.join(directory, files[0] ?? ""), "utf8"));
    expect(onDisk.nodes).toEqual([]);
    expect(onDisk.edges).toEqual([]);
    expect(onDisk.lattice).toMatchObject({
      id: created.id,
      version: 1,
      folder: "Projects/Browser",
    });
  });

  it("round-trips standard nodes and Lattice extension metadata", async () => {
    const root = await vault();
    const created = await createCanvasPageAtomically(root, {
      title: "Round trip",
      description: "Before",
      folder: "",
    });
    const nextNodes = nodes();
    const saved = await saveCanvasPageAtomically(root, {
      id: created.id,
      title: "Round trip",
      description: "After",
      nodes: nextNodes,
      edges: [],
    });

    expect(saved.nodeCount).toBe(3);
    expect((await getCanvasPageFromVault(root, created.id)).nodes).toEqual(nextNodes);
    expect(await listCanvasPagesFromVault(root)).toEqual([
      expect.objectContaining({ id: created.id, description: "After", nodeCount: 3 }),
    ]);
  });

  it("ignores unrelated Obsidian canvases without Lattice metadata", async () => {
    const root = await vault();
    const directory = path.join(root, "Lattice Pages");
    await mkdir(directory);
    await writeFile(
      path.join(directory, "ordinary.canvas"),
      JSON.stringify({ nodes: [], edges: [] }),
      "utf8",
    );
    expect(await listCanvasPagesFromVault(root)).toEqual([]);
  });

  it("rejects traversal and excessive nesting in folder and file references", () => {
    expect(() => sanitizeCanvasFolder("Projects/../Secrets")).toThrow(/safe nested levels/);
    expect(() => sanitizeCanvasFolder("1/2/3/4/5/6/7/8/9")).toThrow(/at most 8/);
    expect(isSafeRelativeVaultPath("Files/image.png")).toBe(true);
    expect(isSafeRelativeVaultPath("../image.png")).toBe(false);
    expect(isSafeRelativeVaultPath("C:\\image.png")).toBe(false);
  });

  it("rejects unsafe website targets and duplicate object identifiers", () => {
    const nextNodes = nodes();
    const website = nextNodes.find((node) => node.type === "link");
    if (website?.type !== "link") throw new Error("fixture missing website");
    website.url = "http://example.com";
    expect(() =>
      parseSaveCanvasPageInput({
        id: randomUUID(),
        title: "Unsafe",
        description: "",
        nodes: nextNodes,
        edges: [],
      }),
    ).toThrow();

    const duplicate = nodes();
    const first = duplicate[0];
    const second = duplicate[1];
    if (!first || !second) throw new Error("fixture missing nodes");
    second.id = first.id;
    expect(() =>
      parseSaveCanvasPageInput({
        id: randomUUID(),
        title: "Duplicate",
        description: "",
        nodes: duplicate,
        edges: [],
      }),
    ).toThrow(/unique/);
  });

  it("rejects broken object and edge references", () => {
    const nextNodes = nodes();
    const links = nextNodes.find((node) => node.type === "text" && node.latticeKind === "links");
    if (links?.type !== "text") throw new Error("fixture missing links");
    const objectLink = links.latticeLinks?.find((link) => link.kind === "object");
    if (!objectLink) throw new Error("fixture missing object link");
    objectLink.target = randomUUID();
    const input: SaveCanvasPageInput = {
      id: randomUUID(),
      title: "Broken",
      description: "",
      nodes: nextNodes,
      edges: [],
    };
    expect(() => parseSaveCanvasPageInput(input)).toThrow(/another object/);

    objectLink.target = nextNodes[0]?.id ?? "";
    input.edges = [{ id: randomUUID(), fromNode: nextNodes[0]?.id ?? "", toNode: randomUUID() }];
    expect(() => parseSaveCanvasPageInput(input)).toThrow(/connect objects/);
  });

  it("resolves file links through stable page, node, and link IDs", async () => {
    const root = await vault();
    const created = await createCanvasPageAtomically(root, {
      title: "Files",
      description: "",
      folder: "",
    });
    const nextNodes = nodes();
    await mkdir(path.join(root, "Files"));
    const filePath = path.join(root, "Files", "brief.pdf");
    await writeFile(filePath, "not a real PDF", "utf8");
    await saveCanvasPageAtomically(root, {
      id: created.id,
      title: created.title,
      description: "",
      nodes: nextNodes,
      edges: [],
    });
    const linksNode = nextNodes.find(
      (node) => node.type === "text" && node.latticeKind === "links",
    );
    const fileLink =
      linksNode?.type === "text"
        ? linksNode.latticeLinks?.find((link) => link.kind === "document")
        : undefined;
    if (!linksNode || !fileLink) throw new Error("fixture missing file link");

    expect(
      await resolveCanvasFileReference(root, {
        pageId: created.id,
        nodeId: linksNode.id,
        linkId: fileLink.id,
      }),
    ).toBe(filePath);
  });

  it("parses the public JSON Canvas shape with extension fields", () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const parsed = parseCanvasPage(
      JSON.stringify({
        nodes: [],
        edges: [],
        lattice: {
          version: 1,
          id,
          title: "Portable",
          description: "",
          folder: "",
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    expect(parsed).toMatchObject({ version: 1, id, title: "Portable", nodeCount: 0 });
  });
});
