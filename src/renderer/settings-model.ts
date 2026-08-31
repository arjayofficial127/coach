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
  version: 4;
  restoreTabs: boolean;
  activeTheme: ThemeId;
  customTheme: CustomThemePreferences;
  searchProvider: SearchProviderId;
}

export const MAX_CUSTOM_THEME_NAME_LENGTH = 40;

export const THEME_CATALOG: readonly ThemeCatalogEntry[] = [
  {
    id: "lattice-dark",
    name: "Coach Dark",
    description: "The focused, low-light Coach Browser you already know.",
  },
  {
    id: "paper-felt",
    name: "Felt White",
    description: "Soft off-white, fine speckles, and comfortable daylight contrast.",
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
  version: 4,
  restoreTabs: true,
  activeTheme: "paper-felt",
  customTheme: DEFAULT_CUSTOM_THEME,
  searchProvider: "google",
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

    if (![2, 3, 4].includes(candidate.version as number)) return DEFAULT_SETTINGS;
    const storedTheme = isThemeId(candidate.activeTheme)
      ? candidate.activeTheme
      : DEFAULT_SETTINGS.activeTheme;
    return {
      version: 4,
      restoreTabs: candidate.restoreTabs,
      activeTheme:
        candidate.version === 2 && storedTheme === "lattice-dark"
          ? DEFAULT_SETTINGS.activeTheme
          : storedTheme,
      customTheme: normalizeCustomTheme(candidate.customTheme),
      searchProvider: isSearchProviderId(candidate.searchProvider)
        ? candidate.searchProvider
        : DEFAULT_SETTINGS.searchProvider,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

import { isSearchProviderId, type SearchProviderId } from "../shared/lattice-search";
