export interface SettingsPreferences {
  version: 1;
  restoreTabs: boolean;
}

export const DEFAULT_SETTINGS: SettingsPreferences = {
  version: 1,
  restoreTabs: true,
};

export function parseSettingsPreferences(serialized: string | null): SettingsPreferences {
  if (!serialized) return DEFAULT_SETTINGS;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("version" in candidate) ||
      candidate.version !== 1 ||
      !("restoreTabs" in candidate) ||
      typeof candidate.restoreTabs !== "boolean"
    ) {
      return DEFAULT_SETTINGS;
    }
    return { version: 1, restoreTabs: candidate.restoreTabs };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
