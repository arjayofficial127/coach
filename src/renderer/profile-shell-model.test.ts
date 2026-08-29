import { describe, expect, it } from "vitest";
import type { ProfileState } from "../shared/contracts";
import {
  canPersistProfileShell,
  profileStorageKey,
  readProfileStorage,
} from "./profile-shell-model";

const profiles: ProfileState = {
  activeProfileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  profiles: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Personal",
      avatarDataUrl: null,
      primary: true,
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Work",
      avatarDataUrl: null,
      primary: false,
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    },
  ],
};
const personalProfileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workProfileId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("profile shell storage", () => {
  it("does not persist defaults when browser restoration finishes before settings hydration", () => {
    expect(canPersistProfileShell(true, false)).toBe(false);
    expect(canPersistProfileShell(false, true)).toBe(false);
    expect(canPersistProfileShell(true, true)).toBe(true);
  });

  it("uses a profile-specific key", () => {
    expect(profileStorageKey("lattice.session.v1", profiles.activeProfileId)).toBe(
      "lattice.session.v1.profile.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("migrates legacy shell state only for the primary profile", () => {
    const values = new Map<string, string>([["lattice.workspace.v1", "legacy"]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };
    expect(readProfileStorage(storage, "lattice.workspace.v1", profiles, personalProfileId)).toBe(
      "legacy",
    );
    expect(readProfileStorage(storage, "lattice.workspace.v1", profiles, workProfileId)).toBeNull();
  });

  it("prefers scoped state over the primary legacy record", () => {
    const id = personalProfileId;
    const values = new Map<string, string>([
      ["lattice.workspace.v1", "legacy"],
      [profileStorageKey("lattice.workspace.v1", id), "scoped"],
    ]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };
    expect(readProfileStorage(storage, "lattice.workspace.v1", profiles, id)).toBe("scoped");
  });
});
