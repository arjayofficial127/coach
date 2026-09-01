import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import type {
  CaptureDesktopInboxInput,
  DesktopFileItem,
  DesktopFolderArea,
  DesktopFolderInput,
  DesktopFolderSummary,
  LocalWorkspaceSnapshot,
} from "../../shared/contracts";
import {
  assertPathWithinRoot,
  publishNewFileAtomically,
  sanitizeFileComponent,
} from "./atomic-note";

const COACH_DIRECTORY = ".coach";
const DESKTOPS_DIRECTORY = "Desktops";
const AREAS: DesktopFolderArea[] = ["Inbox", "Notes", "Files", "Planner"];
const MAX_DESKTOPS = 12;
const MAX_ITEMS_PER_DESKTOP = 200;

interface WorkspaceManifestDesktop {
  id: string;
  name: string;
  folderName: string;
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
    await rename(temporary, target);
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
      AREAS.map((area) => collectAreaItems(root, desktop.id, area, path.join(desktopRoot, area))),
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
    })),
  };
  for (const desktop of manifest.desktops) {
    const desktopRoot = path.join(desktopsRoot, desktop.folderName);
    assertPathWithinRoot(root, desktopRoot);
    await Promise.all(
      AREAS.map((area) => mkdir(path.join(desktopRoot, area), { recursive: true })),
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
  const root = await realpath(workspaceRoot);
  const manifest = await readManifest(root);
  const desktop = manifest.desktops.find((candidate) => candidate.id === input.desktopId);
  if (!desktop) throw new Error("The desktop folder has not been initialized.");
  const inbox = path.join(root, DESKTOPS_DIRECTORY, desktop.folderName, "Inbox");
  assertPathWithinRoot(root, inbox);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const filename = `${createdAt.slice(0, 10)} - ${sanitizeFileComponent(input.title)} - ${id.slice(0, 8)}.md`;
  const target = path.join(inbox, filename);
  const temporary = path.join(inbox, `.${filename}.${randomUUID()}.tmp`);
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
    await publishNewFileAtomically(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
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
