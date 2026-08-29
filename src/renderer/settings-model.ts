export const THEME_IDS = ["lattice-dark", "paper-felt", "custom"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface CustomThemePreferences {
  name: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
}

export interface ThemeCatalogEntry {
  id: ThemeId;
  name: string;
  description: string;
}

export interface SettingsPreferences {
  version: 2;
  restoreTabs: boolean;
  activeTheme: ThemeId;
  customTheme: CustomThemePreferences;
}

export const MAX_CUSTOM_THEME_NAME_LENGTH = 40;

export const THEME_CATALOG: readonly ThemeCatalogEntry[] = [
  {
    id: "lattice-dark",
    name: "Lattice Dark",
    description: "The focused, low-light Lattice you already know.",
  },
  {
    id: "paper-felt",
    name: "Paper Felt",
    description: "Warm paper, soft fibers, and comfortable daylight contrast.",
  },
  {
    id: "custom",
    name: "Custom",
    description: "A named palette that belongs to this profile.",
  },
] as const;

export const DEFAULT_CUSTOM_THEME: CustomThemePreferences = {
  name: "Deep Teal",
  background: "#101a1c",
  surface: "#1b292c",
  text: "#f2f3ec",
  muted: "#a5b6b3",
  accent: "#69cdbf",
};

export const DEFAULT_SETTINGS: SettingsPreferences = {
  version: 2,
  restoreTabs: true,
  activeTheme: "lattice-dark",
  customTheme: DEFAULT_CUSTOM_THEME,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return value.toLowerCase();
}

export function normalizeCustomThemeName(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CUSTOM_THEME.name;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_THEME_NAME_LENGTH);
  return normalized || DEFAULT_CUSTOM_THEME.name;
}

export function normalizeCustomTheme(value: unknown): CustomThemePreferences {
  if (!isRecord(value)) return { ...DEFAULT_CUSTOM_THEME };
  return {
    name: normalizeCustomThemeName(value.name),
    background: normalizeHexColor(value.background, DEFAULT_CUSTOM_THEME.background),
    surface: normalizeHexColor(value.surface, DEFAULT_CUSTOM_THEME.surface),
    text: normalizeHexColor(value.text, DEFAULT_CUSTOM_THEME.text),
    muted: normalizeHexColor(value.muted, DEFAULT_CUSTOM_THEME.muted),
    accent: normalizeHexColor(value.accent, DEFAULT_CUSTOM_THEME.accent),
  };
}

export function parseSettingsPreferences(serialized: string | null): SettingsPreferences {
  if (!serialized) return DEFAULT_SETTINGS;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (!isRecord(candidate) || typeof candidate.restoreTabs !== "boolean") {
      return DEFAULT_SETTINGS;
    }

    if (candidate.version === 1) {
      return { ...DEFAULT_SETTINGS, restoreTabs: candidate.restoreTabs };
    }

    if (candidate.version !== 2) return DEFAULT_SETTINGS;
    return {
      version: 2,
      restoreTabs: candidate.restoreTabs,
      activeTheme: isThemeId(candidate.activeTheme) ? candidate.activeTheme : "lattice-dark",
      customTheme: normalizeCustomTheme(candidate.customTheme),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
