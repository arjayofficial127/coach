export interface FaviconCandidate {
  url: string;
  type: string;
  size: number;
  score: number;
}

const ATTRIBUTE_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attributes(tag: string) {
  const values = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase();
    if (!name || name === "link" || name === "base") continue;
    values.set(name, decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return values;
}

function declaredSize(value: string) {
  const sizes = [...value.matchAll(/(\d+)\s*x\s*(\d+)/gi)]
    .map((match) => Math.max(Number(match[1]), Number(match[2])))
    .filter((size) => Number.isFinite(size) && size > 0);
  return sizes.length > 0 ? Math.min(...sizes) : 0;
}

function formatPenalty(url: string, type: string) {
  const normalizedType = type.toLowerCase();
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (normalizedType.includes("png") || pathname.endsWith(".png")) return 0;
  if (/jpe?g/.test(normalizedType) || /\.jpe?g$/.test(pathname)) return 20;
  if (normalizedType.includes("webp") || pathname.endsWith(".webp")) return 40;
  if (normalizedType.includes("svg") || pathname.endsWith(".svg")) return 60;
  if (normalizedType.includes("icon") || pathname.endsWith(".ico")) return 400;
  return 100;
}

function sizePenalty(size: number) {
  if (!size) return 80;
  if (size === 32) return 0;
  return size > 32 ? size - 32 : 120 + (32 - size);
}

function resolveIconUrl(value: string, baseUrl: string) {
  if (/^data:image\//i.test(value)) return value;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function rankFaviconUrls(urls: string[]): FaviconCandidate[] {
  return urls
    .map((url) => ({
      url,
      type: "",
      size: 0,
      score: formatPenalty(url, "") + sizePenalty(0),
    }))
    .filter((candidate) => /^(?:https?:\/\/|data:image\/)/i.test(candidate.url))
    .sort((left, right) => left.score - right.score);
}

export function discoverFaviconCandidates(html: string, pageUrl: string): FaviconCandidate[] {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0];
  const baseHref = baseTag ? attributes(baseTag).get("href") : undefined;
  const baseUrl = baseHref ? resolveIconUrl(baseHref, pageUrl) || pageUrl : pageUrl;
  const candidates = new Map<string, FaviconCandidate>();

  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const values = attributes(tag[0]);
    const rel = (values.get("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const isStandardIcon = rel.includes("icon");
    const isTouchIcon = rel.some((value) =>
      ["apple-touch-icon", "apple-touch-icon-precomposed"].includes(value),
    );
    if (!isStandardIcon && !isTouchIcon) continue;
    const url = resolveIconUrl(values.get("href") ?? "", baseUrl);
    if (!url) continue;
    const type = values.get("type") ?? "";
    const size = declaredSize(values.get("sizes") ?? "");
    const score = (isStandardIcon ? 0 : 1_000) + formatPenalty(url, type) + sizePenalty(size);
    const existing = candidates.get(url);
    if (!existing || score < existing.score) candidates.set(url, { url, type, size, score });
  }

  try {
    const fallback = new URL("/favicon.ico", pageUrl).toString();
    if (!candidates.has(fallback)) {
      candidates.set(fallback, { url: fallback, type: "image/x-icon", size: 0, score: 10_000 });
    }
  } catch {
    // The caller already validates page URLs; malformed direct calls simply have no fallback.
  }

  return [...candidates.values()].sort((left, right) => left.score - right.score).slice(0, 16);
}
