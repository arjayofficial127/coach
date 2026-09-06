import type { Surface } from "./focus-model";

export type SurfaceTabId = "dashboard" | "files" | "libraries" | "apps" | "settings";

export const DEFAULT_SURFACE_TABS: readonly SurfaceTabId[] = ["dashboard", "files", "libraries"];

export function surfaceTabForSurface(surface: Surface): SurfaceTabId | null {
  if (
    surface === "dashboard" ||
    surface === "files" ||
    surface === "apps" ||
    surface === "settings"
  ) {
    return surface;
  }
  if (surface === "library" || surface === "queue" || surface === "pages") return "libraries";
  return null;
}

export function createDefaultSurfaceTabs(desktopIds: readonly string[]) {
  return Object.fromEntries(desktopIds.map((id) => [id, [...DEFAULT_SURFACE_TABS]]));
}

export function openSurfaceTab(
  tabs: Record<string, SurfaceTabId[]>,
  desktopId: string,
  tabId: SurfaceTabId,
): Record<string, SurfaceTabId[]> {
  const current = tabs[desktopId] ?? [];
  if (current.includes(tabId)) return tabs;
  return { ...tabs, [desktopId]: [...current, tabId] };
}

export function closeSurfaceTab(
  tabs: Record<string, SurfaceTabId[]>,
  desktopId: string,
  tabId: SurfaceTabId,
): Record<string, SurfaceTabId[]> {
  const current = tabs[desktopId] ?? [];
  if (!current.includes(tabId)) return tabs;
  return { ...tabs, [desktopId]: current.filter((candidate) => candidate !== tabId) };
}
