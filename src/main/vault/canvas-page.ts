import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  CanvasPageRecord,
  CanvasPageSummary,
  CanvasTypedLink,
  CreateCanvasPageInput,
  RevealCanvasReferenceInput,
  SaveCanvasPageInput,
} from "../../shared/contracts";
import {
  assertPathWithinRoot,
  publishNewFileAtomically,
  replaceFileAtomically,
  sanitizeFileComponent,
} from "./atomic-note";

const CANVAS_DIRECTORY = "Lattice Pages";
const MAX_CANVAS_BYTES = 2_000_000;
const MAX_CANVAS_PAGES = 500;
const MAX_FOLDER_DEPTH = 8;

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const relativeFileSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_024)
  .refine(isSafeRelativeVaultPath, "File references must remain inside the selected vault.");

const typedLinkSchema = z
  .object({
    id: uuidSchema,
    label: z.string().trim().min(1).max(200),
    kind: z.enum(["page", "object", "url", "document", "image", "file"]),
    target: z.string().trim().min(1).max(2_048),
  })
  .strict()
  .superRefine((link, context) => {
    if (link.kind === "page" || link.kind === "object") {
      if (!uuidSchema.safeParse(link.target).success) {
        context.addIssue({
          code: "custom",
          path: ["target"],
          message: "Use a stable UUID target.",
        });
      }
      return;
    }
    if (link.kind === "url") {
      try {
        if (new URL(link.target).protocol !== "https:") throw new Error("unsafe");
      } catch {
        context.addIssue({
          code: "custom",
          path: ["target"],
          message: "Website references must use HTTPS.",
        });
      }
      return;
    }
    if (!relativeFileSchema.safeParse(link.target).success) {
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "File references must remain inside the selected vault.",
      });
    }
  });

const baseNodeShape = {
  id: uuidSchema,
  x: z.number().int().min(-100_000).max(100_000),
  y: z.number().int().min(-100_000).max(100_000),
  width: z.number().int().min(160).max(1_600),
  height: z.number().int().min(120).max(1_600),
  color: z.string().trim().min(1).max(40).optional(),
};

const textNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("text"),
    text: z.string().max(20_000),
    latticeKind: z.enum(["note", "links"]),
    latticeTitle: z.string().trim().min(1).max(200),
    latticeLinks: z.array(typedLinkSchema).max(100).optional(),
  })
  .strict()
  .superRefine((node, context) => {
    if (node.latticeKind === "links" && !node.latticeLinks) {
      context.addIssue({
        code: "custom",
        path: ["latticeLinks"],
        message: "A links object needs a link list.",
      });
    }
    if (node.latticeKind === "note" && node.latticeLinks) {
      context.addIssue({
        code: "custom",
        path: ["latticeLinks"],
        message: "Notes cannot contain typed links.",
      });
    }
  });

const websiteNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("link"),
    url: z
      .string()
      .url()
      .max(2_048)
      .refine((value) => value.startsWith("https://"), "Website objects must use HTTPS."),
    latticeKind: z.literal("iframe"),
    latticeTitle: z.string().trim().min(1).max(200),
    latticeDescription: z.string().max(4_000),
  })
  .strict();

const fileNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal("file"),
    file: relativeFileSchema,
    subpath: z.string().trim().min(1).max(500).optional(),
    latticeKind: z.enum(["document", "image", "file"]),
    latticeTitle: z.string().trim().min(1).max(200),
    latticeDescription: z.string().max(4_000),
  })
  .strict();

const nodeSchema = z.discriminatedUnion("type", [
  textNodeSchema,
  websiteNodeSchema,
  fileNodeSchema,
]);
const edgeSchema = z
  .object({
    id: uuidSchema,
    fromNode: uuidSchema,
    fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
    fromEnd: z.enum(["none", "arrow"]).optional(),
    toNode: uuidSchema,
    toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
    toEnd: z.enum(["none", "arrow"]).optional(),
    color: z.string().trim().min(1).max(40).optional(),
    label: z.string().max(200).optional(),
  })
  .strict();

