export type Surface =
  | "home"
  | "dashboard"
  | "browser"
  | "library"
  | "queue"
  | "pages"
  | "apps"
  | "settings";

export interface FocusPreferences {
  version: 1;
  intention: string;
}

export type NavigationShortcut =
  | { kind: "surface"; surface: Surface }
  | { kind: "toggle-focus" }
  | null;

export const FOCUS_STORAGE_KEY = "lattice.focus.v1";
export const MAX_FOCUS_INTENTION_LENGTH = 120;

export const DEFAULT_FOCUS_PREFERENCES: FocusPreferences = {
  version: 1,
  intention: "",
};

const surfaceShortcutMap: Record<string, Surface> = {
  "1": "dashboard",
  "2": "browser",
  "3": "pages",
  "4": "library",
  "5": "queue",
  "6": "settings",
  "7": "apps",
};

export const surfaceDetails: Record<
  Surface,
  { label: string; description: string; shortcut: string }
> = {
  home: {
    label: "New tab",
    description: "Search, open, or capture without distraction",
    shortcut: "Ctrl T",
  },
  dashboard: {
    label: "Dashboard",
    description: "Review what matters across your workspace",
    shortcut: "Alt 1",
  },
  browser: {
    label: "Browse",
    description: "Continue the active website",
    shortcut: "Alt 2",
  },
  pages: {
    label: "Canvas pages",
    description: "Think spatially with connected objects",
    shortcut: "Alt 3",
  },
  library: {
    label: "Saved links",
    description: "Find what you deliberately kept",
    shortcut: "Alt 4",
  },
  queue: {
    label: "Reading queue",
    description: "Read one saved item at a time",
    shortcut: "Alt 5",
  },
  settings: {
    label: "Settings",
    description: "Control local continuity and privacy",
    shortcut: "Alt 6",
  },
  apps: {
    label: "Runnable apps",
    description: "Run focused local tools and keep their results",
    shortcut: "Alt 7",
  },
};

export function normalizeFocusIntention(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_FOCUS_INTENTION_LENGTH);
}

export function parseFocusPreferences(serialized: string | null): FocusPreferences {
  if (!serialized) return DEFAULT_FOCUS_PREFERENCES;
  try {
    const value = JSON.parse(serialized) as { version?: unknown; intention?: unknown };
    if (value.version !== 1) return DEFAULT_FOCUS_PREFERENCES;
    return { version: 1, intention: normalizeFocusIntention(value.intention) };
  } catch {
    return DEFAULT_FOCUS_PREFERENCES;
  }
}

export function navigationShortcut(input: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): NavigationShortcut {
  const key = input.key.toLowerCase();
  if ((input.ctrlKey || input.metaKey) && input.shiftKey && !input.altKey && key === "f") {
    return { kind: "toggle-focus" };
  }
  if (input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey) {
    const surface = surfaceShortcutMap[key];
    return surface ? { kind: "surface", surface } : null;
  }
  return null;
}
