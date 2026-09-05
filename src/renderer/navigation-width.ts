export const NAVIGATION_WIDTH_STORAGE_KEY = "lattice.navigation-width.v1";
export const DEFAULT_NAVIGATION_WIDTH = 288;
export const MAX_NAVIGATION_WIDTH = 369;
export const COMPACT_NAVIGATION_TRIGGER = 139;
export const MIN_NAVIGATION_WIDTH = COMPACT_NAVIGATION_TRIGGER + 1;

export function normalizeNavigationWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_NAVIGATION_WIDTH;
  return Math.min(MAX_NAVIGATION_WIDTH, Math.max(MIN_NAVIGATION_WIDTH, Math.round(value)));
}

export function navigationResizeResult(
  width: number,
): { mode: "compact" } | { mode: "expanded"; width: number } {
  if (width <= COMPACT_NAVIGATION_TRIGGER) return { mode: "compact" };
  return { mode: "expanded", width: normalizeNavigationWidth(width) };
}
