import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { isCoachBoard, newCoachBoard, newCoachPlanner } from "../../shared/coach-board";
import type {
  CaptureDesktopInboxInput,
  CreateWorkspaceEntryInput,
  DesktopFileItem,
  DesktopFolderArea,
  DesktopFolderInput,
  DesktopFolderSummary,
  LocalWorkspaceSnapshot,
  ReadWorkspaceFileRevisionInput,
  RenameWorkspaceEntryInput,
  RenameWorkspaceEntryResult,
  SaveWorkspaceFileInput,
  WorkspaceDirectoryEntry,
  WorkspaceDirectoryListing,
  WorkspaceEditableFileType,
  WorkspaceFileDocument,
  WorkspaceFileRevision,
  WorkspaceFileRevisionDocument,
  WorkspacePathInput,
} from "../../shared/contracts";
import {
  assertPathWithinRoot,
  publishNewFileWithAvailableName,
  replaceFileAtomically,
  sanitizeFileComponent,
} from "./atomic-note";

const COACH_DIRECTORY = ".coach";
const DESKTOPS_DIRECTORY = "Desktops";
const AREAS: DesktopFolderArea[] = ["Inbox", "Notes", "Files", "Planner"];
const MAX_DESKTOPS = 12;
const MAX_ITEMS_PER_DESKTOP = 200;
const MAX_DIRECTORY_ITEMS = 500;
const MAX_EDITABLE_BYTES = 2_000_000;
const MAX_RELATIVE_PATH_LENGTH = 500;
const MAX_PATH_SEGMENTS = 24;
const MAX_FILE_REVISIONS = 100;
const MAX_FILE_REVISION_BYTES = 50 * 1024 * 1024;
const REVISION_DIRECTORY = "history";
const revisionIdPattern = /^\d{13}-[0-9a-f-]{36}$/;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const EDITABLE_EXTENSIONS: Record<WorkspaceEditableFileType, string> = {
  markdown: ".md",
  text: ".text",
  coach: ".coach",
};
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

interface StoredWorkspaceRevision {
  version: 1;
  savedAt: string;
  content: string;
}

function revisionDirectory(workspaceRoot: string, desktopId: string, relativePath: string): string {
  return path.join(workspaceRoot, COACH_DIRECTORY, REVISION_DIRECTORY, desktopId, relativePath);
}

function revisionTime(id: string): string {
  const date = new Date(Number(id.slice(0, 13)));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

async function pruneWorkspaceRevisions(directory: string): Promise<void> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && revisionIdPattern.test(entry.name.replace(/\.json\.gz$/, "")),
    )
    .sort((left, right) => right.name.localeCompare(left.name));
  const sizes = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      size: (await stat(path.join(directory, entry.name))).size,
    })),
  );
  let retainedBytes = 0;
  await Promise.all(
    sizes.map(async ({ entry, size }, index) => {
      retainedBytes += size;
      if (index >= MAX_FILE_REVISIONS || retainedBytes > MAX_FILE_REVISION_BYTES)
        await rm(path.join(directory, entry.name), { force: true });
    }),
  );
}

async function saveWorkspaceRevision(
  directory: string,
  savedAt: string,
  content: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const id = `${Date.parse(savedAt).toString().padStart(13, "0")}-${randomUUID()}`;
  const payload: StoredWorkspaceRevision = { version: 1, savedAt, content };
  await writeFile(path.join(directory, `${id}.json.gz`), await gzipAsync(JSON.stringify(payload)), {
    flag: "wx",
    mode: 0o600,
  });
  await pruneWorkspaceRevisions(directory);
}

interface WorkspaceManifestDesktop {
  id: string;
  name: string;
  folderName: string;
  areaFolders?: Record<DesktopFolderArea, string>;
}

function areaFolders(desktop: WorkspaceManifestDesktop): Record<DesktopFolderArea, string> {
  return Object.fromEntries(
    AREAS.map((area) => {
      const candidate = desktop.areaFolders?.[area] ?? area;
      return [area, validateEntryName(candidate)];
    }),
  ) as Record<DesktopFolderArea, string>;
}

