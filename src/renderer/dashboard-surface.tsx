import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { BrowserState, CanvasPageSummary, SavedLinkRecord } from "../shared/contracts";
import { Icon, type IconName } from "./icon";
import { RUNNABLE_APP_CATALOG, type RunnableAppId } from "./runnable-apps-model";

export interface DashboardClosedTab {
  tab: BrowserState;
  desktopId: string;
  closedAt: string;
}

export interface DashboardHistoryItem {
  id: string;
  desktopId: string;
  title: string;
  url: string;
  visitedAt: string;
  siteIconDataUrl?: string | null;
}

type DashboardWidgetId =
  | "message"
  | "recently-closed"
  | "history"
  | "highlights"
  | "favorites"
  | "saved-links"
  | "runnable-apps"
  | "canvas-pages";

type DashboardSectionId = "overview" | "open-tabs" | DashboardWidgetId;
type DashboardSearchScope = "titles" | "all";

const DEFAULT_ORDER: DashboardWidgetId[] = [
  "message",
  "recently-closed",
  "history",
  "highlights",
  "favorites",
  "saved-links",
  "runnable-apps",
  "canvas-pages",
];

const DASHBOARD_STORAGE_KEY = "coach.dashboard.v1";

interface DashboardPreferences {
  headline: string;
  message: string;
  enabled: Record<DashboardWidgetId, boolean>;
  order: DashboardWidgetId[];
  highlightedUrls: string[];
  pinnedTabIds: string[];
  tabOrder: string[];
  groupDescriptions: Record<string, string>;
  searchOpenTabContents: boolean;
  searchScope: DashboardSearchScope;
}

function defaultPreferences(): DashboardPreferences {
  return {
    headline: "Let’s focus on what matters.",
    message: "One meaningful next step. Everything else can wait.",
    enabled: Object.fromEntries(DEFAULT_ORDER.map((id) => [id, true])) as Record<
      DashboardWidgetId,
      boolean
    >,
    order: [...DEFAULT_ORDER],
    highlightedUrls: [],
    pinnedTabIds: [],
    tabOrder: [],
    groupDescriptions: {},
    searchOpenTabContents: true,
    searchScope: "all",
  };
}

function readPreferences(): DashboardPreferences {
  const fallback = defaultPreferences();
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DASHBOARD_STORAGE_KEY) ?? "null",
    ) as Partial<DashboardPreferences> | null;
    if (!parsed) return fallback;
    const parsedOrder = Array.isArray(parsed.order)
      ? parsed.order.filter((id): id is DashboardWidgetId =>
          DEFAULT_ORDER.includes(id as DashboardWidgetId),
        )
      : [];
    return {
      headline:
        typeof parsed.headline === "string" ? parsed.headline.slice(0, 120) : fallback.headline,
      message: typeof parsed.message === "string" ? parsed.message.slice(0, 280) : fallback.message,
      enabled: Object.fromEntries(
        DEFAULT_ORDER.map((id) => [id, parsed.enabled?.[id] ?? true]),
      ) as Record<DashboardWidgetId, boolean>,
      order: [...parsedOrder, ...DEFAULT_ORDER.filter((id) => !parsedOrder.includes(id))],
      highlightedUrls: Array.isArray(parsed.highlightedUrls)
        ? parsed.highlightedUrls
            .filter((url): url is string => typeof url === "string")
            .slice(0, 200)
        : [],
      pinnedTabIds: Array.isArray(parsed.pinnedTabIds)
        ? parsed.pinnedTabIds.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [],
      tabOrder: Array.isArray(parsed.tabOrder)
        ? parsed.tabOrder.filter((id): id is string => typeof id === "string").slice(0, 500)
        : [],
      groupDescriptions:
        parsed.groupDescriptions && typeof parsed.groupDescriptions === "object"
          ? Object.fromEntries(
              Object.entries(parsed.groupDescriptions)
                .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                .map(([name, description]) => [name.slice(0, 80), description.slice(0, 240)]),
            )
          : {},
      searchOpenTabContents: parsed.searchOpenTabContents ?? true,
      searchScope: parsed.searchScope === "titles" ? "titles" : "all",
    };
  } catch {
    return fallback;
  }
}

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  message: "Custom message",
  "recently-closed": "Recently closed",
  history: "History",
  highlights: "Highlights",
  favorites: "Favorites",
  "saved-links": "Saved links",
  "runnable-apps": "Runnable apps",
  "canvas-pages": "Canvas pages",
};

