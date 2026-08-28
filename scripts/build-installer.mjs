import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Arch, build, Platform } from "electron-builder";
import { createSourceManifest } from "./source-manifest.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedRoot = path.join(repositoryRoot, "out", "Lattice-win32-x64");
const executable = path.join(packagedRoot, "Lattice.exe");
const appAsar = path.join(packagedRoot, "resources", "app.asar");
const sourceManifestPath = path.join(packagedRoot, "resources", "source-manifest.json");
const releaseRoot = path.join(repositoryRoot, "release");
const configPath = path.join(repositoryRoot, "electron-builder.yml");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const installerName = `Lattice-Setup-${packageJson.version}.exe`;
const installerPath = path.join(releaseRoot, installerName);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (process.platform !== "win32") {
  throw new Error("The Phase 9 installer gate must run on Windows.");
}
if (path.dirname(releaseRoot) !== repositoryRoot) {
  throw new Error("Refusing to replace a release directory outside the repository root.");
}

await Promise.all([
  access(executable),
  access(appAsar),
  access(sourceManifestPath),
  access(configPath),
]);

const packagedSourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const currentSourceManifest = await createSourceManifest(repositoryRoot);
if (packagedSourceManifest.sha256 !== currentSourceManifest.sha256) {
  throw new Error("The portable package is stale; run `pnpm run package` before the installer.");
}

const before = {
  executable: sha256(await readFile(executable)),
  appAsar: sha256(await readFile(appAsar)),
  sourceManifest: sha256(await readFile(sourceManifestPath)),
};

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
const emittedArtifacts = await build({
  projectDir: repositoryRoot,
  prepackaged: packagedRoot,
  config: configPath,
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  publish: "never",
});
await access(installerPath);

const after = {
  executable: sha256(await readFile(executable)),
  appAsar: sha256(await readFile(appAsar)),
  sourceManifest: sha256(await readFile(sourceManifestPath)),
};
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error("Installer creation modified the hardened portable package.");
}

const installerBytes = await readFile(installerPath);
const installerStats = await stat(installerPath);
const evidence = {
  createdAt: new Date().toISOString(),
  version: packageJson.version,
  builder: "electron-builder@26.15.3",
  target: "NSIS assisted installer (Windows x64, current-user default)",
  configPath,
  installerPath,
  installerBytes: installerStats.size,
  installerSha256: sha256(installerBytes),
  packagedSourceManifestSha256: packagedSourceManifest.sha256,
  hardenedPackageHashes: before,
  hardenedPackageUnchanged: true,
  emittedArtifacts: emittedArtifacts.map((artifact) => path.relative(repositoryRoot, artifact)),
  signed: false,
};
await writeFile(
  path.join(releaseRoot, "installer-build-evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8",
);

console.log(`Built unsigned Phase 9 installer: ${installerPath}`);
