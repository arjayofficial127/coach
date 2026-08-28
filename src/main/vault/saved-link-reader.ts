import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ReadingStatus, SavedLinkRecord } from "../../shared/contracts";
import { assertPathWithinRoot } from "./atomic-note";

const MAX_LINKS = 2_000;
const MAX_DEPTH = 8;
const MAX_NOTE_BYTES = 1_000_000;

function readJsonScalar(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match?.[1]) return null;
  try {
    const value: unknown = JSON.parse(match[1]);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function parseSavedLinkMarkdown(
  markdown: string,
  relativePath: string,
  folder: string,
): SavedLinkRecord | null {
  if (!markdown.startsWith("---\n")) return null;
  const frontmatterEnd = markdown.indexOf("\n---\n", 4);
  if (frontmatterEnd < 0) return null;
  const frontmatter = markdown.slice(4, frontmatterEnd);
  if (readJsonScalar(frontmatter, "type") !== "saved-link") return null;

  const id = readJsonScalar(frontmatter, "lattice_id");
  const title = readJsonScalar(frontmatter, "title");
  const url = readJsonScalar(frontmatter, "url");
  const description = readJsonScalar(frontmatter, "description") ?? "";
  const desktopId = readJsonScalar(frontmatter, "desktop_id") ?? "";
  const rawReadingStatus = readJsonScalar(frontmatter, "reading_status");
  const readingStatus: ReadingStatus =
    rawReadingStatus === "queued" || rawReadingStatus === "read" ? rawReadingStatus : "saved";
  const queuedAt = readJsonScalar(frontmatter, "queued_at") ?? "";
  const readAt = readJsonScalar(frontmatter, "read_at") ?? "";
  const savedAt = readJsonScalar(frontmatter, "saved_at");
  if (!id || !title || !url || !savedAt) return null;

  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (Number.isNaN(Date.parse(savedAt))) return null;
  if (queuedAt && Number.isNaN(Date.parse(queuedAt))) return null;
  if (readAt && Number.isNaN(Date.parse(readAt))) return null;

  return {
    id,
    title,
    url,
    description,
    savedAt,
    folder,
    desktopId,
    readingStatus,
    queuedAt,
    readAt,
    relativePath,
  };
}

export async function listSavedLinksFromVault(vaultRoot: string): Promise<SavedLinkRecord[]> {
  const savedLinksRoot = path.join(vaultRoot, "Saved Links");
  assertPathWithinRoot(vaultRoot, savedLinksRoot);
  const links: SavedLinkRecord[] = [];

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || links.length >= MAX_LINKS) return;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      if (links.length >= MAX_LINKS || entry.name.startsWith(".")) continue;
      const absolutePath = path.join(directory, entry.name);
      assertPathWithinRoot(vaultRoot, absolutePath);
      const entryStats = await lstat(absolutePath);
      if (entryStats.isSymbolicLink()) continue;
      if (entryStats.isDirectory()) {
        await visit(absolutePath, depth + 1);
        continue;
      }
      if (!entryStats.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
      const fileStats = await stat(absolutePath);
      if (fileStats.size > MAX_NOTE_BYTES) continue;
      const relativePath = path.relative(vaultRoot, absolutePath);
      const folder = path
        .relative(savedLinksRoot, path.dirname(absolutePath))
        .split(path.sep)
        .filter((part) => part && part !== ".")
        .join("/");
      const parsed = parseSavedLinkMarkdown(
        await readFile(absolutePath, "utf8"),
        relativePath,
        folder,
      );
      if (parsed) links.push(parsed);
    }
  };

  await visit(savedLinksRoot, 0);
  return links.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}