// Serialize writes in each connected workspace, including renames and capture/refresh metadata.
// Readers remain read-only and may ask the user to refresh during an external filesystem change.
const mutations = new Map<string, Promise<unknown>>();
async function mutateWorkspace<T>(workspaceRoot: string, action: () => Promise<T>): Promise<T> {
  const canonical = await realpath(workspaceRoot);
  const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const previous = mutations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  mutations.set(key, current);
  try {
    return await current;
  } finally {
    if (mutations.get(key) === current) mutations.delete(key);
  }
}

interface WorkspaceManifest {
  version: 1;
  desktops: WorkspaceManifestDesktop[];
}

function validDesktop(input: DesktopFolderInput): boolean {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(input.id) && Boolean(input.name.trim());
}

function desktopFolderName(desktop: DesktopFolderInput): string {
  return `${sanitizeFileComponent(desktop.name)}-${desktop.id.slice(0, 8)}`;
}

function yamlString(input: string): string {
  return JSON.stringify(input.replace(/\r\n?/g, "\n"));
}

function itemId(desktopId: string, area: DesktopFolderArea, name: string): string {
  return createHash("sha256").update(`${desktopId}\0${area}\0${name}`).digest("hex").slice(0, 24);
}

function workspaceEntryId(desktopId: string, relativePath: string): string {
  return createHash("sha256").update(`${desktopId}\0${relativePath}`).digest("hex").slice(0, 24);
}

function hasReservedPathCharacter(value: string, includeSeparators = false): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) <= 31 || '<>:"|?*'.includes(character)) return true;
    if (includeSeparators && (character === "/" || character === "\\")) return true;
  }
  return false;
}

function normalizeWorkspacePath(input: string): string {
  const value = input.trim().replace(/\\/g, "/");
  if (!value) return "";
  if (value.length > MAX_RELATIVE_PATH_LENGTH || value.startsWith("/") || /^[a-z]:/i.test(value)) {
    throw new Error("Choose a location inside this desktop.");
  }
  const segments = value.split("/");
  if (
    segments.length > MAX_PATH_SEGMENTS ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        hasReservedPathCharacter(segment) ||
        segment.endsWith(" ") ||
        segment.endsWith("."),
    )
  ) {
    throw new Error("That workspace path is not allowed.");
  }
  return segments.join("/");
}

function validateEntryName(input: string): string {
  const name = input.trim();
  if (
    !name ||
    name.length > 120 ||
    name === "." ||
    name === ".." ||
    name.startsWith(".") ||
    hasReservedPathCharacter(name, true) ||
    name.endsWith(".") ||
    WINDOWS_RESERVED_NAMES.test(name)
  ) {
    throw new Error("Use a simple file or folder name without reserved characters.");
  }
  return name;
}

function editableFileType(name: string): WorkspaceEditableFileType | "other" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".text")) return "text";
  if (lower.endsWith(".coach")) return "coach";
  return "other";
}

function ensureFileName(name: string, fileType: WorkspaceEditableFileType): string {
  const extension = EDITABLE_EXTENSIONS[fileType];
  const validated = validateEntryName(name);
  const existingExtension = path.extname(validated).toLowerCase();
  if (!existingExtension) return `${validated}${extension}`;
  if (existingExtension !== extension) {
    throw new Error(`Create ${extension} files with the matching extension.`);
  }
  return validated;
}

function validateCoachContent(content: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("A .coach file must contain valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A .coach file must contain a document object.");
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.kind === "board" && !isCoachBoard(candidate)) {
    throw new Error(
      "This .coach board has invalid columns, cards, or dates. Review its JSON before saving.",
    );
  }
  if (
    candidate.version !== 1 ||
    typeof candidate.kind !== "string" ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(candidate.kind)
  ) {
    throw new Error("This .coach object does not match the supported version 1 envelope.");
  }
  if (
    candidate.kind === "document" &&
    (typeof candidate.title !== "string" ||
      candidate.title.length > 200 ||
      typeof candidate.content !== "string")
  ) {
    throw new Error("This .coach document does not match the supported document format.");
  }
}

