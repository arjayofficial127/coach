import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";
import { createSourceManifest } from "./source-manifest.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(repositoryRoot, ".package-source");
const outputRoot = path.join(repositoryRoot, "out");
const sourcePackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));

if (path.dirname(stagingRoot) !== repositoryRoot || path.dirname(outputRoot) !== repositoryRoot) {
  throw new Error("Refusing to package outside the repository root.");
}

await rm(stagingRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
await cp(path.join(repositoryRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true });
await writeFile(
  path.join(stagingRoot, "package.json"),
  `${JSON.stringify(
    {
      name: sourcePackage.name,
      productName: sourcePackage.productName,
      version: sourcePackage.version,
      description: sourcePackage.description,
      author: sourcePackage.author,
      main: "dist/main/index.cjs",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const packagedPaths = await packager({
  dir: stagingRoot,
  name: "Lattice",
  executableName: "Lattice",
  appVersion: sourcePackage.version,
  electronVersion: "44.0.0",
  platform: "win32",
  arch: "x64",
  out: outputRoot,
  overwrite: true,
  asar: true,
  prune: false,
});

const packagedRoot = packagedPaths[0];
if (!packagedRoot) {
  throw new Error("Electron Packager did not return an output directory.");
}

const executable = path.join(packagedRoot, "Lattice.exe");
await flipFuses(executable, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
});

const sourceManifest = await createSourceManifest(repositoryRoot);
await writeFile(
  path.join(packagedRoot, "resources", "source-manifest.json"),
  `${JSON.stringify({ createdAt: new Date().toISOString(), ...sourceManifest }, null, 2)}\n`,
  "utf8",
);

await rm(stagingRoot, { recursive: true, force: true });
console.log(`Packaged unsigned Phase 4 build: ${packagedRoot}`);
