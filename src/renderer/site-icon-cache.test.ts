import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeSiteIcons, SITE_ICONS_UPDATED_EVENT, saveSiteIcons } from "./site-icon-cache";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("site icon cache updates", () => {
  it("preserves the current reference when discovery contains no changes", () => {
    const current = { "google.com": "data:image/png;base64,google" };

    expect(mergeSiteIcons(current, { ...current })).toBe(current);
    expect(mergeSiteIcons(current, { "youtube.com": "data:image/png;base64,youtube" })).toEqual({
      ...current,
      "youtube.com": "data:image/png;base64,youtube",
    });
  });

  it("dispatches one update event when repeated saves contain identical icons", () => {
    const values = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent });

    const icons = { "google.com": "data:image/png;base64,google" };
    saveSiteIcons(icons);
    saveSiteIcons({ ...icons });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as Event | undefined;
    expect(event).toBeInstanceOf(Event);
    expect(event?.type).toBe(SITE_ICONS_UPDATED_EVENT);
  });
});