async function desktopWorkspaceContext(workspaceRoot: string, desktopId: string) {
  const root = await realpath(workspaceRoot);
  const manifest = await readManifest(root);
  const desktop = manifest.desktops.find((candidate) => candidate.id === desktopId);
  if (!desktop) throw new Error("This desktop is not available in the local workspace.");
  const desktopRoot = path.join(root, DESKTOPS_DIRECTORY, desktop.folderName);
  assertPathWithinRoot(root, desktopRoot);
  const desktopRootStats = await lstat(desktopRoot);
  if (!desktopRootStats.isDirectory() || desktopRootStats.isSymbolicLink()) {
    throw new Error("This desktop folder is unavailable.");
  }
  const canonicalDesktopRoot = await realpath(desktopRoot);
  assertPathWithinRoot(root, canonicalDesktopRoot);
  return { root, desktop, desktopRoot: canonicalDesktopRoot };
}

async function resolveExistingWorkspacePath(
  workspaceRoot: string,
  input: WorkspacePathInput,
  expected: "file" | "folder",
) {
  const context = await desktopWorkspaceContext(workspaceRoot, input.desktopId);
  const relativePath = normalizeWorkspacePath(input.relativePath);
  const target = relativePath
    ? path.join(context.desktopRoot, ...relativePath.split("/"))
    : context.desktopRoot;
  assertPathWithinRoot(context.desktopRoot, target);
  let inspectedPath = context.desktopRoot;
  let targetStats = await lstat(inspectedPath);
  for (const segment of relativePath ? relativePath.split("/") : []) {
    inspectedPath = path.join(inspectedPath, segment);
    targetStats = await lstat(inspectedPath);
    if (targetStats.isSymbolicLink()) {
      throw new Error("Linked workspace items are not supported.");
    }
  }
  if (expected === "file" ? !targetStats.isFile() : !targetStats.isDirectory()) {
    throw new Error(
      expected === "file" ? "That file is unavailable." : "That folder is unavailable.",
    );
  }
  const canonicalTarget = await realpath(target);
  assertPathWithinRoot(context.desktopRoot, canonicalTarget);
  return { ...context, relativePath, target: canonicalTarget, targetStats };
}

function breadcrumbs(desktopName: string, relativePath: string) {
  const result = [{ name: desktopName, relativePath: "" }];
  const segments = relativePath ? relativePath.split("/") : [];
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    result.push({ name: segment, relativePath: current });
  }
  return result;
}

function initialFileContent(
  name: string,
  fileType: WorkspaceEditableFileType,
  coachKind?: "document" | "board" | "planner",
): string {
  const title = name.slice(0, -EDITABLE_EXTENSIONS[fileType].length);
  if (fileType === "markdown") return "";
  if (fileType === "text") return "";
  if (coachKind === "board") return `${JSON.stringify(newCoachBoard(title), null, 2)}\n`;
  if (coachKind === "planner") return `${JSON.stringify(newCoachPlanner(title), null, 2)}\n`;
  return `${JSON.stringify(
    {
      version: 1,
      kind: "document",
      title,
      content: "",
      data: {},
    },
    null,
    2,
  )}\n`;
}