const latticeMetadataSchema = z
  .object({
    version: z.literal(1),
    id: uuidSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4_000),
    folder: z.string().max(500),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const canvasFileSchema = z
  .object({
    nodes: z.array(nodeSchema).max(200),
    edges: z.array(edgeSchema).max(400),
    lattice: latticeMetadataSchema,
  })
  .strict();

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4_000),
    folder: z.string().trim().max(500),
  })
  .strict();

const saveSchema = z
  .object({
    id: uuidSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4_000),
    nodes: z.array(nodeSchema).max(200),
    edges: z.array(edgeSchema).max(400),
  })
  .strict();

const revealSchema = z
  .object({
    pageId: uuidSchema,
    nodeId: uuidSchema,
    linkId: uuidSchema.optional(),
  })
  .strict();

interface LocatedCanvasPage {
  page: CanvasPageRecord;
  absolutePath: string;
}

export function isSafeRelativeVaultPath(input: string): boolean {
  if (!input || input.includes("\0") || path.isAbsolute(input) || /^[a-zA-Z]:/.test(input)) {
    return false;
  }
  const parts = input.replace(/\\/g, "/").split("/");
  return parts.every((part) => Boolean(part) && part !== "." && part !== "..");
}

export function sanitizeCanvasFolder(input: string): string {
  if (!input.trim()) return "";
  const rawSegments = input.replace(/\\/g, "/").split("/");
  if (
    rawSegments.length > MAX_FOLDER_DEPTH ||
    rawSegments.some((segment) => !segment.trim() || segment === "." || segment === "..")
  ) {
    throw new Error(`Canvas folders support at most ${MAX_FOLDER_DEPTH} safe nested levels.`);
  }
  return rawSegments.map((segment) => sanitizeFileComponent(segment).slice(0, 60)).join("/");
}

function validateUniqueIdsAndReferences(
  nodes: CanvasPageRecord["nodes"],
  edges: CanvasPageRecord["edges"],
): void {
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new Error("Canvas node IDs must be unique.");
    nodeIds.add(node.id);
    if (node.type === "text" && node.latticeKind === "links") {
      const linkIds = new Set<string>();
      for (const link of node.latticeLinks ?? []) {
        if (linkIds.has(link.id))
          throw new Error("Typed-link IDs must be unique inside an object.");
        linkIds.add(link.id);
        if (
          link.kind === "object" &&
          !nodeIds.has(link.target) &&
          !nodes.some((candidate) => candidate.id === link.target)
        ) {
          throw new Error("Object references must target another object on this page.");
        }
      }
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) throw new Error("Canvas edge IDs must be unique.");
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) {
      throw new Error("Canvas edges must connect objects on this page.");
    }
  }
}

function renderCanvas(page: CanvasPageRecord): string {
  validateUniqueIdsAndReferences(page.nodes, page.edges);
  const document = {
    nodes: page.nodes,
    edges: page.edges,
    lattice: {
      version: 1,
      id: page.id,
      title: page.title,
      description: page.description,
      folder: page.folder,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    },
  };
  const rendered = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(rendered, "utf8") > MAX_CANVAS_BYTES) {
    throw new Error("The canvas is larger than the supported 2 MB limit.");
  }
  return rendered;
}

export function parseCanvasPage(input: string): CanvasPageRecord {
  if (Buffer.byteLength(input, "utf8") > MAX_CANVAS_BYTES) {
    throw new Error("The canvas is larger than the supported 2 MB limit.");
  }
  const parsed = canvasFileSchema.parse(JSON.parse(input));
  validateUniqueIdsAndReferences(parsed.nodes, parsed.edges);
  return {
    ...parsed.lattice,
    nodeCount: parsed.nodes.length,
    nodes: parsed.nodes,
    edges: parsed.edges,
  };
}

export function parseCreateCanvasPageInput(input: unknown): CreateCanvasPageInput {
  return createSchema.parse(input);
}

