const SITE_ICONS_STORAGE_KEY = "coach.dashboard.site-icons.v1";

export const SITE_ICONS_UPDATED_EVENT = "lattice:site-icons-updated";

export function siteIconDomainKey(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function readSiteIcons(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(SITE_ICONS_STORAGE_KEY) ?? "{}") as unknown;
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, string] =>
          Boolean(entry[0] && typeof entry[1] === "string" && entry[1].startsWith("data:image/")),
        )
        .slice(-200),
    );
  } catch {
    return {};
  }
}

export function mergeSiteIcons(
  current: Record<string, string>,
  discovered: Record<string, string>,
): Record<string, string> {
  const changed = Object.entries(discovered).some(
    ([hostname, dataUrl]) => current[hostname] !== dataUrl,
  );
  return changed ? { ...current, ...discovered } : current;
}

export function saveSiteIcons(icons: Record<string, string>): Record<string, string> {
  const saved = Object.fromEntries(
    Object.entries(icons)
      .filter((entry): entry is [string, string] =>
        Boolean(entry[0] && entry[1]?.startsWith("data:image/")),
      )
      .slice(-200),
  );
  try {
    const serialized = JSON.stringify(saved);
    if (localStorage.getItem(SITE_ICONS_STORAGE_KEY) === serialized) return saved;
    localStorage.setItem(SITE_ICONS_STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(SITE_ICONS_UPDATED_EVENT));
  } catch {
    // Icon persistence is optional; the in-memory value still updates the current view.
  }
  return saved;
}