async function writeJsonAtomically(root: string, target: string, value: unknown): Promise<void> {
  assertPathWithinRoot(root, target);
  const temporary = `${target}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await replaceFileAtomically(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readManifest(root: string): Promise<WorkspaceManifest> {
  const manifestPath = path.join(root, COACH_DIRECTORY, "workspace.json");
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<WorkspaceManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.desktops)) throw new Error("invalid");
    return {
      version: 1,
      desktops: parsed.desktops.filter((desktop): desktop is WorkspaceManifestDesktop =>
        Boolean(
          desktop &&
            typeof desktop.id === "string" &&
            typeof desktop.name === "string" &&
            typeof desktop.folderName === "string" &&
            /^[a-zA-Z0-9_-]{1,80}$/.test(desktop.id) &&
            desktop.folderName === path.basename(desktop.folderName),
        ),
      ),
    };
  } catch {
    return { version: 1, desktops: [] };
  }
}

async function collectAreaItems(
  root: string,
  desktopId: string,
  area: DesktopFolderArea,
  directory: string,
): Promise<DesktopFileItem[]> {
  const items: DesktopFileItem[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (items.length >= MAX_ITEMS_PER_DESKTOP || entry.name.startsWith(".")) continue;
    const absolutePath = path.join(directory, entry.name);
    assertPathWithinRoot(root, absolutePath);
    const entryStats = await lstat(absolutePath);
    if (entryStats.isSymbolicLink() || (!entryStats.isFile() && !entryStats.isDirectory()))
      continue;
    items.push({
      id: itemId(desktopId, area, entry.name),
      name: entry.name,
      kind: entryStats.isDirectory() ? "folder" : "file",
      area,
      size: entryStats.isFile() ? entryStats.size : 0,
      updatedAt: entryStats.mtime.toISOString(),
    });
  }
  return items;
}

async function desktopSummary(
  root: string,
  desktop: WorkspaceManifestDesktop,
): Promise<DesktopFolderSummary> {
  const desktopRoot = path.join(root, DESKTOPS_DIRECTORY, desktop.folderName);
  const items = (
    await Promise.all(
      AREAS.map((area) =>
        collectAreaItems(
          root,
          desktop.id,
          area,
          path.join(desktopRoot, areaFolders(desktop)[area]),
        ),
      ),
    )
  ).flat();
  items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    desktopId: desktop.id,
    desktopName: desktop.name,
    folderName: desktop.folderName,
    inboxCount: items.filter((item) => item.area === "Inbox").length,
    fileCount: items.length,
    items,
  };
}

export async function syncLocalWorkspace(
  workspaceRoot: string,
  rawDesktops: DesktopFolderInput[],
): Promise<LocalWorkspaceSnapshot> {
  return mutateWorkspace(workspaceRoot, () =>
    syncLocalWorkspaceUnlocked(workspaceRoot, rawDesktops),
  );
}

async function syncLocalWorkspaceUnlocked(
  workspaceRoot: string,
  rawDesktops: DesktopFolderInput[],
): Promise<LocalWorkspaceSnapshot> {
  const root = await realpath(workspaceRoot);
  if (!(await stat(root)).isDirectory())
    throw new Error("The selected local folder is unavailable.");
  const desktops = rawDesktops.filter(validDesktop).slice(0, MAX_DESKTOPS);
  const coachRoot = path.join(root, COACH_DIRECTORY);
  const desktopsRoot = path.join(root, DESKTOPS_DIRECTORY);
  assertPathWithinRoot(root, coachRoot);
  assertPathWithinRoot(root, desktopsRoot);
  await Promise.all([
    mkdir(coachRoot, { recursive: true }),
    mkdir(desktopsRoot, { recursive: true }),
  ]);
  const existing = await readManifest(root);
  const existingById = new Map(existing.desktops.map((desktop) => [desktop.id, desktop]));
  const manifest: WorkspaceManifest = {
    version: 1,
    desktops: desktops.map((desktop) => ({
      id: desktop.id,
      name: desktop.name.trim().slice(0, 40),
      folderName: existingById.get(desktop.id)?.folderName ?? desktopFolderName(desktop),
      ...(existingById.get(desktop.id)?.areaFolders
        ? { areaFolders: areaFolders(existingById.get(desktop.id)!) }
        : {}),
    })),
  };
  for (const desktop of manifest.desktops) {
    const desktopRoot = path.join(desktopsRoot, desktop.folderName);
    assertPathWithinRoot(root, desktopRoot);
    await Promise.all(
      AREAS.map((area) =>
        mkdir(path.join(desktopRoot, areaFolders(desktop)[area]), { recursive: true }),
      ),
    );
  }
  await writeJsonAtomically(root, path.join(coachRoot, "workspace.json"), manifest);
  return {
    connected: true,
    rootName: path.basename(root),
    desktops: await Promise.all(manifest.desktops.map((desktop) => desktopSummary(root, desktop))),
  };
}

export async function captureLocalInboxNote(
  workspaceRoot: string,
  input: CaptureDesktopInboxInput,
): Promise<void> {
  return mutateWorkspace(workspaceRoot, () => captureLocalInboxNoteUnlocked(workspaceRoot, input));
}

async function captureLocalInboxNoteUnlocked(
  workspaceRoot: string,
  input: CaptureDesktopInboxInput,
): Promise<void> {
  const root = await realpath(workspaceRoot);
  const manifest = await readManifest(root);
  const desktop = manifest.desktops.find((candidate) => candidate.id === input.desktopId);
  if (!desktop) throw new Error("The desktop folder has not been initialized.");
  const inboxContext = await resolveExistingWorkspacePath(
    root,
    {
      desktopId: input.desktopId,
      relativePath: areaFolders(desktop).Inbox,
    },
    "folder",
  );
  const inbox = inboxContext.target;
  assertPathWithinRoot(root, inbox);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const baseName = sanitizeFileComponent(input.title);
  const temporary = path.join(inbox, `.${baseName}.${randomUUID()}.tmp`);
  const markdown = [
    "---",
    'coach_type: "inbox-item"',
    `coach_id: ${yamlString(id)}`,
    `desktop_id: ${yamlString(input.desktopId)}`,
    `kind: ${yamlString(input.kind)}`,
    `created_at: ${yamlString(createdAt)}`,
    "---",
    "",
    `# ${input.title.replace(/[\r\n]+/g, " ")}`,
    "",
    input.content.trim(),
    "",
  ].join("\n");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(markdown, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await publishNewFileWithAvailableName(temporary, inbox, baseName, ".md");
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function listWorkspaceDirectory(
  workspaceRoot: string,
  input: WorkspacePathInput,
): Promise<WorkspaceDirectoryListing> {
  try {
    const context = await resolveExistingWorkspacePath(workspaceRoot, input, "folder");
    const entries: WorkspaceDirectoryEntry[] = [];
    for (const entry of await readdir(context.target, { withFileTypes: true })) {
      if (entries.length >= MAX_DIRECTORY_ITEMS || entry.name.startsWith(".")) continue;
      const entryPath = path.join(context.target, entry.name);
      assertPathWithinRoot(context.desktopRoot, entryPath);
      const entryStats = await lstat(entryPath);
      if (entryStats.isSymbolicLink() || (!entryStats.isFile() && !entryStats.isDirectory())) {
        continue;
      }
      const relativePath = context.relativePath
        ? `${context.relativePath}/${entry.name}`
        : entry.name;
      const fileType = entryStats.isFile() ? editableFileType(entry.name) : "other";
      entries.push({
        id: workspaceEntryId(input.desktopId, relativePath),
        name: entry.name,
        relativePath,
        kind: entryStats.isDirectory() ? "folder" : "file",
        fileType,
        size: entryStats.isFile() ? entryStats.size : 0,
        updatedAt: entryStats.mtime.toISOString(),
      });
    }
    entries.sort(
      (left, right) =>
        Number(right.kind === "folder") - Number(left.kind === "folder") ||
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }),
    );
    return {
      desktopId: input.desktopId,
      desktopName: context.desktop.name,
      folderName: context.desktop.folderName,
      relativePath: context.relativePath,
      breadcrumbs: breadcrumbs(context.desktop.name, context.relativePath),
      entries,
      areaFolders: areaFolders(context.desktop),
    };
  } catch (error) {
    if (error instanceof Error && !error.message.includes(workspaceRoot)) throw error;
    throw new Error("Coach could not read that local folder.");
  }
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  input: WorkspacePathInput,
): Promise<WorkspaceFileDocument> {
  try {
    const context = await resolveExistingWorkspacePath(workspaceRoot, input, "file");
    const fileType = editableFileType(path.basename(context.target));
    if (fileType === "other") {
      throw new Error("Coach can edit .md, .text, and .coach files.");
    }
    if (context.targetStats.size > MAX_EDITABLE_BYTES) {
      throw new Error("This file is too large for the Coach editor.");
    }
    const content = await readFile(context.target, "utf8");
    return {
      desktopId: input.desktopId,
      name: path.basename(context.target),
      relativePath: context.relativePath,
      fileType,
      content,
      updatedAt: context.targetStats.mtime.toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && !error.message.includes(workspaceRoot)) throw error;
    throw new Error("Coach could not open that local file.");
  }
}

