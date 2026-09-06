import type { Surface } from "./focus-model";

export const SHELL_LOCATION_STORAGE_KEY = "lattice.shell-location.v1";

export interface ShellLocation {
  version: 1;
  desktopId: string;
  surface: Surface;
}

const surfaces = new Set<Surface>([
  "blank",
  "home",
  "dashboard",
  "browser",
  "files",
  "library",
  "queue",
  "pages",
  "apps",
  "settings",
]);

export function parseShellLocation(
  serialized: string | null,
  validDesktopIds: ReadonlySet<string>,
): ShellLocation | null {
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("version" in candidate) ||
      candidate.version !== 1 ||
      !("desktopId" in candidate) ||
      typeof candidate.desktopId !== "string" ||
      !validDesktopIds.has(candidate.desktopId) ||
      !("surface" in candidate) ||
      typeof candidate.surface !== "string" ||
      !surfaces.has(candidate.surface as Surface)
    ) {
      return null;
    }
    return {
      version: 1,
      desktopId: candidate.desktopId,
      surface: candidate.surface as Surface,
    };
  } catch {
    return null;
  }
}
