import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettingsPreferences } from "./settings-model";

describe("settings preferences", () => {
  it("repairs malformed and unsupported values", () => {
    expect(parseSettingsPreferences(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsPreferences("not-json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsPreferences('{"version":2,"restoreTabs":false}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettingsPreferences('{"version":1,"restoreTabs":"yes"}')).toEqual(DEFAULT_SETTINGS);
  });

  it("accepts the explicit restore-tabs preference", () => {
    expect(parseSettingsPreferences('{"version":1,"restoreTabs":false}')).toEqual({
      version: 1,
      restoreTabs: false,
    });
  });
});