export async function listWorkspaceFileRevisions(
  workspaceRoot: string,
  input: WorkspacePathInput,
): Promise<WorkspaceFileRevision[]> {
  const context = await resolveExistingWorkspacePath(workspaceRoot, input, "file");
  const directory = revisionDirectory(context.root, input.desktopId, context.relativePath);
  assertPathWithinRoot(context.root, directory);
  try {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json.gz"))
      .map((entry) => entry.name.slice(0, -".json.gz".length))
      .filter((id) => revisionIdPattern.test(id))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, MAX_FILE_REVISIONS);
    return Promise.all(
      entries.map(async (id) => ({
        id,
        savedAt: revisionTime(id),
        size: (await stat(path.join(directory, `${id}.json.gz`))).size,
      })),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Coach could not read this file's version history.");
  }
}

export async function readWorkspaceFileRevision(
  workspaceRoot: string,
  input: ReadWorkspaceFileRevisionInput,
): Promise<WorkspaceFileRevisionDocument> {
  if (!revisionIdPattern.test(input.revisionId)) throw new Error("That file version is invalid.");
  const context = await resolveExistingWorkspacePath(workspaceRoot, input, "file");
  const target = path.join(
    revisionDirectory(context.root, input.desktopId, context.relativePath),
    `${input.revisionId}.json.gz`,
  );
  assertPathWithinRoot(context.root, target);
  try {
    const stored = JSON.parse(
      (await gunzipAsync(await readFile(target))).toString("utf8"),
    ) as Partial<StoredWorkspaceRevision>;
    if (
      stored.version !== 1 ||
      typeof stored.savedAt !== "string" ||
      typeof stored.content !== "string"
    )
      throw new Error("invalid revision");
    return {
      id: input.revisionId,
      savedAt: stored.savedAt,
      size: (await stat(target)).size,
      content: stored.content,
    };
  } catch {
    throw new Error("Coach could not open that saved version.");
  }
}

