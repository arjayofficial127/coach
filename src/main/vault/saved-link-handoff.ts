import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { assertPathWithinRoot } from "./atomic-note";
import { listSavedLinksFromVault } from "./saved-link-reader";

export interface SavedLinkHandoff {
  absolutePath: string;
  obsidianUri: string;
}

export function buildObsidianOpenUri(absolutePath: string): string {
  if (!path.isAbsolute(absolutePath)) {
    throw new Error("An absolute saved-link path is required for Obsidian handoff.");
  }
  const normalizedPath = path.resolve(absolutePath).split(path.sep).join("/");
  return `obsidian://open?path=${encodeURIComponent(normalizedPath)}`;
}

async function assertNoLinks(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const entry = await lstat(cursor);
    if (entry.isSymbolicLink()) {
      throw new Error("Symbolic links and junctions are not allowed in a saved-link path.");
    }
  }
}

export async function resolveSavedLinkHandoff(
  vaultRoot: string,
  expectedId: string,
): Promise<SavedLinkHandoff> {
  const links = await listSavedLinksFromVault(vaultRoot);
  const matches = links.filter((link) => link.id === expectedId);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "The saved link could not be found."
        : "Duplicate saved-link IDs must be resolved in Obsidian first.",
    );
  }
  const match = matches[0];
  if (!match) throw new Error("The saved link could not be found.");

  const canonicalRoot = await realpath(vaultRoot);
  const target = path.resolve(canonicalRoot, match.relativePath);
  assertPathWithinRoot(canonicalRoot, target);
  await assertNoLinks(canonicalRoot, target);
  const canonicalTarget = await realpath(target);
  assertPathWithinRoot(canonicalRoot, canonicalTarget);
  const targetStats = await lstat(canonicalTarget);
  if (!targetStats.isFile() || path.extname(canonicalTarget).toLowerCase() !== ".md") {
    throw new Error("The saved-link handoff target is not a Markdown file.");
  }

  return {
    absolutePath: canonicalTarget,
    obsidianUri: buildObsidianOpenUri(canonicalTarget),
  };
}
