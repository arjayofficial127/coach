import type { TrustedSite } from "../shared/lattice-search";

export type LatticeResultKind = "tab" | "history" | "link" | "canvas" | "file" | "app";

export interface LatticeSearchDocument {
  id: string;
  kind: LatticeResultKind;
  label: string;
  detail: string;
  keywords: string;
  desktopId?: string;
  updatedAt?: string;
  contentMatch?: boolean;
}

export interface RankedLatticeDocument extends LatticeSearchDocument {
  score: number;
}

export interface StoredHistoryVisit {
  id: string;
  desktopId: string;
  title: string;
  url: string;
  visitedAt: string;
  siteIconDataUrl?: string | null;
}

export interface LearnedSite {
  domain: string;
  label: string;
  description: string;
  homeUrl: string;
  visitCount: number;
  lastVisitedAt: string;
  siteIconDataUrl?: string | null;
}

const HISTORY_LIMIT = 300;

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function recencyScore(updatedAt?: string): number {
  if (!updatedAt) return 0;
  const elapsed = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  const days = elapsed / 86_400_000;
  return Math.max(0, 48 - Math.floor(days * 4));
}

function relevanceScore(
  query: string,
  item: LatticeSearchDocument,
  currentDesktopId: string,
): number {
  const label = normalized(item.label);
  const detail = normalized(item.detail);
  const haystack = normalized(`${item.label} ${item.detail} ${item.keywords}`);
  const tokens = normalized(query).split(" ").filter(Boolean);
  let score = 0;
  const phrase = normalized(query);
  if (label === phrase) score += 1_000;
  else if (label.startsWith(phrase)) score += 620;
  else if (label.includes(phrase)) score += 360;
  else if (detail.includes(phrase)) score += 180;
  else if (haystack.includes(phrase)) score += 130;

  for (const token of tokens) {
    if (label.split(/\W+/).some((word) => word.startsWith(token))) score += 90;
    else if (label.includes(token)) score += 55;
    else if (detail.includes(token)) score += 32;
    else if (haystack.includes(token)) score += 18;
    else return -1;
  }
  if (item.desktopId === currentDesktopId) score += 150;
  if (item.contentMatch) score += 120;
  if (item.kind === "tab") score += 35;
  score += recencyScore(item.updatedAt);
  return score;
}

export function rankLatticeDocuments(
  query: string,
  items: readonly LatticeSearchDocument[],
  currentDesktopId: string,
  options: { everywhere?: boolean; limit?: number } = {},
): RankedLatticeDocument[] {
  const phrase = normalized(query);
  if (!phrase) return [];
  return items
    .filter((item) => options.everywhere || !item.desktopId || item.desktopId === currentDesktopId)
    .map((item) => ({ ...item, score: relevanceScore(phrase, item, currentDesktopId) }))
    .filter((item) => item.score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") ||
        left.label.localeCompare(right.label),
    )
    .slice(0, options.limit ?? 3);
}

function isHistoryVisit(value: unknown): value is StoredHistoryVisit {
  if (!value || typeof value !== "object") return false;
  const visit = value as Partial<StoredHistoryVisit>;
  if (
    typeof visit.id !== "string" ||
    typeof visit.desktopId !== "string" ||
    typeof visit.title !== "string" ||
    typeof visit.url !== "string" ||
    typeof visit.visitedAt !== "string"
  ) {
    return false;
  }
  try {
    const url = new URL(visit.url);
    return url.protocol === "https:" && Number.isFinite(Date.parse(visit.visitedAt));
  } catch {
    return false;
  }
}

export function parseStoredHistory(serialized: string | null): StoredHistoryVisit[] {
  if (!serialized) return [];
  try {
    const candidate = JSON.parse(serialized) as { version?: unknown; items?: unknown };
    if (candidate.version !== 1 || !Array.isArray(candidate.items)) return [];
    const byUrl = new Map<string, StoredHistoryVisit>();
    for (const value of candidate.items) {
      if (!isHistoryVisit(value)) continue;
      const visit = {
        ...value,
        title: value.title.trim().replace(/\s+/g, " ").slice(0, 240),
        siteIconDataUrl:
          typeof value.siteIconDataUrl === "string" &&
          value.siteIconDataUrl.startsWith("data:image/")
            ? value.siteIconDataUrl
            : null,
      };
      const existing = byUrl.get(visit.url);
      if (!existing || visit.visitedAt > existing.visitedAt) byUrl.set(visit.url, visit);
    }
    return [...byUrl.values()]
      .sort((left, right) => right.visitedAt.localeCompare(left.visitedAt))
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function serializeStoredHistory(items: readonly StoredHistoryVisit[]): string {
  return JSON.stringify({ version: 1, items: items.slice(0, HISTORY_LIMIT) });
}

function readableDomain(domain: string): string {
  const stem = domain.replace(/^www\./, "").split(".")[0] ?? domain;
  return stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function learnSitesFromHistory(
  history: readonly StoredHistoryVisit[],
  trustedSites: readonly TrustedSite[],
  limit = 24,
): LearnedSite[] {
  const trustedDomains = new Set(trustedSites.map((item) => item.domain.replace(/^www\./, "")));
  const learned = new Map<string, LearnedSite>();
  for (const visit of history) {
    let url: URL;
    try {
      url = new URL(visit.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const domain = url.hostname.replace(/^www\./, "");
    if (trustedDomains.has(domain)) continue;
    const existing = learned.get(domain);
    const latest = !existing || visit.visitedAt > existing.lastVisitedAt;
    learned.set(domain, {
      domain,
      label: latest
        ? visit.title.trim() || readableDomain(domain)
        : (existing?.label ?? readableDomain(domain)),
      description: "Frequently visited website",
      homeUrl: `${url.protocol}//${url.host}/`,
      visitCount: (existing?.visitCount ?? 0) + 1,
      lastVisitedAt: latest ? visit.visitedAt : (existing?.lastVisitedAt ?? visit.visitedAt),
      siteIconDataUrl: latest ? visit.siteIconDataUrl : existing?.siteIconDataUrl,
    });
  }
  return [...learned.values()]
    .map((item) => ({
      ...item,
      description: `${item.visitCount} visit${item.visitCount === 1 ? "" : "s"} · ${item.domain}`,
    }))
    .sort(
      (left, right) =>
        right.visitCount - left.visitCount || right.lastVisitedAt.localeCompare(left.lastVisitedAt),
    )
    .slice(0, limit);
}