export async function createWorkspaceEntry(
  workspaceRoot: string,
  input: CreateWorkspaceEntryInput,
): Promise<WorkspaceDirectoryListing> {
  return mutateWorkspace(workspaceRoot, () => createWorkspaceEntryUnlocked(workspaceRoot, input));
}

async function createWorkspaceEntryUnlocked(
  workspaceRoot: string,
  input: CreateWorkspaceEntryInput,
): Promise<WorkspaceDirectoryListing> {
  const parent = await resolveExistingWorkspacePath(
    workspaceRoot,
    { desktopId: input.desktopId, relativePath: input.parentPath },
    "folder",
  );
  if (input.kind === "file" && !input.fileType) throw new Error("Choose a Coach file type.");
  const requestedName =
    input.kind === "folder"
      ? validateEntryName(input.name)
      : ensureFileName(input.name, input.fileType as WorkspaceEditableFileType);
  try {
    if (input.kind === "folder") {
      const target = path.join(parent.target, requestedName);
      assertPathWithinRoot(parent.desktopRoot, target);
      await mkdir(target);
    } else {
      const fileType = input.fileType;
      if (!fileType) throw new Error("Choose a Coach file type.");
      const extension = EDITABLE_EXTENSIONS[fileType];
      const stem = requestedName.slice(0, -extension.length);
      const attempts = input.allocateAvailableName ? 200 : 1;
      let created = false;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const name = `${stem}${attempt === 0 ? "" : ` ${attempt}`}${extension}`;
        const target = path.join(parent.target, name);
        assertPathWithinRoot(parent.desktopRoot, target);
        let handle: Awaited<ReturnType<typeof open>> | undefined;
        try {
          handle = await open(
            target,
            fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
            0o600,
          );
          await handle.writeFile(initialFileContent(name, fileType, input.coachKind), "utf8");
          await handle.sync();
          created = true;
          break;
        } catch (error) {
          if (!input.allocateAvailableName || (error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
          }
        } finally {
          await handle?.close().catch(() => undefined);
        }
      }
      if (!created) throw new Error("Too many files already use that title.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("A file or folder with that name already exists here.");
    }
    if (error instanceof Error && !error.message.includes(workspaceRoot)) throw error;
    throw new Error("Coach could not create that workspace item.");
  }
  return listWorkspaceDirectory(workspaceRoot, {
    desktopId: input.desktopId,
    relativePath: parent.relativePath,
  });
}

export async function saveWorkspaceFile(
  workspaceRoot: string,
  input: SaveWorkspaceFileInput,
): Promise<WorkspaceFileDocument> {
  return mutateWorkspace(workspaceRoot, () => saveWorkspaceFileUnlocked(workspaceRoot, input));
}

async function saveWorkspaceFileUnlocked(
  workspaceRoot: string,
  input: SaveWorkspaceFileInput,
): Promise<WorkspaceFileDocument> {
  const bytes = Buffer.byteLength(input.content, "utf8");
  if (bytes > MAX_EDITABLE_BYTES) throw new Error("This file is too large for the Coach editor.");
  const context = await resolveExistingWorkspacePath(workspaceRoot, input, "file");
  const fileType = editableFileType(path.basename(context.target));
  if (fileType === "other") throw new Error("Coach can edit .md, .text, and .coach files.");
  if (context.targetStats.mtime.toISOString() !== input.expectedUpdatedAt) {
    throw new Error("This file changed outside Coach. Reopen it before saving your edits.");
  }
  if (fileType === "coach") validateCoachContent(input.content);
  const previousContent = await readFile(context.target, "utf8");
  if (previousContent === input.content) return readWorkspaceFile(workspaceRoot, input);
  const temporary = path.join(
    path.dirname(context.target),
    `.${path.basename(context.target)}.${randomUUID()}.tmp`,
  );
  assertPathWithinRoot(context.desktopRoot, temporary);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const historyDirectory = revisionDirectory(context.root, input.desktopId, context.relativePath);
    assertPathWithinRoot(context.root, historyDirectory);
    await saveWorkspaceRevision(
      historyDirectory,
      context.targetStats.mtime.toISOString(),
      previousContent,
    );
    handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(input.content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await replaceFileAtomically(temporary, context.target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    if (error instanceof Error && !error.message.includes(workspaceRoot)) throw error;
    throw new Error("Coach could not save that local file.");
  }
  return readWorkspaceFile(workspaceRoot, input);
}

export async function resolveDesktopFolder(
  workspaceRoot: string,
  desktopId: string,
): Promise<string> {
  const root = await realpath(workspaceRoot);
  const manifest = await readManifest(root);
  const desktop = manifest.desktops.find((candidate) => candidate.id === desktopId);
  if (!desktop) throw new Error("The desktop folder could not be found.");
  const target = await realpath(path.join(root, DESKTOPS_DIRECTORY, desktop.folderName));
  assertPathWithinRoot(root, target);
  if (!(await lstat(target)).isDirectory()) throw new Error("The desktop folder is unavailable.");
  return target;
}

async function removeRenameLink(target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await unlink(target);
      return;
    } catch (error) {
      if (
        attempt >= 40 ||
        !["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export async function renameWorkspaceEntry(
  workspaceRoot: string,
  input: RenameWorkspaceEntryInput,
): Promise<RenameWorkspaceEntryResult> {
  try {
    return await mutateWorkspace(workspaceRoot, async () => {
      if (!normalizeWorkspacePath(input.relativePath))
        throw new Error("Rename the desktop from the sidebar.");
      const context = await resolveExistingWorkspacePath(workspaceRoot, input, input.kind);
      const name = validateEntryName(input.newName);
      const oldName = path.basename(context.target);
      if (
        input.kind === "file" &&
        path.extname(name).toLowerCase() !== path.extname(oldName).toLowerCase()
      )
        throw new Error("Keep the existing file extension when renaming.");
      if (context.targetStats.mtime.toISOString() !== input.expectedUpdatedAt)
        throw new Error("This item changed outside Coach. Refresh before renaming it.");
      const parentPath = context.relativePath.split("/").slice(0, -1).join("/");
      const toPath = normalizeWorkspacePath(parentPath ? `${parentPath}/${name}` : name);
      const result = { fromPath: context.relativePath, toPath, name, kind: input.kind };
      if (oldName === name) return result;
      const parent = path.dirname(context.target);
      const target = path.join(parent, name);
      assertPathWithinRoot(context.desktopRoot, target);
      // Case-insensitive collision rules match the Windows application, even on other hosts.
      if (
        (await readdir(parent)).some(
          (sibling) => sibling !== oldName && sibling.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new Error("A file or folder with that name already exists here.");
      // Validate and prepare role metadata before changing anything on disk.
      const mapping = areaFolders(context.desktop);
      const role =
        input.kind === "folder" && !parentPath
          ? AREAS.find((area) => mapping[area].toLowerCase() === oldName.toLowerCase())
          : undefined;
      const manifest = role ? await readManifest(context.root) : undefined;
      if (manifest && !manifest.desktops.some((desktop) => desktop.id === input.desktopId))
        throw new Error("Workspace metadata changed during rename.");
      const updated =
        manifest && role
          ? {
              ...manifest,
              desktops: manifest.desktops.map((desktop) =>
                desktop.id === input.desktopId
                  ? { ...desktop, areaFolders: { ...mapping, [role]: name } }
                  : desktop,
              ),
            }
          : undefined;
      const sameCaseInsensitiveName = oldName.toLowerCase() === name.toLowerCase();
      if (input.kind === "file" && !sameCaseInsensitiveName) {
        // A hard-link destination is exclusive: unlike fs.rename, it cannot overwrite a racing file.
        await link(context.target, target);
        try {
          await removeRenameLink(context.target);
        } catch {
          const targetStats = await lstat(target);
          if (
            targetStats.ino === context.targetStats.ino &&
            targetStats.dev === context.targetStats.dev
          )
            await removeRenameLink(target);
          throw new Error(
            "Rename did not finish. Refresh to inspect the current names before retrying.",
          );
        }
      } else {
        // Windows refuses to replace an existing directory. Case-only changes retain the same item.
        if (input.kind === "folder" && process.platform !== "win32")
          throw new Error("Folder renaming is currently supported in the Windows app.");
        await rename(context.target, target);
      }
      const oldHistory = revisionDirectory(context.root, input.desktopId, context.relativePath);
      const newHistory = revisionDirectory(context.root, input.desktopId, toPath);
      // Version history follows file and folder renames. A history-only failure must not undo a
      // successful user-file rename; the old internal copies remain recoverable on disk.
      await mkdir(path.dirname(newHistory), { recursive: true });
      await rename(oldHistory, newHistory).catch(() => undefined);
      if (updated) {
        try {
          await writeJsonAtomically(
            context.root,
            path.join(context.root, COACH_DIRECTORY, "workspace.json"),
            updated,
          );
        } catch {
          // Restore the folder name if metadata cannot be committed; never replace a new occupant.
          if (!(await readdir(parent)).includes(oldName)) {
            const targetStats = await lstat(target);
            if (
              targetStats.ino === context.targetStats.ino &&
              targetStats.dev === context.targetStats.dev
            ) {
              await rename(target, context.target);
              throw new Error("Could not save the folder role. Its original name was restored.");
            }
          }
          throw new Error(
            "Folder role could not be saved. Check the folder names in Explorer before continuing.",
          );
        }
      }
      return result;
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "ENOTEMPTY")
      throw new Error("A file or folder with that name already exists here.");
    // Never return filesystem error details or absolute device paths over IPC.
    if (error instanceof Error && !code && !error.message.includes(workspaceRoot)) throw error;
    throw new Error(
      "Could not rename this item. Check the folder connection and permissions, then refresh.",
    );
  }
}
