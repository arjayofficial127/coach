import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileStore } from "./profile-store";

const roots: string[] = [];

async function createStore(): Promise<{ root: string; store: ProfileStore }> {
  const root = path.join(os.tmpdir(), `lattice-profile-store-${crypto.randomUUID()}`);
  roots.push(root);
  const store = new ProfileStore(path.join(root, "profiles.json"), path.join(root, "avatars"));
  await store.initialize();
  return { root, store };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProfileStore", () => {
  it("creates a primary profile on the legacy persistent website partition", async () => {
    const { root, store } = await createStore();
    const state = store.state();
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({ name: "Personal", primary: true });
    expect(store.partitionForProfile(state.activeProfileId)).toBe("persist:lattice-remote");
    expect(JSON.parse(await readFile(path.join(root, "profiles.json"), "utf8"))).not.toHaveProperty(
      "password",
    );
  });

  it("creates, names, activates, and reloads isolated profiles", async () => {
    const { root, store } = await createStore();
    const primaryId = store.state().activeProfileId;
    const created = await store.create(" Work ");
    const workId = created.activeProfileId;
    expect(workId).not.toBe(primaryId);
    expect(store.partitionForProfile(workId)).toBe(`persist:lattice-profile-${workId}`);
    expect(store.partitionForProfile(workId)).not.toBe(store.partitionForProfile(primaryId));

    await store.updateName(workId, "Client work");
    await store.activate(primaryId);
    const reloaded = new ProfileStore(path.join(root, "profiles.json"), path.join(root, "avatars"));
    const state = await reloaded.initialize();
    expect(state.activeProfileId).toBe(primaryId);
    expect(state.profiles.map((profile) => profile.name)).toEqual(["Personal", "Client work"]);
  });

  it("serializes rapid profile changes so the latest choice reaches disk", async () => {
    const { root, store } = await createStore();
    const primaryId = store.state().activeProfileId;
    const workId = (await store.create("Work")).activeProfileId;
    await store.activate(primaryId);

    await Promise.all([store.activate(workId), store.activate(primaryId)]);

    const reloaded = new ProfileStore(path.join(root, "profiles.json"), path.join(root, "avatars"));
    expect((await reloaded.initialize()).activeProfileId).toBe(primaryId);
  });

  it("rejects duplicate names and an unbounded number of profiles", async () => {
    const { store } = await createStore();
    await expect(store.create("personal")).rejects.toThrow("different profile name");
    for (let index = 2; index <= 8; index += 1) {
      await store.create(`Profile ${index}`);
    }
    await expect(store.create("Profile 9")).rejects.toThrow("up to 8");
  });

  it("stores only a bounded PNG data URL in public avatar state", async () => {
    const { root, store } = await createStore();
    const profileId = store.state().activeProfileId;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const state = await store.setAvatar(profileId, png);
    expect(state.profiles[0]?.avatarDataUrl).toBe(
      `data:image/png;base64,${png.toString("base64")}`,
    );
    expect(JSON.parse(await readFile(path.join(root, "profiles.json"), "utf8"))).toMatchObject({
      profiles: [{ avatarFile: `${profileId}.png` }],
    });
    const cleared = await store.clearAvatar(profileId);
    expect(cleared.profiles[0]?.avatarDataUrl).toBeNull();
  });

  it("preserves an invalid registry instead of silently replacing it", async () => {
    const { root } = await createStore();
    const registryPath = path.join(root, "profiles.json");
    await writeFile(registryPath, '{"version":1,"profiles":[]}', "utf8");
    const store = new ProfileStore(registryPath, path.join(root, "avatars"));
    await expect(store.initialize()).rejects.toThrow("preserved for recovery");
    expect(await readFile(registryPath, "utf8")).toBe('{"version":1,"profiles":[]}');
  });
});