const SECTION_LABELS: Record<DashboardSectionId, string> = {
  overview: "Overview",
  "open-tabs": "Open tabs",
  ...WIDGET_LABELS,
};

const SECTION_ICONS: Record<DashboardSectionId, IconName> = {
  overview: "home",
  "open-tabs": "desktop",
  message: "edit",
  "recently-closed": "reload",
  history: "timer",
  highlights: "sparkle",
  favorites: "bookmark",
  "saved-links": "library",
  "runnable-apps": "grid",
  "canvas-pages": "folder",
};

const OVERVIEW_OPEN_TAB_LIMIT = 3;

interface DashboardSurfaceProps {
  greeting: string;
  desktopName: string;
  openTabs: BrowserState[];
  activeTabId: string;
  tabPreviews: Record<string, string>;
  tabPreviewStatuses: Record<string, "loading" | "ready" | "failed">;
  recentlyClosed: DashboardClosedTab[];
  history: DashboardHistoryItem[];
  savedLinks: SavedLinkRecord[];
  canvasPages: CanvasPageSummary[];
  onOpenTab: (tab: BrowserState) => void;
  onCloseTab: (tab: BrowserState) => void;
  onNewTab: () => void;
  onRestoreClosed: (item: DashboardClosedTab) => void;
  onOpenUrl: (url: string) => void;
  onOpenApp: (id: RunnableAppId) => void;
  onOpenCanvas: (id: string) => void;
  onSearchTabContents: (tabIds: string[], query: string) => Promise<string[]>;
}

function displayHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const DASHBOARD_SITE_ICONS_KEY = "coach.dashboard.site-icons.v1";

