import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ProfileState, ProfileSummary } from "../../shared/contracts";
import { replaceFileAtomically } from "../vault/atomic-note";

const MAX_PROFILES = 8;
const MAX_AVATAR_BYTES = 256 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const storedProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  partitionKey: z.union([z.literal("legacy"), z.string().uuid()]),
  avatarFile: z
    .string()
    .regex(/^[0-9a-f-]{36}\.png$/i)
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const profileDocumentSchema = z
  .object({
    version: z.literal(1),
    activeProfileId: z.string().uuid(),
    profiles: z.array(storedProfileSchema).min(1).max(MAX_PROFILES),
  })
  .superRefine((document, context) => {
    const ids = new Set<string>();
    const partitions = new Set<string>();
    for (const [index, profile] of document.profiles.entries()) {
      if (ids.has(profile.id)) {
        context.addIssue({
          code: "custom",
          message: "Profile IDs must be unique.",
          path: ["profiles", index, "id"],
        });
      }
      if (partitions.has(profile.partitionKey)) {
        context.addIssue({
          code: "custom",
          message: "Website partitions must be unique.",
          path: ["profiles", index, "partitionKey"],
        });
      }
      ids.add(profile.id);
      partitions.add(profile.partitionKey);
    }
    if (!ids.has(document.activeProfileId)) {
      context.addIssue({
        code: "custom",
        message: "The active profile must exist.",
        path: ["activeProfileId"],
      });
    }
    if (document.profiles[0]?.partitionKey !== "legacy") {
      context.addIssue({
        code: "custom",
        message: "The primary profile must retain the legacy website partition.",
        path: ["profiles", 0, "partitionKey"],
      });
    }
  });

type StoredProfile = z.infer<typeof storedProfileSchema>;
type ProfileDocument = z.infer<typeof profileDocumentSchema>;

function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 40);
}

async function writePrivateFileAtomically(
  targetPath: string,
  bytes: string | Buffer,
): Promise<void> {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await replaceFileAtomically(temporaryPath, targetPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export class ProfileStore {
  private document: ProfileDocument | null = null;
  private readonly avatars = new Map<string, string>();

  constructor(
    private readonly statePath: string,
    private readonly avatarDirectory: string,
  ) {}

  async initialize(): Promise<ProfileState> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.statePath, "utf8"));
      this.document = profileDocumentSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("The local profile registry is invalid and was preserved for recovery.", {
          cause: error,
        });
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      this.document = {
        version: 1,
        activeProfileId: id,
        profiles: [
          {
            id,
            name: "Personal",
            partitionKey: "legacy",
            avatarFile: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      await this.persist();
    }
    await this.loadAvatars();
    return this.state();
  }

  state(): ProfileState {
    const document = this.requireDocument();
    return {
      activeProfileId: document.activeProfileId,
      profiles: document.profiles.map((profile, index) => this.publicProfile(profile, index === 0)),
    };
  }

  partitionForProfile(profileId: string): string {
    const profile = this.requireProfile(profileId);
    return profile.partitionKey === "legacy"
      ? "persist:lattice-remote"
      : `persist:lattice-profile-${profile.partitionKey}`;
  }

  async create(nameInput: string): Promise<ProfileState> {
    const document = this.requireDocument();
    if (document.profiles.length >= MAX_PROFILES) {
      throw new Error(`Coach Browser supports up to ${MAX_PROFILES} local profiles.`);
    }
    const name = this.validateUniqueName(nameInput);
    const id = randomUUID();
    const now = new Date().toISOString();
    document.profiles.push({
      id,
      name,
      partitionKey: id,
      avatarFile: null,
      createdAt: now,
      updatedAt: now,
    });
    document.activeProfileId = id;
    await this.persist();
    return this.state();
  }

  async updateName(profileId: string, nameInput: string): Promise<ProfileState> {
    const profile = this.requireProfile(profileId);
    const name = this.validateUniqueName(nameInput, profileId);
    if (profile.name === name) return this.state();
    profile.name = name;
    profile.updatedAt = new Date().toISOString();
    await this.persist();
    return this.state();
  }

  async activate(profileId: string): Promise<ProfileState> {
    const document = this.requireDocument();
    this.requireProfile(profileId);
    if (document.activeProfileId === profileId) return this.state();
    document.activeProfileId = profileId;
    await this.persist();
    return this.state();
  }

  async setAvatar(profileId: string, png: Buffer): Promise<ProfileState> {
    if (
      png.byteLength === 0 ||
      png.byteLength > MAX_AVATAR_BYTES ||
      !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    ) {
      throw new Error("The profile picture could not be converted to a safe PNG avatar.");
    }
    const profile = this.requireProfile(profileId);
    const avatarFile = `${profile.id}.png`;
    await writePrivateFileAtomically(path.join(this.avatarDirectory, avatarFile), png);
    profile.avatarFile = avatarFile;
    profile.updatedAt = new Date().toISOString();
    this.avatars.set(profile.id, `data:image/png;base64,${png.toString("base64")}`);
    await this.persist();
    return this.state();
  }

  async clearAvatar(profileId: string): Promise<ProfileState> {
    const profile = this.requireProfile(profileId);
    if (!profile.avatarFile) return this.state();
    const avatarPath = path.join(this.avatarDirectory, profile.avatarFile);
    profile.avatarFile = null;
    profile.updatedAt = new Date().toISOString();
    this.avatars.delete(profile.id);
    await this.persist();
    await rm(avatarPath, { force: true });
    return this.state();
  }

  private async loadAvatars(): Promise<void> {
    this.avatars.clear();
    for (const profile of this.requireDocument().profiles) {
      if (!profile.avatarFile) continue;
      try {
        const bytes = await readFile(path.join(this.avatarDirectory, profile.avatarFile));
        if (
          bytes.byteLength <= MAX_AVATAR_BYTES &&
          bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
        ) {
          this.avatars.set(profile.id, `data:image/png;base64,${bytes.toString("base64")}`);
        }
      } catch {
        // A missing or unreadable optional avatar does not make the profile unusable.
      }
    }
  }

  private validateUniqueName(nameInput: string, profileId?: string): string {
    const name = normalizeName(nameInput);
    if (!name) throw new Error("Enter a profile name.");
    const duplicate = this.requireDocument().profiles.some(
      (profile) =>
        profile.id !== profileId && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) throw new Error("Choose a different profile name.");
    return name;
  }

  private publicProfile(profile: StoredProfile, primary: boolean): ProfileSummary {
    return {
      id: profile.id,
      name: profile.name,
      avatarDataUrl: this.avatars.get(profile.id) ?? null,
      primary,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private requireDocument(): ProfileDocument {
    if (!this.document) throw new Error("Profile storage has not been initialized.");
    return this.document;
  }

  private requireProfile(profileId: string): StoredProfile {
    const profile = this.requireDocument().profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error("The selected profile does not exist.");
    return profile;
  }

  private async persist(): Promise<void> {
    const document = profileDocumentSchema.parse(this.requireDocument());
    await writePrivateFileAtomically(this.statePath, `${JSON.stringify(document, null, 2)}\n`);
  }
}
