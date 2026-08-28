import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { assertPathWithinRoot, replaceFileAtomically } from "./atomic-note";
import { parseSavedLinkMarkdown } from "./saved-link-reader";

const MAX_NOTE_BYTES = 1_000_000;

function yamlString(input: string): string {
  return JSON.stringify(input.replace(/\r\n?/g, "\n"));
}

function setFrontmatterScalar(frontmatter: string, key: string, value: string): string {
  const line = `${key}: ${yamlString(value)}`;
  const pattern = new RegExp(`^${key}:\\s*.*$`, "m");
  return pattern.test(frontmatter) ? frontmatter.replace(pattern, line) : `${frontmatter}\n${line}`;
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

export async function updateSavedLinkMetadataAtomically(
  vaultRoot: string,
  relativePath: string,
  expectedId: string,
  title: string,
  description: string,
): Promise<void> {
  const nextTitle = title.trim().replace(/\s+/g, " ");
  if (!nextTitle || nextTitle.length > 200 || description.length > 4_000) {
    throw new Error("Saved-link metadata is outside the supported limits.");
  }

  const canonicalRoot = await realpath(vaultRoot);
  const target = path.resolve(canonicalRoot, relativePath);
  assertPathWithinRoot(canonicalRoot, target);
  const relative = path.relative(canonicalRoot, target);
  if (
    relative.split(path.sep)[0] !== "Saved Links" ||
    path.extname(target).toLowerCase() !== ".md"
  ) {
    throw new Error("Metadata can only update a saved-link Markdown note.");
  }
  await assertNoLinks(canonicalRoot, target);

  const before = await stat(target);
  if (!before.isFile() || before.size > MAX_NOTE_BYTES) {
    throw new Error("The saved-link note is not a supported file.");
  }
  const markdown = await readFile(target, "utf8");
  const folder = path
    .relative(path.join(canonicalRoot, "Saved Links"), path.dirname(target))
    .split(path.sep)
    .filter((part) => part && part !== ".")
    .join("/");
  const record = parseSavedLinkMarkdown(markdown, relativePath, folder);
  if (!record || record.id !== expectedId) {
    throw new Error("The saved-link note changed or no longer matches its Lattice ID.");
  }

  const frontmatterEnd = markdown.indexOf("\n---\n", 4);
  let frontmatter = markdown.slice(4, frontmatterEnd);
  frontmatter = setFrontmatterScalar(frontmatter, "title", nextTitle);
  frontmatter = setFrontmatterScalar(frontmatter, "description", description);
  const updated = `---\n${frontmatter}\n---\n${markdown.slice(frontmatterEnd + 5)}`;

  const temporaryPath = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );
  assertPathWithinRoot(canonicalRoot, temporaryPath);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(updated, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;

    const current = await stat(target);
    if (current.size !== before.size || current.mtimeMs !== before.mtimeMs) {
      throw new Error("The saved-link note was edited while its metadata was changing.");
    }
    await assertNoLinks(canonicalRoot, target);
    await replaceFileAtomically(temporaryPath, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
