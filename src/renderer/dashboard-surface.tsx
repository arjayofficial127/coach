import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { BrowserState, CanvasPageSummary, SavedLinkRecord } from "../shared/contracts";
import { Icon } from "./icon";
import { RUNNABLE_APP_CATALOG, type RunnableAppId } from "./runnable-apps-model";

export interface DashboardClosedTab {
  tab: BrowserState;
  desktopId: string;
  closedAt: string;
}

export interface DashboardHistoryItem {
  id: string;
  title: string;
  url: string;
  visitedAt: string;
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

interface DashboardSurfaceProps {
  greeting: string;
  desktopName: string;
  openTabs: BrowserState[];
  activeTabId: string;
  recentlyClosed: DashboardClosedTab[];
  history: DashboardHistoryItem[];
  savedLinks: SavedLinkRecord[];
  canvasPages: CanvasPageSummary[];
  onOpenTab: (tab: BrowserState) => void;
  onNewTab: () => void;
  onRestoreClosed: (item: DashboardClosedTab) => void;
  onOpenUrl: (url: string) => void;
  onOpenApp: (id: RunnableAppId) => void;
  onOpenCanvas: (id: string) => void;
}

function displayHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function DashboardSurface({
  greeting,
  desktopName,
  openTabs,
  activeTabId,
  recentlyClosed,
  history,
  savedLinks,
  canvasPages,
  onOpenTab,
  onNewTab,
  onRestoreClosed,
  onOpenUrl,
  onOpenApp,
  onOpenCanvas,
}: DashboardSurfaceProps) {
  const initialPreferences = useMemo(readPreferences, []);
  const [customizing, setCustomizing] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState(activeTabId);
  const [headline, setHeadline] = useState(initialPreferences.headline);
  const [message, setMessage] = useState(initialPreferences.message);
  const [enabled, setEnabled] = useState(initialPreferences.enabled);
  const [order, setOrder] = useState(initialPreferences.order);
  const [highlightedUrls, setHighlightedUrls] = useState(initialPreferences.highlightedUrls);
  const selectedTab = openTabs.find((tab) => tab.id === selectedTabId) ?? openTabs[0] ?? null;

  useEffect(() => {
    localStorage.setItem(
      DASHBOARD_STORAGE_KEY,
      JSON.stringify({ headline, message, enabled, order, highlightedUrls }),
    );
  }, [enabled, headline, highlightedUrls, message, order]);

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

  const savedGroups = useMemo(() => {
    const groups = new Map<string, SavedLinkRecord[]>();
    for (const link of savedLinks) {
      const name = link.folder.trim() || "Unsorted";
      groups.set(name, [...(groups.get(name) ?? []), link]);
    }
    return [...groups.entries()];
  }, [savedLinks]);

  const toggleHighlight = (url: string) => {
    setHighlightedUrls((current) =>
      current.includes(url) ? current.filter((item) => item !== url) : [...current, url],
    );
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
        <span className="dashboard-widget-kicker">{greeting}</span>
        <h2>{headline}</h2>
        <p>{message}</p>
      </article>
    ),
    "recently-closed": (
      <article className="dashboard-widget">
        <header>
          <strong>Recently closed</strong>
          <span>{recentlyClosed.length}</span>
        </header>
        <div className="dashboard-list">
          {recentlyClosed.slice(0, 6).map((item) => (
            <button
              key={`${item.tab.id}-${item.closedAt}`}
              type="button"
              onClick={() => onRestoreClosed(item)}
            >
              <Icon name="reload" />
              <span>
                <strong>{item.tab.title || "New tab"}</strong>
                <small>{displayHost(item.tab.url)}</small>
              </span>
              <time>{shortTime(item.closedAt)}</time>
            </button>
          ))}
          {recentlyClosed.length === 0 && (
            <p className="dashboard-empty">Closed tabs will appear here.</p>
          )}
        </div>
      </article>
    ),
    history: (
      <article className="dashboard-widget">
        <header>
          <strong>History</strong>
          <span>{history.length}</span>
        </header>
        <div className="dashboard-list">
          {history.slice(0, 7).map((item) => (
            <button key={item.id} type="button" onClick={() => onOpenUrl(item.url)}>
              <Icon name="globe" />
              <span>
                <strong>{item.title}</strong>
                <small>{displayHost(item.url)}</small>
              </span>
              <time>{shortTime(item.visitedAt)}</time>
            </button>
          ))}
          {history.length === 0 && (
            <p className="dashboard-empty">Your browsing history is clear.</p>
          )}
        </div>
      </article>
    ),
    highlights: (
      <article className="dashboard-widget">
        <header>
          <strong>Highlights</strong>
          <span>{highlightedItems.length}</span>
        </header>
        <div className="dashboard-list">
          {highlightedItems.map((item) => (
            <button key={item.url} type="button" onClick={() => onOpenUrl(item.url)}>
              <Icon name="sparkle" />
              <span>
                <strong>{item.title}</strong>
                <small>{displayHost(item.url)}</small>
              </span>
              <em>★</em>
            </button>
          ))}
          {highlightedItems.length === 0 && (
            <p className="dashboard-empty">Star a tab or saved link to highlight it.</p>
          )}
        </div>
      </article>
    ),
    favorites: (
      <article className="dashboard-widget">
        <header>
          <strong>Favorites</strong>
          <span>{highlightedItems.length}</span>
        </header>
        <div className="dashboard-list">
          {highlightedItems.slice(0, 6).map((item) => (
            <button key={item.url} type="button" onClick={() => onOpenUrl(item.url)}>
              <Icon name="bookmark" />
              <span>
                <strong>{item.title}</strong>
                <small>{displayHost(item.url)}</small>
              </span>
              <em>★</em>
            </button>
          ))}
          {highlightedItems.length === 0 && (
            <p className="dashboard-empty">Favorites are your starred highlights.</p>
          )}
        </div>
      </article>
    ),
    "saved-links": (
      <article className="dashboard-widget dashboard-saved-widget">
        <header>
          <strong>Saved links</strong>
          <span>{savedLinks.length}</span>
        </header>
        <div className="dashboard-saved-groups">
          {savedGroups.slice(0, 4).map(([name, groupLinks]) => (
            <section key={name}>
              <header>
                <strong>{name}</strong>
                <small>{groupLinks.length} saved · Organized collection</small>
              </header>
              {groupLinks.slice(0, 4).map((link) => (
                <div className="dashboard-saved-link" key={link.id}>
                  <button type="button" onClick={() => onOpenUrl(link.url)}>
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
        <header>
          <strong>Runnable apps</strong>
          <span>{RUNNABLE_APP_CATALOG.length}</span>
        </header>
        <div className="dashboard-tile-grid">
          {RUNNABLE_APP_CATALOG.map((app) => (
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
        <header>
          <strong>Canvas pages</strong>
          <span>{canvasPages.length}</span>
        </header>
        <div className="dashboard-list">
          {canvasPages.slice(0, 6).map((page) => (
            <button key={page.id} type="button" onClick={() => onOpenCanvas(page.id)}>
              <Icon name="grid" />
              <span>
                <strong>{page.title}</strong>
                <small>{page.description || `${page.nodeCount} objects · ${page.folder}`}</small>
              </span>
            </button>
          ))}
          {canvasPages.length === 0 && (
            <p className="dashboard-empty">Canvas pages will appear here.</p>
          )}
        </div>
      </article>
    ),
  };

  return (
    <div className="trusted-surface dashboard-surface-v2">
      <header className="dashboard-v2-header">
        <div>
          <span className="eyebrow">Overview · {desktopName}</span>
          <h1>Your workspace at a glance.</h1>
        </div>
        <button type="button" onClick={() => setCustomizing((value) => !value)}>
          <Icon name="settings" /> Customize
        </button>
      </header>

      <section className="dashboard-open-tabs">
        <header>
          <strong>Open tabs</strong>
          <span>{openTabs.length}</span>
        </header>
        <div className="dashboard-tab-strip">
          {openTabs.map((tab) => (
            <button
              className={tab.id === selectedTab?.id ? "selected" : ""}
              key={tab.id}
              type="button"
              onClick={() => setSelectedTabId(tab.id)}
            >
              <span className="dashboard-tab-preview">
                <Icon name={tab.url === "about:blank" ? "sparkle" : "globe"} />
              </span>
              <strong>{tab.title || "New tab"}</strong>
              <small>{tab.url === "about:blank" ? "Ready to browse" : displayHost(tab.url)}</small>
            </button>
          ))}
          <button className="dashboard-new-tab" type="button" onClick={onNewTab}>
            <Icon name="plus" />
            <span>New tab</span>
          </button>
        </div>
      </section>

      {selectedTab && (
        <aside className="dashboard-tab-detail">
          <span>
            <Icon name="globe" />
          </span>
          <div>
            <strong>{selectedTab.title || "New tab"}</strong>
            <small>{selectedTab.url === "about:blank" ? "Blank tab" : selectedTab.url}</small>
          </div>
          <button
            type="button"
            onClick={() => toggleHighlight(selectedTab.url)}
            aria-label="Toggle highlight"
          >
            {highlightedUrls.includes(selectedTab.url) ? "★ Highlighted" : "☆ Highlight"}
          </button>
          <button type="button" onClick={() => onOpenTab(selectedTab)}>
            Open tab
          </button>
        </aside>
      )}

      <section className="dashboard-widget-grid">
        {order
          .filter((id) => enabled[id])
          .map((id) => (
            <div key={id} className={`dashboard-widget-slot ${id}`}>
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
          <strong>Show, hide, and reorder</strong>
          <div className="dashboard-customizer-list">
            {order.map((id, index) => (
              <div key={id}>
                <button
                  type="button"
                  aria-pressed={enabled[id]}
                  onClick={() => setEnabled((current) => ({ ...current, [id]: !current[id] }))}
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
