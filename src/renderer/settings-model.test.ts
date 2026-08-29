import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOM_THEME,
  DEFAULT_SETTINGS,
  normalizeCustomTheme,
  parseSettingsPreferences,
  THEME_CATALOG,
} from "./settings-model";

describe("settings preferences", () => {
  it("repairs malformed and unsupported values", () => {
    expect(parseSettingsPreferences(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsPreferences("not-json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsPreferences('{"version":4,"restoreTabs":false}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsPreferences('{"version":2,"restoreTabs":"yes"}')).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates legacy restore-tabs preferences into Felt White", () => {
    expect(parseSettingsPreferences('{"version":1,"restoreTabs":false}')).toEqual({
      ...DEFAULT_SETTINGS,
      restoreTabs: false,
    });
  });

  it("accepts all three catalog themes and a named custom palette", () => {
    expect(THEME_CATALOG.map((theme) => theme.id)).toEqual([
      "lattice-dark",
      "paper-felt",
      "custom",
    ]);
    expect(
      parseSettingsPreferences(
        JSON.stringify({
          version: 2,
          restoreTabs: true,
          activeTheme: "custom",
          customTheme: {
            name: "  Quiet   Moss  ",
            background: "#112233",
            surface: "#223344",
            text: "#F4F5F6",
            muted: "#AABBCC",
            accent: "#45AA88",
          },
        }),
      ),
    ).toEqual({
      version: 3,
      restoreTabs: true,
      activeTheme: "custom",
      customTheme: {
        name: "Quiet Moss",
        background: "#112233",
        surface: "#223344",
        text: "#f4f5f6",
        muted: "#aabbcc",
        accent: "#45aa88",
      },
    });
  });

  it("repairs unknown themes and individual malformed custom fields", () => {
    expect(
      parseSettingsPreferences(
        JSON.stringify({
          version: 3,
          restoreTabs: false,
          activeTheme: "missing-theme",
          customTheme: {
            name: " ",
            background: "red",
            surface: "#123456",
            text: null,
            muted: "#abcdef",
            accent: "#12345g",
          },
        }),
      ),
    ).toEqual({
      version: 3,
      restoreTabs: false,
      activeTheme: "paper-felt",
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        surface: "#123456",
        muted: "#abcdef",
      },
    });
  });

  it("moves the former v2 dark default to Felt White without overriding later choices", () => {
    const legacyDark = JSON.stringify({
      version: 2,
      restoreTabs: true,
      activeTheme: "lattice-dark",
      customTheme: DEFAULT_CUSTOM_THEME,
    });
    const currentDark = JSON.stringify({
      version: 3,
      restoreTabs: true,
      activeTheme: "lattice-dark",
      customTheme: DEFAULT_CUSTOM_THEME,
    });

    expect(parseSettingsPreferences(legacyDark).activeTheme).toBe("paper-felt");
    expect(parseSettingsPreferences(currentDark).activeTheme).toBe("lattice-dark");
  });

  it("normalizes an absent custom palette into a fresh default value", () => {
    expect(normalizeCustomTheme(null)).toEqual(DEFAULT_CUSTOM_THEME);
    expect(normalizeCustomTheme(null)).not.toBe(DEFAULT_CUSTOM_THEME);
  });
});
