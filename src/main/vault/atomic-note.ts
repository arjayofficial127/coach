import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { link, lstat, mkdir, open, realpath, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { ProbeNoteInput, SaveNoteResult } from "../../shared/contracts";

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function sanitizeFileComponent(input: string): string {
  const withoutControlCharacters = [...input.normalize("NFC")]
    .map((character) => ((character.codePointAt(0) ?? 0) < 32 ? " " : character))
    .join("");
  const normalized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 96);

  if (!normalized || WINDOWS_RESERVED_NAME.test(normalized)) {
    return "saved-page";
  }
  return normalized;
}

export function assertPathWithinRoot(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new Error("The requested note path escapes the selected vault.");
}

function yamlString(input: string): string {
  return JSON.stringify(input.replace(/\r\n?/g, "\n"));
}

export function renderProbeMarkdown(
  input: ProbeNoteInput,
  latticeId: string,
  savedAt: string,
): string {
  return [
    "---",
    `lattice_id: ${yamlString(latticeId)}`,
    'type: "saved-link"',
    `url: ${yamlString(input.url)}`,
    `title: ${yamlString(input.title)}`,
    `description: ${yamlString(input.description)}`,
    `folder: ${yamlString(input.folder ?? "")}`,
    `desktop_id: ${yamlString(input.desktopId ?? "")}`,
    `saved_at: ${yamlString(savedAt)}`,
    "tags:",
    '  - "lattice-saved-link"',
    "---",
    "",
    `# ${input.title.replace(/[\r\n]+/g, " ")}`,
    "",
    input.description.trim(),
    "",
    `Source: ${input.url}`,
    "",
  ].join("\n");
}

export async function publishNewFileAtomically(
  temporaryPath: string,
  finalPath: string,
): Promise<void> {
  await link(temporaryPath, finalPath);
  await unlink(temporaryPath);
}

async function assertDirectoryContainsNoLink(root: string, directory: string): Promise<void> {
  assertPathWithinRoot(root, directory);
  const relative = path.relative(root, directory);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const entry = await lstat(cursor);
    if (entry.isSymbolicLink()) {
      throw new Error("Symbolic links and junctions are not allowed in the selected vault path.");
    }
  }
}

export async function saveProbeNoteAtomically(
  vaultRoot: string,
  input: ProbeNoteInput,
): Promise<SaveNoteResult> {
  const canonicalRoot = await realpath(vaultRoot);
  const rootStats = await stat(canonicalRoot);
  if (!rootStats.isDirectory()) {
    throw new Error("The selected vault is not a directory.");
  }

  const folder = input.folder?.trim() ? sanitizeFileComponent(input.folder) : "";
  const notesDirectory = path.join(canonicalRoot, "Saved Links", folder);
  assertPathWithinRoot(canonicalRoot, notesDirectory);
  await mkdir(notesDirectory, { recursive: true });
  await assertDirectoryContainsNoLink(canonicalRoot, notesDirectory);

  const canonicalNotesDirectory = await realpath(notesDirectory);
  assertPathWithinRoot(canonicalRoot, canonicalNotesDirectory);

  const latticeId = randomUUID();
  const savedAt = new Date().toISOString();
  const date = savedAt.slice(0, 10);
  const filename = `${date} - ${sanitizeFileComponent(input.title)} - ${latticeId.slice(0, 8)}.md`;
  const finalPath = path.join(canonicalNotesDirectory, filename);
  assertPathWithinRoot(canonicalRoot, finalPath);

  const temporaryPath = path.join(canonicalNotesDirectory, `.${filename}.${randomUUID()}.tmp`);
  assertPathWithinRoot(canonicalRoot, temporaryPath);
  const markdown = renderProbeMarkdown({ ...input, folder }, latticeId, savedAt);

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(markdown, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await publishNewFileAtomically(temporaryPath, finalPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    id: latticeId,
    title: input.title,
    url: input.url,
    description: input.description,
    savedAt,
    folder,
    desktopId: input.desktopId ?? "",
    relativePath: path.relative(canonicalRoot, finalPath),
    absolutePath: finalPath,
    bytesWritten: Buffer.byteLength(markdown, "utf8"),
  };
}
