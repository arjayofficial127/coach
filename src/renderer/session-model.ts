import type { BrowserSnapshot } from "../shared/contracts";
import { isLoopbackHostname } from "../shared/lattice-search";

export interface RestorableTab {
  url: string;
  desktopId: string;
  active: boolean;
}

export interface RestorableSession {
  version: 1;
  tabs: RestorableTab[];
}

const MAX_RESTORED_TABS = 24;

function normalizeRestorableTabs(tabs: readonly RestorableTab[]): RestorableTab[] {
  const normalized: RestorableTab[] = [];
  const tabIndexByDesktopAndUrl = new Map<string, number>();

  for (const tab of tabs) {
    const next = { ...tab };
    const restoreKey = `${next.desktopId}\u0000${next.url}`;
    const existingIndex = tabIndexByDesktopAndUrl.get(restoreKey);
    if (existingIndex === undefined) {
      tabIndexByDesktopAndUrl.set(restoreKey, normalized.length);
      normalized.push(next);
      continue;
    }

    if (next.active) normalized[existingIndex] = next;
  }

  const bounded = normalized.slice(0, MAX_RESTORED_TABS);
  if (bounded.length > 0) {
    const requestedActiveIndex = bounded.findIndex((tab) => tab.active);
    const activeIndex = requestedActiveIndex < 0 ? 0 : requestedActiveIndex;
    for (const tab of bounded) tab.active = false;
    const activeTab = bounded[activeIndex];
    if (activeTab) activeTab.active = true;
  }
  return bounded;
}

function isRestorableUrl(value: unknown): value is string {
  if (value === "about:blank") return true;
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    // Mirror isAllowedRemoteNavigation: a tab Coach agreed to open is a tab it can reopen.
    const url = new URL(value);
    return (
      url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname))
    );
  } catch {
    return false;
  }
}

export function parseRestorableSession(
  serialized: string | null,
  validDesktopIds: ReadonlySet<string>,
): RestorableSession {
  if (!serialized) return { version: 1, tabs: [] };
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("version" in candidate) ||
      candidate.version !== 1 ||
      !("tabs" in candidate) ||
      !Array.isArray(candidate.tabs)
    ) {
      return { version: 1, tabs: [] };
    }

    const tabs = normalizeRestorableTabs(
      candidate.tabs.filter((tab): tab is RestorableTab =>
        Boolean(
          tab &&
            typeof tab === "object" &&
            "url" in tab &&
            isRestorableUrl(tab.url) &&
            "desktopId" in tab &&
            typeof tab.desktopId === "string" &&
            validDesktopIds.has(tab.desktopId) &&
            "active" in tab &&
            typeof tab.active === "boolean",
        ),
      ),
    );
    return { version: 1, tabs };
  } catch {
    return { version: 1, tabs: [] };
  }
}

export function buildRestorableSession(
  snapshot: BrowserSnapshot,
  tabDesktops: Readonly<Record<string, string>>,
  fallbackDesktopId: string,
): RestorableSession {
  const tabs = normalizeRestorableTabs(
    snapshot.tabs
      .filter((tab) => isRestorableUrl(tab.url) && !tab.error)
      .map((tab) => ({
        url: tab.url,
        desktopId: tabDesktops[tab.id] ?? fallbackDesktopId,
        active: tab.id === snapshot.activeTabId,
      })),
  );
  return { version: 1, tabs };
}

export function reconcileRestoredSession(
  snapshot: BrowserSnapshot,
  saved: RestorableSession,
  fallbackDesktopId: string,
): { assignments: Record<string, string>; active: RestorableTab | null; matchedCount: number } {
  const remaining = [...saved.tabs];
  const assignments: Record<string, string> = {};
  let active: RestorableTab | null = null;
  let matchedCount = 0;

  for (const tab of snapshot.tabs) {
    const savedIndex = remaining.findIndex((candidate) => candidate.url === tab.url);
    const matched = savedIndex >= 0 ? remaining.splice(savedIndex, 1)[0] : undefined;
    assignments[tab.id] = matched?.desktopId ?? fallbackDesktopId;
    if (matched) matchedCount += 1;
    if (tab.id === snapshot.activeTabId) {
      active = matched
        ? { ...matched, active: true }
        : { url: tab.url, desktopId: fallbackDesktopId, active: true };
    }
  }
  return { assignments, active, matchedCount };
}
