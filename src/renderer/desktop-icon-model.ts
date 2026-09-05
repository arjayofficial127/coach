export const DESKTOP_ICON_FAMILIES = [
  "Orbit",
  "Window",
  "Compass",
  "Beacon",
  "Horizon",
  "Bloom",
  "Circuit",
  "Peak",
  "Wave",
  "Portal",
] as const;

export const DESKTOP_ICON_MARKS = [
  "Dot",
  "Cross",
  "Spark",
  "Path",
  "Moon",
  "Sun",
  "Leaf",
  "Bolt",
  "Link",
  "Crown",
] as const;

export interface DesktopIconOption {
  id: string;
  label: string;
  familyIndex: number;
  markIndex: number;
}

export type DesktopIconSelection =
  | { type: "builtin"; id: string }
  | { type: "image"; dataUrl: string };

export const DESKTOP_ICON_CATALOG: DesktopIconOption[] = DESKTOP_ICON_FAMILIES.flatMap(
  (family, familyIndex) =>
    DESKTOP_ICON_MARKS.map((mark, markIndex) => ({
      id: `${family.toLowerCase()}-${mark.toLowerCase()}`,
      label: `${family} ${mark}`,
      familyIndex,
      markIndex,
    })),
);

const BUILTIN_ICON_IDS = new Set(DESKTOP_ICON_CATALOG.map((icon) => icon.id));
export const MAX_DESKTOP_ICON_FILE_BYTES = 2 * 1024 * 1024;
export const DESKTOP_ICON_ACCEPT = ".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg";

const FALLBACK_ICONS = {
  violet: "orbit-spark",
  cyan: "compass-path",
  amber: "horizon-sun",
  rose: "bloom-leaf",
  lime: "circuit-bolt",
} as const;

export function desktopFallbackIconId(color: keyof typeof FALLBACK_ICONS): string {
  return FALLBACK_ICONS[color];
}

export function isDesktopIconDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= Math.ceil((MAX_DESKTOP_ICON_FILE_BYTES * 4) / 3) + 200 &&
    /^data:image\/(?:png|jpeg|svg\+xml);base64,/i.test(value)
  );
}

export function normalizeDesktopIcon(value: unknown): DesktopIconSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<DesktopIconSelection>;
  if (candidate.type === "builtin" && typeof candidate.id === "string") {
    return BUILTIN_ICON_IDS.has(candidate.id) ? { type: "builtin", id: candidate.id } : undefined;
  }
  if (candidate.type === "image" && isDesktopIconDataUrl(candidate.dataUrl)) {
    return { type: "image", dataUrl: candidate.dataUrl };
  }
  return undefined;
}

export function desktopIconFileIsSupported(file: Pick<File, "name" | "size" | "type">): boolean {
  if (file.size <= 0 || file.size > MAX_DESKTOP_ICON_FILE_BYTES) return false;
  if (["image/svg+xml", "image/png", "image/jpeg"].includes(file.type.toLowerCase())) return true;
  return /\.(?:svg|png|jpe?g)$/i.test(file.name);
}
