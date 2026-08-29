import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE_INPUTS = [
  ".npmrc",
  "biome.json",
  "build",
  "electron-builder.yml",
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vite.renderer.config.ts",
  "vitest.config.ts",
  "src",
  "scripts/package.mjs",
  "scripts/build-installer.mjs",
  "scripts/source-manifest.mjs",
  "scripts/verify-installer.mjs",
  "scripts/verify-packaged-smoke.mjs",
];

async function collectFiles(root, input) {
  const absolutePath = path.join(root, input);
  const inputStats = await stat(absolutePath);
  if (inputStats.isFile()) return [absolutePath];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(root, path.join(input, entry.name))),
  );
  return nested.flat();
}

export async function createSourceManifest(repositoryRoot) {
  const absoluteRoot = path.resolve(repositoryRoot);
  const files = (await Promise.all(SOURCE_INPUTS.map((input) => collectFiles(absoluteRoot, input))))
    .flat()
    .sort((left, right) => left.localeCompare(right, "en"));
  const aggregate = createHash("sha256");
  const entries = [];

  for (const absolutePath of files) {
    const bytes = await readFile(absolutePath);
    const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join("/");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    aggregate.update(`${relativePath}\0${bytes.byteLength}\0`, "utf8");
    aggregate.update(bytes);
    aggregate.update("\0", "utf8");
    entries.push({ path: relativePath, bytes: bytes.byteLength, sha256 });
  }

  return {
    algorithm: "sha256(path\\0length\\0bytes\\0)",
    sha256: aggregate.digest("hex"),
    files: entries,
  };
}