export function parseSaveCanvasPageInput(input: unknown): SaveCanvasPageInput {
  const parsed = saveSchema.parse(input);
  validateUniqueIdsAndReferences(parsed.nodes, parsed.edges);
  return parsed;
}

export function parseRevealCanvasReferenceInput(input: unknown): RevealCanvasReferenceInput {
  return revealSchema.parse(input);
}

async function assertNoLinks(root: string, target: string): Promise<void> {
  assertPathWithinRoot(root, target);
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const entry = await lstat(cursor);
    if (entry.isSymbolicLink()) {
      throw new Error("Symbolic links and junctions are not allowed in canvas paths.");
    }
  }
}

async function canonicalVaultRoot(vaultRoot: string): Promise<string> {
  const root = await realpath(vaultRoot);
  if (!(await stat(root)).isDirectory()) throw new Error("The selected vault is not a directory.");
  return root;
}

async function collectCanvasFiles(directory: string, depth = 0): Promise<string[]> {
  if (depth > MAX_FOLDER_DEPTH) return [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await collectCanvasFiles(absolutePath, depth + 1)));
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".canvas")
      result.push(absolutePath);
    if (result.length > MAX_CANVAS_PAGES)
      throw new Error("The vault contains too many Lattice canvases to index safely.");
  }
  return result;
}

async function locateCanvasPages(
  vaultRoot: string,
): Promise<{ root: string; pages: LocatedCanvasPage[] }> {
  const root = await canonicalVaultRoot(vaultRoot);
  const canvasRoot = path.join(root, CANVAS_DIRECTORY);
  assertPathWithinRoot(root, canvasRoot);
  const files = await collectCanvasFiles(canvasRoot);
  const pages: LocatedCanvasPage[] = [];
  for (const absolutePath of files) {
    const stats = await stat(absolutePath);
    if (!stats.isFile() || stats.size > MAX_CANVAS_BYTES) continue;
    try {
      const page = parseCanvasPage(await readFile(absolutePath, "utf8"));
      pages.push({ page, absolutePath });
    } catch {
      // Obsidian can hold arbitrary .canvas files. The Lattice index only includes
      // files carrying valid Lattice metadata and leaves all other files untouched.
    }
  }
  return { root, pages };
}