function domainKey(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function readSiteIcons(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(DASHBOARD_SITE_ICONS_KEY) ?? "{}") as unknown;
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

function SiteIcon({
  url,
  title,
  icons,
  explicitIcon,
}: {
  url: string;
  title: string;
  icons: Record<string, string>;
  explicitIcon?: string | null;
}) {
  const icon = explicitIcon || icons[domainKey(url)];
  return (
    <span className="dashboard-site-icon" aria-hidden="true">
      {icon ? <img src={icon} alt="" /> : <span>{(title.trim()[0] || "↗").toUpperCase()}</span>}
    </span>
  );
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function matchesSearch(query: string, fields: Array<string | number | null | undefined>) {
  if (!query) return true;
  return fields.some((field) =>
    String(field ?? "")
      .toLocaleLowerCase()
      .includes(query),
  );
}

export function DashboardSurface({
  greeting,
  desktopName,
  openTabs,
  activeTabId,
  tabPreviews,
  tabPreviewStatuses,
  recentlyClosed,
  history,
  savedLinks,
  canvasPages,
  onOpenTab,
  onCloseTab,
  onNewTab,
  onRestoreClosed,
  onOpenUrl,
  onOpenApp,
  onOpenCanvas,
  onSearchTabContents,
}: DashboardSurfaceProps) {
  const initialPreferences = useMemo(readPreferences, []);
  const [customizing, setCustomizing] = useState(false);
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<DashboardSectionId>("overview");
  const [tabViewMode, setTabViewMode] = useState<"grid" | "list">("grid");
  const [contentMatchedTabIds, setContentMatchedTabIds] = useState<string[]>([]);
  const [contentSearchPending, setContentSearchPending] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState(activeTabId);
  const [headline, setHeadline] = useState(initialPreferences.headline);
  const [message, setMessage] = useState(initialPreferences.message);
  const [enabled, setEnabled] = useState(initialPreferences.enabled);
  const [order, setOrder] = useState(initialPreferences.order);
  const [highlightedUrls, setHighlightedUrls] = useState(initialPreferences.highlightedUrls);
  const [pinnedTabIds, setPinnedTabIds] = useState(initialPreferences.pinnedTabIds);
  const [tabOrder, setTabOrder] = useState(initialPreferences.tabOrder);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [groupDescriptions, setGroupDescriptions] = useState(initialPreferences.groupDescriptions);
  const [siteIcons, setSiteIcons] = useState(readSiteIcons);
  const [searchOpenTabContents, setSearchOpenTabContents] = useState(
    initialPreferences.searchOpenTabContents,
  );
  const [searchScope, setSearchScope] = useState<DashboardSearchScope>(
    initialPreferences.searchScope,
  );
  const selectedTab = openTabs.find((tab) => tab.id === selectedTabId) ?? openTabs[0] ?? null;

  useEffect(() => {
    localStorage.setItem(
      DASHBOARD_STORAGE_KEY,
      JSON.stringify({
        headline,
        message,
        enabled,
        order,
        highlightedUrls,
        pinnedTabIds,
        tabOrder,
        groupDescriptions,
        searchOpenTabContents,
        searchScope,
      }),
    );
  }, [
    enabled,
    groupDescriptions,
    headline,
    highlightedUrls,
    pinnedTabIds,
    tabOrder,
    message,
    order,
    searchOpenTabContents,
    searchScope,
  ]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || !searchOpenTabContents) {
      setContentMatchedTabIds([]);
      setContentSearchPending(false);
      return;
    }
    let cancelled = false;
    setContentMatchedTabIds([]);
    setContentSearchPending(true);
    const timeout = window.setTimeout(() => {
      void onSearchTabContents(
        openTabs.map((tab) => tab.id),
        query,
      )
        .then((ids) => {
          if (!cancelled) setContentMatchedTabIds(ids);
        })
        .catch(() => {
          if (!cancelled) setContentMatchedTabIds([]);
        })
        .finally(() => {
          if (!cancelled) setContentSearchPending(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [onSearchTabContents, openTabs, searchOpenTabContents, searchQuery]);

  useEffect(() => {
    const discovered = [...openTabs, ...recentlyClosed.map((item) => item.tab), ...history]
      .map((item) => [domainKey(item.url), item.siteIconDataUrl] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1]));
    if (discovered.length === 0) return;
    setSiteIcons((current) => {
      const next = { ...current, ...Object.fromEntries(discovered) };
      localStorage.setItem(DASHBOARD_SITE_ICONS_KEY, JSON.stringify(next));
      return next;
    });
  }, [history, openTabs, recentlyClosed]);

  const highlightedItems = useMemo(() => {
    const candidates = [
      ...openTabs.map((tab) => ({ id: tab.id, title: tab.title || "New tab", url: tab.url })),
      ...savedLinks.map((link) => ({ id: link.id, title: link.title, url: link.url })),
    ];
    return candidates.filter(
      (item, index) =>
        highlightedUrls.includes(item.url) &&
        candidates.findIndex((entry) => entry.url === item.url) === index,
    );
  }, [highlightedUrls, openTabs, savedLinks]);

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const includeAllMetadata = searchScope === "all";
  const filteredOpenTabs = openTabs.filter(
    (tab) =>
      matchesSearch(normalizedQuery, [
        tab.title,
        includeAllMetadata ? tab.url : null,
        includeAllMetadata ? displayHost(tab.url) : null,
      ]) ||
      (searchOpenTabContents && contentMatchedTabIds.includes(tab.id)),
  );
  const orderedOpenTabs = useMemo(() => {
    const positions = new Map(tabOrder.map((id, index) => [id, index]));
    return [...filteredOpenTabs].sort((a, b) => {
      const pinnedDelta = Number(pinnedTabIds.includes(b.id)) - Number(pinnedTabIds.includes(a.id));
      if (pinnedDelta) return pinnedDelta;
      return (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    });
  }, [filteredOpenTabs, pinnedTabIds, tabOrder]);
  const filteredRecentlyClosed = recentlyClosed.filter((item) =>
    matchesSearch(normalizedQuery, [item.tab.title, includeAllMetadata ? item.tab.url : null]),
  );
  const filteredHistory = history.filter((item) =>
    matchesSearch(normalizedQuery, [item.title, includeAllMetadata ? item.url : null]),
  );
  const filteredHighlights = highlightedItems.filter((item) =>
    matchesSearch(normalizedQuery, [item.title, includeAllMetadata ? item.url : null]),
  );
  const filteredSavedLinks = savedLinks.filter((link) =>
    matchesSearch(normalizedQuery, [
      link.title,
      link.description,
      includeAllMetadata ? link.url : null,
      includeAllMetadata ? link.folder : null,
    ]),
  );
  const filteredRunnableApps = RUNNABLE_APP_CATALOG.filter((app) =>
    matchesSearch(normalizedQuery, [app.name, app.description, includeAllMetadata ? app.id : null]),
  );
  const filteredCanvasPages = canvasPages.filter((page) =>
    matchesSearch(normalizedQuery, [
      page.title,
      page.description,
      includeAllMetadata ? page.folder : null,
      includeAllMetadata ? page.nodeCount : null,
    ]),
  );

  const savedGroups = useMemo(() => {
    const groups = new Map<string, SavedLinkRecord[]>();
    for (const link of filteredSavedLinks) {
      const name = link.folder.trim() || "Unsorted";
      groups.set(name, [...(groups.get(name) ?? []), link]);
    }
    return [...groups.entries()];
  }, [filteredSavedLinks]);

  const sectionCounts: Record<Exclude<DashboardSectionId, "overview">, number> = {
    "open-tabs": filteredOpenTabs.length,
    message: matchesSearch(normalizedQuery, [headline, message]) ? 1 : 0,
    "recently-closed": filteredRecentlyClosed.length,
    history: filteredHistory.length,
    highlights: filteredHighlights.length,
    favorites: filteredHighlights.length,
    "saved-links": filteredSavedLinks.length,
    "runnable-apps": filteredRunnableApps.length,
    "canvas-pages": filteredCanvasPages.length,
  };
  const visibleSectionIds: DashboardSectionId[] = [
    "overview",
    "open-tabs",
    ...order.filter((id) => id !== "highlights" && enabled[id]),
  ];
  const expanded = activeSection !== "overview";
  const displayedOpenTabs = expanded
    ? orderedOpenTabs
    : orderedOpenTabs.slice(0, OVERVIEW_OPEN_TAB_LIMIT);

  const sectionHeader = (id: DashboardWidgetId, title: string, count: number) => (
    <header className="dashboard-section-header">
      <button type="button" onClick={() => setActiveSection(id)}>
        {title}
      </button>
      <div>
        <button type="button" onClick={() => setActiveSection(id)}>
          See all
        </button>
        <button type="button" onClick={() => setActiveSection(id)} aria-label={`See all ${title}`}>
          {count}
        </button>
      </div>
    </header>
  );

  const toggleHighlight = (url: string) => {
    setHighlightedUrls((current) =>
      current.includes(url) ? current.filter((item) => item !== url) : [...current, url],
    );
  };

  const togglePinned = (tabId: string) => {
    setPinnedTabIds((current) =>
      current.includes(tabId) ? current.filter((id) => id !== tabId) : [tabId, ...current],
    );
  };

  const moveTab = (targetId: string) => {
    if (!draggedTabId || draggedTabId === targetId) return;
    setTabOrder((current) => {
      const ids = [...new Set([...openTabs.map((tab) => tab.id), ...current])];
      const from = ids.indexOf(draggedTabId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = ids.splice(from, 1);
      if (moved) ids.splice(to, 0, moved);
      return ids;
    });
    setDraggedTabId(null);
  };

  const moveWidget = (id: DashboardWidgetId, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const sourceItem = next[index];
      const targetItem = next[target];
      if (!sourceItem || !targetItem) return current;
      next[index] = targetItem;
      next[target] = sourceItem;
      return next;
    });
  };

  const widgets: Record<DashboardWidgetId, ReactNode> = {
    message: (
      <article className="dashboard-widget dashboard-message-widget">
        {activeSection !== "overview" && sectionHeader("message", "Custom message", sectionCounts.message)}
        <span className="dashboard-widget-kicker">{greeting}</span>
        <h2>{headline}</h2>
        <p>{message}</p>
      </article>
    ),
    "recently-closed": (
      <article className="dashboard-widget">
        {sectionHeader("recently-closed", "Recently closed", sectionCounts["recently-closed"])}
        <div className="dashboard-list">
          {filteredRecentlyClosed.slice(0, expanded ? undefined : 6).map((item) => (
            <button
              key={`${item.tab.id}-${item.closedAt}`}
              type="button"
              onClick={() => onRestoreClosed(item)}
            >
              <SiteIcon
                url={item.tab.url}
                title={item.tab.title || "New tab"}
                icons={siteIcons}
                explicitIcon={item.tab.siteIconDataUrl}
              />
              <span>
                <strong>{item.tab.title || "New tab"}</strong>
                <small>{displayHost(item.tab.url)}</small>
              </span>
              <time>{shortTime(item.closedAt)}</time>
            </button>
          ))}
          {filteredRecentlyClosed.length === 0 && (
            <p className="dashboard-empty">Closed tabs will appear here.</p>
          )}
        </div>
      </article>
    ),
    history: (
      <article className="dashboard-widget">
        {sectionHeader("history", "History", sectionCounts.history)}
        <div className="dashboard-list">
          {filteredHistory.slice(0, expanded ? undefined : 7).map((item) => (
            <button key={item.id} type="button" onClick={() => onOpenUrl(item.url)}>
              <SiteIcon
                url={item.url}
                title={item.title}
                icons={siteIcons}
                explicitIcon={item.siteIconDataUrl}
              />
              <span>
                <strong>{item.title}</strong>
                <small>{displayHost(item.url)}</small>
              </span>
              <time>{shortTime(item.visitedAt)}</time>
            </button>
          ))}
          {filteredHistory.length === 0 && (
            <p className="dashboard-empty">Your browsing history is clear.</p>
          )}
        </div>
      </article>
    ),
    highlights: (
      <article className="dashboard-widget">
        {sectionHeader("highlights", "Highlights", sectionCounts.highlights)}
        <div className="dashboard-list">
          {filteredHighlights.slice(0, expanded ? undefined : 6).map((item) => (
            <button key={item.url} type="button" onClick={() => onOpenUrl(item.url)}>
              <SiteIcon url={item.url} title={item.title} icons={siteIcons} />
              <span>
                <strong>{item.title}</strong>
                <small>{displayHost(item.url)}</small>
              </span>
              <em>★</em>
            </button>
          ))}
          {filteredHighlights.length === 0 && (
            <p className="dashboard-empty">Star a tab or saved link to highlight it.</p>
          )}
        </div>
      </article>
    ),
    favorites: (
      <article className="dashboard-widget">
        {sectionHeader("favorites", "Favorites", sectionCounts.favorites)}
        <div className="dashboard-list">
          {filteredHighlights.slice(0, expanded ? undefined : 6).map((item) => (
            <button key={item.url} type="button" onClick={() => onOpenUrl(item.url)}>
              <SiteIcon url={item.url} title={item.title} icons={siteIcons} />
              <span>
                <strong>{item.title}</strong>
                <small>{displayHost(item.url)}</small>
              </span>
              <em>★</em>
            </button>
          ))}
          {filteredHighlights.length === 0 && (
            <p className="dashboard-empty">Favorites are your starred highlights.</p>
          )}
        </div>
      </article>
    ),
    "saved-links": (
      <article className="dashboard-widget dashboard-saved-widget">
        {sectionHeader("saved-links", "Saved links", sectionCounts["saved-links"])}
        <div className="dashboard-saved-groups">
          {savedGroups.slice(0, expanded ? undefined : 4).map(([name, groupLinks]) => (
            <section key={name}>
              <header>
                <strong>{name}</strong>
                <small>
                  {groupLinks.length} saved · {groupDescriptions[name] || "Organized collection"}
                </small>
              </header>
              {groupLinks.slice(0, expanded ? undefined : 4).map((link) => (
                <div className="dashboard-saved-link" key={link.id}>
                  <button type="button" onClick={() => onOpenUrl(link.url)}>
                    <SiteIcon url={link.url} title={link.title} icons={siteIcons} />
                    <span>
                      <strong>{link.title}</strong>
                      <small>{link.description || displayHost(link.url)}</small>
                    </span>
                  </button>
                  <button
                    className={
                      highlightedUrls.includes(link.url)
                        ? "dashboard-star active"
                        : "dashboard-star"
                    }
                    type="button"
                    aria-label={`Highlight ${link.title}`}
                    onClick={() => toggleHighlight(link.url)}
                  >
                    ★
                  </button>
                </div>
              ))}
            </section>
          ))}
          {savedGroups.length === 0 && (
            <p className="dashboard-empty">Saved links and their descriptions will appear here.</p>
          )}
        </div>
      </article>
    ),
    "runnable-apps": (
      <article className="dashboard-widget">
        {sectionHeader("runnable-apps", "Runnable apps", sectionCounts["runnable-apps"])}
        <div className="dashboard-tile-grid">
          {filteredRunnableApps.map((app) => (
            <button key={app.id} type="button" onClick={() => onOpenApp(app.id)}>
              <Icon
                name={
                  app.id === "pomodoro" ? "timer" : app.id === "wealth-lab" ? "globe" : "sparkle"
                }
              />
              <span>
                <strong>{app.name}</strong>
                <small>{app.description}</small>
              </span>
            </button>
          ))}
        </div>
      </article>
    ),
    "canvas-pages": (
      <article className="dashboard-widget">
        {sectionHeader("canvas-pages", "Canvas pages", sectionCounts["canvas-pages"])}
        <div className="dashboard-list">
          {filteredCanvasPages.slice(0, expanded ? undefined : 6).map((page) => (
            <button key={page.id} type="button" onClick={() => onOpenCanvas(page.id)}>
              <Icon name="grid" />
              <span>
                <strong>{page.title}</strong>
                <small>{page.description || `${page.nodeCount} objects · ${page.folder}`}</small>
              </span>
            </button>
          ))}
          {filteredCanvasPages.length === 0 && (
            <p className="dashboard-empty">Canvas pages will appear here.</p>
          )}
        </div>
      </article>
    ),
  };

  return (
    <div className="trusted-surface dashboard-surface-v2">
      <header className="dashboard-v2-header">
        <div className="dashboard-hero-content">
          <span className="eyebrow dashboard-eyebrow">
            <Icon name="desktop" />
            <span>Overview · {desktopName}</span>
          </span>
          {activeSection === "overview" && enabled.message ? (
            widgets.message
          ) : (
            <h1>Your workspace at a glance.</h1>
          )}
        </div>
        <button type="button" onClick={() => setCustomizing((value) => !value)}>
          <Icon name="settings" /> Customize
        </button>
      </header>

      <div className="dashboard-global-search">
        <Icon name="search" />
        <input
          value={searchQuery}
          maxLength={200}
          placeholder={`Search ${desktopName}…`}
          aria-label={`Search ${desktopName}`}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {contentSearchPending && <span className="dashboard-searching">Searching pages…</span>}
        <button
          type="button"
          aria-label="Search filters"
          aria-expanded={searchSettingsOpen}
          onClick={() => setSearchSettingsOpen((value) => !value)}
        >
          <Icon name="filter" />
        </button>
        {searchSettingsOpen && (
          <aside className="dashboard-search-settings">
            <strong>Search settings</strong>
            <small>Choose what to include in this desktop&apos;s results.</small>
            <label>
              <input
                type="checkbox"
                checked={searchOpenTabContents}
                onChange={(event) => setSearchOpenTabContents(event.target.checked)}
              />
              <span>
                <strong>Search inside open tabs</strong>
                <small>Checks text currently rendered inside webpages.</small>
              </span>
            </label>
            <fieldset>
              <legend>Search depth</legend>
              <label>
                <input
                  type="radio"
                  name="dashboard-search-scope"
                  checked={searchScope === "titles"}
                  onChange={() => setSearchScope("titles")}
                />
                <span>
                  <strong>Search titles and descriptions only</strong>
                  <small>Keeps matching focused on human-readable labels.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="dashboard-search-scope"
                  checked={searchScope === "all"}
                  onChange={() => setSearchScope("all")}
                />
                <span>
                  <strong>Search all content</strong>
                  <small>Also searches URLs, folders, IDs, and object details.</small>
                </span>
              </label>
            </fieldset>
          </aside>
        )}
      </div>

      <nav className="dashboard-section-tabs" aria-label="Dashboard sections">
        {visibleSectionIds.map((id) => {
          const count = id === "overview" ? visibleSectionIds.length - 1 : sectionCounts[id];
          return (
            <button
              key={id}
              type="button"
              className={activeSection === id ? "active" : ""}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => setActiveSection(id)}
            >
              <Icon name={SECTION_ICONS[id]} />
              <span>{SECTION_LABELS[id]}</span>
              <em>{count}</em>
            </button>
          );
        })}
      </nav>

      {(activeSection === "overview" || activeSection === "open-tabs") && (
        <section className="dashboard-open-tabs">
          <header className="dashboard-section-header">
            <button type="button" onClick={() => setActiveSection("open-tabs")}>
              Open tabs
            </button>
            <div className="dashboard-tab-tools">
              <button
                className="dashboard-new-tab-header"
                type="button"
                onClick={onNewTab}
                aria-label="Open new tab"
              >
                <Icon name="plus" />
              </button>
              <div className="dashboard-tab-view-toggle">
                <button
                  type="button"
                  className={tabViewMode === "grid" ? "active" : ""}
                  aria-label="Grid view"
                  aria-pressed={tabViewMode === "grid"}
                  onClick={() => setTabViewMode("grid")}
                >
                  <Icon name="grid" />
                </button>
                <button
                  type="button"
                  className={tabViewMode === "list" ? "active" : ""}
                  aria-label="List view"
                  aria-pressed={tabViewMode === "list"}
                  onClick={() => setTabViewMode("list")}
                >
                  <Icon name="library" />
                </button>
              </div>
              <button type="button" onClick={() => setActiveSection("open-tabs")}>
                See all
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("open-tabs")}
                aria-label="See all open tabs"
              >
                {sectionCounts["open-tabs"]}
              </button>
            </div>
          </header>
          <div className={tabViewMode === "grid" ? "dashboard-tab-strip" : "dashboard-tab-list"}>
            {displayedOpenTabs.map((tab) => (
              <button
                className={`dashboard-tab-card ${tab.id === selectedTab?.id ? "selected" : ""}`}
                key={tab.id}
                type="button"
                draggable
                onDragStart={() => setDraggedTabId(tab.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveTab(tab.id)}
                onClick={() => {
                  setSelectedTabId(tab.id);
                  void onOpenTab(tab);
                }}
              >
                <span className="dashboard-tab-preview" data-live-tab-preview={tab.id}>
                  {tabPreviews[tab.id] ? (
                    <img src={tabPreviews[tab.id]} alt="" />
                  ) : tabPreviewStatuses[tab.id] === "loading" ? (
                    <span className="dashboard-preview-state loading">Loading preview…</span>
                  ) : tabPreviewStatuses[tab.id] === "failed" ? (
                    <span className="dashboard-preview-state failed">Preview unavailable</span>
                  ) : (
                    <Icon name={tab.url === "about:blank" ? "sparkle" : "globe"} />
                  )}
                </span>
                <strong className="dashboard-tab-name">
                  <SiteIcon
                    url={tab.url}
                    title={tab.title || "New tab"}
                    icons={siteIcons}
                    explicitIcon={tab.siteIconDataUrl}
                  />
                  <span>{tab.title || "New tab"}</span>
                </strong>
                <small>
                  {tab.url === "about:blank" ? "Ready to browse" : displayHost(tab.url)}
                </small>
                <span className="dashboard-tab-actions">
                  <span
                    role="button"
                    tabIndex={0}
                    className="dashboard-tab-action"
                    aria-label={pinnedTabIds.includes(tab.id) ? "Unpin tab" : "Pin tab"}
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePinned(tab.id);
                    }}
                  >
                    <Icon name="bookmark" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="dashboard-tab-action"
                    aria-label={highlightedUrls.includes(tab.url) ? "Remove favorite" : "Add favorite"}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleHighlight(tab.url);
                    }}
                  >
                    {highlightedUrls.includes(tab.url) ? "★" : "☆"}
                  </span>
                  <span className="dashboard-tab-drag" aria-label="Drag to reorder">
                    <Icon name="move" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="dashboard-tab-action"
                    aria-label="Open tab"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenTab(tab);
                    }}
                  >
                    <Icon name="arrow-right" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="dashboard-tab-action"
                    aria-label="Close tab"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab);
                    }}
                  >
                    <Icon name="close" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-widget-grid">
        {order
          .filter(
            (id) =>
              id !== "highlights" &&
              !(id === "message" && activeSection === "overview") &&
              enabled[id] &&
              (activeSection === "overview"
                ? !normalizedQuery || sectionCounts[id] > 0
                : activeSection === id),
          )
          .map((id) => (
            <div
              key={id}
              className={`dashboard-widget-slot ${id}${activeSection === id ? " single-section" : ""}`}
            >
              {widgets[id]}
            </div>
          ))}
      </section>

      {customizing && (
        <aside className="dashboard-customizer" aria-label="Customize dashboard">
          <header>
            <strong>Customize dashboard</strong>
            <button type="button" onClick={() => setCustomizing(false)}>
              <Icon name="close" />
            </button>
          </header>
          <label>
            Headline
            <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
          </label>
          <label>
            Supporting text
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          {savedGroups.length > 0 && (
            <section className="dashboard-group-editor">
              <strong>Saved-link group descriptions</strong>
              {savedGroups.map(([name]) => (
                <label key={name}>
                  {name}
                  <input
                    value={groupDescriptions[name] ?? ""}
                    maxLength={240}
                    placeholder="Describe what belongs in this group"
                    onChange={(event) =>
                      setGroupDescriptions((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </section>
          )}
          <strong>Show, hide, and reorder</strong>
          <div className="dashboard-customizer-list">
            {order.map((id, index) => (
              <div key={id}>
                <button
                  type="button"
                  aria-pressed={enabled[id]}
                  onClick={() => {
                    if (activeSection === id && enabled[id]) setActiveSection("overview");
                    setEnabled((current) => ({ ...current, [id]: !current[id] }));
                  }}
                >
                  {enabled[id] ? "On" : "Off"}
                </button>
                <span>{WIDGET_LABELS[id]}</span>
                <button type="button" disabled={index === 0} onClick={() => moveWidget(id, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === order.length - 1}
                  onClick={() => moveWidget(id, 1)}
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
