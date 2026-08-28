import type { ProfileState } from "../shared/contracts";

export function profileStorageKey(baseKey: string, profileId: string): string {
  return `${baseKey}.profile.${profileId}`;
}

export function readProfileStorage(
  storage: Pick<Storage, "getItem">,
  baseKey: string,
  state: ProfileState,
  profileId: string,
): string | null {
  const scoped = storage.getItem(profileStorageKey(baseKey, profileId));
  if (scoped !== null) return scoped;
  const primaryProfile = state.profiles.find((profile) => profile.primary);
  return primaryProfile?.id === profileId ? storage.getItem(baseKey) : null;
}