export async function listCanvasPagesFromVault(vaultRoot: string): Promise<CanvasPageSummary[]> {
  const { pages } = await locateCanvasPages(vaultRoot);
  const ids = new Set<string>();
  for (const { page } of pages) {
    if (ids.has(page.id))
      throw new Error("Duplicate canvas page IDs must be resolved in Obsidian first.");
    ids.add(page.id);
  }
  return pages
    .map(({ page }) => ({
      id: page.id,
      title: page.title,
      description: page.description,
      folder: page.folder,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      nodeCount: page.nodeCount,
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createCanvasPageAtomically(
  vaultRoot: string,
  rawInput: CreateCanvasPageInput,
): Promise<CanvasPageRecord> {
  const input = createSchema.parse(rawInput);
  const root = await canonicalVaultRoot(vaultRoot);
  const folder = sanitizeCanvasFolder(input.folder);
  const targetDirectory = path.join(root, CANVAS_DIRECTORY, ...folder.split("/").filter(Boolean));
  assertPathWithinRoot(root, targetDirectory);
  await mkdir(targetDirectory, { recursive: true });
  await assertNoLinks(root, targetDirectory);
  const canonicalTargetDirectory = await realpath(targetDirectory);
  assertPathWithinRoot(root, canonicalTargetDirectory);

  const id = randomUUID();
  const now = new Date().toISOString();
  const page: CanvasPageRecord = {
    version: 1,
    id,
    title: input.title.trim(),
    description: input.description,
    folder,
    createdAt: now,
    updatedAt: now,
    nodeCount: 0,
    nodes: [],
    edges: [],
  };
  const filename = `${sanitizeFileComponent(page.title)}-${id.slice(0, 8)}.canvas`;
  const finalPath = path.join(canonicalTargetDirectory, filename);
  const temporaryPath = path.join(canonicalTargetDirectory, `.${filename}.${randomUUID()}.tmp`);
  assertPathWithinRoot(root, finalPath);
  assertPathWithinRoot(root, temporaryPath);

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(renderCanvas(page), { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await publishNewFileAtomically(temporaryPath, finalPath);
    return page;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function findUniqueCanvasPage(
  vaultRoot: string,
  id: string,
): Promise<{ root: string; located: LocatedCanvasPage }> {
  uuidSchema.parse(id);
  const { root, pages } = await locateCanvasPages(vaultRoot);
  const matches = pages.filter(({ page }) => page.id === id);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "The canvas page could not be found."
        : "Duplicate canvas page IDs must be resolved in Obsidian first.",
    );
  }
  const located = matches[0];
  if (!located) throw new Error("The canvas page could not be found.");
  await assertNoLinks(root, located.absolutePath);
  return { root, located };
}

export async function getCanvasPageFromVault(
  vaultRoot: string,
  id: string,
): Promise<CanvasPageRecord> {
  return (await findUniqueCanvasPage(vaultRoot, id)).located.page;
}

export async function saveCanvasPageAtomically(
  vaultRoot: string,
  rawInput: SaveCanvasPageInput,
): Promise<CanvasPageRecord> {
  const input = saveSchema.parse(rawInput);
  validateUniqueIdsAndReferences(input.nodes, input.edges);
  const { root, located } = await findUniqueCanvasPage(vaultRoot, input.id);
  const before = await stat(located.absolutePath);
  if (!before.isFile() || before.size > MAX_CANVAS_BYTES)
    throw new Error("The canvas page is not a supported file.");
  const page: CanvasPageRecord = {
    ...located.page,
    title: input.title.trim(),
    description: input.description,
    updatedAt: new Date().toISOString(),
    nodeCount: input.nodes.length,
    nodes: input.nodes,
    edges: input.edges,
  };
  const rendered = renderCanvas(page);
  const temporaryPath = path.join(
    path.dirname(located.absolutePath),
    `.${path.basename(located.absolutePath)}.${randomUUID()}.tmp`,
  );
  assertPathWithinRoot(root, temporaryPath);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(rendered, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    const current = await stat(located.absolutePath);
    if (current.size !== before.size || current.mtimeMs !== before.mtimeMs) {
      throw new Error("The canvas was edited while Lattice was saving it.");
    }
    await assertNoLinks(root, located.absolutePath);
    await replaceFileAtomically(temporaryPath, located.absolutePath);
    return page;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function typedFileReference(
  node: CanvasPageRecord["nodes"][number],
  linkId?: string,
): string | null {
  if (node.type === "file") return node.file;
  if (node.type !== "text" || node.latticeKind !== "links" || !linkId) return null;
  const link = node.latticeLinks?.find((candidate: CanvasTypedLink) => candidate.id === linkId);
  return link && (link.kind === "document" || link.kind === "image" || link.kind === "file")
    ? link.target
    : null;
}

export async function resolveCanvasFileReference(
  vaultRoot: string,
  rawInput: RevealCanvasReferenceInput,
): Promise<string> {
  const input = revealSchema.parse(rawInput);
  const { root, located } = await findUniqueCanvasPage(vaultRoot, input.pageId);
  const node = located.page.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node) throw new Error("The canvas object could not be found.");
  const reference = typedFileReference(node, input.linkId);
  if (!reference || !isSafeRelativeVaultPath(reference)) {
    throw new Error("The selected canvas reference is not a local file.");
  }
  const target = path.resolve(root, ...reference.replace(/\\/g, "/").split("/"));
  assertPathWithinRoot(root, target);
  await assertNoLinks(root, target);
  const canonicalTarget = await realpath(target);
  assertPathWithinRoot(root, canonicalTarget);
  if (!(await lstat(canonicalTarget)).isFile())
    throw new Error("The canvas reference is not a file.");
  return canonicalTarget;
}
