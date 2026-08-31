export const SEARCH_PROVIDER_IDS = ["google", "duckduckgo", "brave", "bing"] as const;

export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export interface SearchProviderDefinition {
  id: SearchProviderId;
  name: string;
  description: string;
  searchUrl: string;
}

export const SEARCH_PROVIDERS: readonly SearchProviderDefinition[] = [
  {
    id: "google",
    name: "Google",
    description: "Familiar results from Google Search.",
    searchUrl: "https://www.google.com/search?q={query}",
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    description: "Web search with a stronger privacy focus.",
    searchUrl: "https://duckduckgo.com/?q={query}",
  },
  {
    id: "brave",
    name: "Brave Search",
    description: "Independent web search from Brave.",
    searchUrl: "https://search.brave.com/search?q={query}",
  },
  {
    id: "bing",
    name: "Bing",
    description: "Web search from Microsoft.",
    searchUrl: "https://www.bing.com/search?q={query}",
  },
] as const;

export interface TrustedSite {
  id: string;
  name: string;
  domain: string;
  description: string;
  aliases: readonly string[];
  homeUrl: string;
  searchUrl?: string;
}

type SiteSeed = readonly [
  id: string,
  name: string,
  domain: string,
  description: string,
  aliases?: readonly string[],
  searchUrl?: string,
];

const site = ([id, name, domain, description, aliases = [], searchUrl]: SiteSeed): TrustedSite => ({
  id,
  name,
  domain,
  description,
  aliases: [name.toLowerCase(), ...aliases],
  homeUrl: `https://${domain}/`,
  searchUrl,
});

// Curated locally so well-known names always resolve to a trusted domain before
// learned history entries are considered. Search templates are intentionally
// limited to stable, public HTTPS routes; every other site falls back to a
// provider-side site search.
export const TRUSTED_SITES: readonly TrustedSite[] = [
  site([
    "google",
    "Google",
    "www.google.com",
    "Search the web",
    ["google search"],
    "https://www.google.com/search?q={query}",
  ]),
  site([
    "youtube",
    "YouTube",
    "www.youtube.com",
    "Watch and search videos",
    ["yt"],
    "https://www.youtube.com/results?search_query={query}",
  ]),
  site([
    "gmail",
    "Gmail",
    "mail.google.com",
    "Read and send email",
    ["google mail", "mail"],
    "https://mail.google.com/mail/u/0/#search/{query}",
  ]),
  site(["drive", "Google Drive", "drive.google.com", "Open cloud files", ["drive", "gdrive"]]),
  site([
    "pinterest",
    "Pinterest",
    "www.pinterest.com",
    "Find and save visual ideas",
    ["pins"],
    "https://www.pinterest.com/search/pins/?q={query}",
  ]),
  site([
    "linkedin",
    "LinkedIn",
    "www.linkedin.com",
    "Professional network and jobs",
    ["linked in"],
    "https://www.linkedin.com/search/results/all/?keywords={query}",
  ]),
  site([
    "facebook",
    "Facebook",
    "www.facebook.com",
    "Social network",
    ["fb"],
    "https://www.facebook.com/search/top?q={query}",
  ]),
  site([
    "instagram",
    "Instagram",
    "www.instagram.com",
    "Photos, reels, and messages",
    ["ig", "insta"],
  ]),
  site([
    "x",
    "X",
    "x.com",
    "Posts and live conversations",
    ["twitter"],
    "https://x.com/search?q={query}&src=typed_query",
  ]),
  site([
    "reddit",
    "Reddit",
    "www.reddit.com",
    "Communities and discussions",
    [],
    "https://www.reddit.com/search/?q={query}",
  ]),
  site([
    "wikipedia",
    "Wikipedia",
    "en.wikipedia.org",
    "Open encyclopedia",
    ["wiki"],
    "https://en.wikipedia.org/w/index.php?search={query}",
  ]),
  site([
    "amazon",
    "Amazon",
    "www.amazon.com",
    "Shop products online",
    [],
    "https://www.amazon.com/s?k={query}",
  ]),
  site([
    "ebay",
    "eBay",
    "www.ebay.com",
    "Buy and sell products",
    [],
    "https://www.ebay.com/sch/i.html?_nkw={query}",
  ]),
  site([
    "github",
    "GitHub",
    "github.com",
    "Code repositories and collaboration",
    ["git hub"],
    "https://github.com/search?q={query}",
  ]),
  site([
    "stackoverflow",
    "Stack Overflow",
    "stackoverflow.com",
    "Programming questions and answers",
    ["stack overflow", "so"],
    "https://stackoverflow.com/search?q={query}",
  ]),
  site([
    "tiktok",
    "TikTok",
    "www.tiktok.com",
    "Short videos and creators",
    ["tik tok"],
    "https://www.tiktok.com/search?q={query}",
  ]),
  site([
    "netflix",
    "Netflix",
    "www.netflix.com",
    "Stream films and series",
    [],
    "https://www.netflix.com/search?q={query}",
  ]),
  site([
    "spotify",
    "Spotify",
    "open.spotify.com",
    "Music, podcasts, and audiobooks",
    [],
    "https://open.spotify.com/search/{query}",
  ]),
  site(["apple", "Apple", "www.apple.com", "Apple products and support"]),
  site(["microsoft", "Microsoft", "www.microsoft.com", "Microsoft products and services", ["ms"]]),
  site([
    "bing",
    "Bing",
    "www.bing.com",
    "Search the web with Bing",
    [],
    "https://www.bing.com/search?q={query}",
  ]),
  site([
    "duckduckgo",
    "DuckDuckGo",
    "duckduckgo.com",
    "Privacy-focused web search",
    ["ddg", "duck duck go"],
    "https://duckduckgo.com/?q={query}",
  ]),
  site([
    "brave",
    "Brave Search",
    "search.brave.com",
    "Independent web search",
    ["brave"],
    "https://search.brave.com/search?q={query}",
  ]),
  site([
    "yahoo",
    "Yahoo",
    "www.yahoo.com",
    "Search, mail, and news",
    [],
    "https://search.yahoo.com/search?p={query}",
  ]),
  site(["chatgpt", "ChatGPT", "chatgpt.com", "AI assistant from OpenAI", ["chat gpt"]]),
  site(["openai", "OpenAI", "openai.com", "OpenAI products and research", ["open ai"]]),
  site(["claude", "Claude", "claude.ai", "AI assistant from Anthropic"]),
  site(["gemini", "Gemini", "gemini.google.com", "Google AI assistant", ["google gemini"]]),
  site([
    "copilot",
    "Microsoft Copilot",
    "copilot.microsoft.com",
    "Microsoft AI assistant",
    ["ms copilot"],
  ]),
  site([
    "perplexity",
    "Perplexity",
    "www.perplexity.ai",
    "AI-powered answers and research",
    [],
    "https://www.perplexity.ai/search?q={query}",
  ]),
  site(["canva", "Canva", "www.canva.com", "Create visual designs"]),
  site(["figma", "Figma", "www.figma.com", "Collaborative interface design"]),
  site(["notion", "Notion", "www.notion.so", "Notes, documents, and projects"]),
  site(["trello", "Trello", "trello.com", "Visual boards and task planning"]),
  site(["asana", "Asana", "app.asana.com", "Team projects and tasks"]),
  site(["slack", "Slack", "app.slack.com", "Team messages and collaboration"]),
  site(["zoom", "Zoom", "zoom.us", "Video meetings and calls"]),
  site([
    "teams",
    "Microsoft Teams",
    "teams.microsoft.com",
    "Team meetings and collaboration",
    ["teams", "ms teams"],
  ]),
  site(["discord", "Discord", "discord.com", "Community chat and voice"]),
  site(["telegram", "Telegram", "web.telegram.org", "Private messaging"]),
  site(["whatsapp", "WhatsApp", "web.whatsapp.com", "Messages and calls", ["whats app"]]),
  site(["dropbox", "Dropbox", "www.dropbox.com", "Cloud files and sharing"]),
  site(["onedrive", "OneDrive", "onedrive.live.com", "Microsoft cloud files", ["one drive"]]),
  site(["box", "Box", "app.box.com", "Cloud content management"]),
  site(["icloud", "iCloud", "www.icloud.com", "Apple cloud services", ["i cloud"]]),
  site(["docs", "Google Docs", "docs.google.com", "Create and edit documents", ["docs", "gdocs"]]),
  site([
    "sheets",
    "Google Sheets",
    "sheets.google.com",
    "Create and edit spreadsheets",
    ["sheets", "gsheets"],
  ]),
  site([
    "calendar",
    "Google Calendar",
    "calendar.google.com",
    "Calendar and scheduling",
    ["calendar", "gcal"],
  ]),
  site(["photos", "Google Photos", "photos.google.com", "Photos and albums", ["photos"]]),
  site([
    "maps",
    "Google Maps",
    "maps.google.com",
    "Maps, places, and directions",
    ["maps", "gmap"],
    "https://www.google.com/maps/search/{query}",
  ]),
  site(["outlook", "Outlook", "outlook.live.com", "Microsoft email and calendar", ["hotmail"]]),
  site([
    "microsoft365",
    "Microsoft 365",
    "www.microsoft365.com",
    "Microsoft productivity apps",
    ["office", "office 365", "m365"],
  ]),
  site(["wordpress", "WordPress", "wordpress.com", "Build and manage websites", ["wp"]]),
  site([
    "medium",
    "Medium",
    "medium.com",
    "Articles and publications",
    [],
    "https://medium.com/search?q={query}",
  ]),
  site([
    "substack",
    "Substack",
    "substack.com",
    "Newsletters and independent writing",
    [],
    "https://substack.com/search/{query}",
  ]),
  site([
    "quora",
    "Quora",
    "www.quora.com",
    "Questions and community answers",
    [],
    "https://www.quora.com/search?q={query}",
  ]),
  site([
    "tumblr",
    "Tumblr",
    "www.tumblr.com",
    "Blogs and creative communities",
    [],
    "https://www.tumblr.com/search/{query}",
  ]),
  site(["blogger", "Blogger", "www.blogger.com", "Create and manage blogs"]),
  site([
    "twitch",
    "Twitch",
    "www.twitch.tv",
    "Live streams and communities",
    [],
    "https://www.twitch.tv/search?term={query}",
  ]),
  site([
    "vimeo",
    "Vimeo",
    "vimeo.com",
    "Professional video hosting",
    [],
    "https://vimeo.com/search?q={query}",
  ]),
  site([
    "dailymotion",
    "Dailymotion",
    "www.dailymotion.com",
    "Online videos",
    ["daily motion"],
    "https://www.dailymotion.com/search/{query}",
  ]),
  site([
    "soundcloud",
    "SoundCloud",
    "soundcloud.com",
    "Music and audio creators",
    ["sound cloud"],
    "https://soundcloud.com/search?q={query}",
  ]),
  site(["applemusic", "Apple Music", "music.apple.com", "Music from Apple", ["apple music"]]),
  site([
    "goodreads",
    "Goodreads",
    "www.goodreads.com",
    "Books, reviews, and reading lists",
    ["good reads"],
    "https://www.goodreads.com/search?q={query}",
  ]),
  site([
    "imdb",
    "IMDb",
    "www.imdb.com",
    "Films, series, and cast information",
    [],
    "https://www.imdb.com/find/?q={query}",
  ]),
  site([
    "rottentomatoes",
    "Rotten Tomatoes",
    "www.rottentomatoes.com",
    "Film and TV reviews",
    ["rotten tomatoes", "rt"],
    "https://www.rottentomatoes.com/search?search={query}",
  ]),
  site([
    "disneyplus",
    "Disney+",
    "www.disneyplus.com",
    "Stream Disney entertainment",
    ["disney plus"],
  ]),
  site([
    "primevideo",
    "Prime Video",
    "www.primevideo.com",
    "Stream Amazon films and series",
    ["prime video"],
    "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}",
  ]),
  site(["hulu", "Hulu", "www.hulu.com", "Stream films and television"]),
  site(["max", "Max", "www.max.com", "Stream HBO and Warner Bros.", ["hbo max"]]),
  site([
    "etsy",
    "Etsy",
    "www.etsy.com",
    "Handmade and creative products",
    [],
    "https://www.etsy.com/search?q={query}",
  ]),
  site([
    "walmart",
    "Walmart",
    "www.walmart.com",
    "Shop everyday products",
    [],
    "https://www.walmart.com/search?q={query}",
  ]),
  site([
    "target",
    "Target",
    "www.target.com",
    "Shop Target online",
    [],
    "https://www.target.com/s?searchTerm={query}",
  ]),
  site([
    "aliexpress",
    "AliExpress",
    "www.aliexpress.com",
    "Global online marketplace",
    ["ali express"],
    "https://www.aliexpress.com/wholesale?SearchText={query}",
  ]),
  site([
    "temu",
    "Temu",
    "www.temu.com",
    "Online marketplace",
    [],
    "https://www.temu.com/search_result.html?search_key={query}",
  ]),
  site([
    "shopee",
    "Shopee",
    "shopee.ph",
    "Online shopping in the Philippines",
    [],
    "https://shopee.ph/search?keyword={query}",
  ]),
  site([
    "lazada",
    "Lazada",
    "www.lazada.com.ph",
    "Online shopping in the Philippines",
    [],
    "https://www.lazada.com.ph/catalog/?q={query}",
  ]),
  site(["booking", "Booking.com", "www.booking.com", "Hotels and travel stays", ["booking com"]]),
  site(["airbnb", "Airbnb", "www.airbnb.com", "Homes and travel stays", ["air bnb"]]),
  site([
    "tripadvisor",
    "Tripadvisor",
    "www.tripadvisor.com",
    "Travel reviews and planning",
    ["trip advisor"],
    "https://www.tripadvisor.com/Search?q={query}",
  ]),
  site(["expedia", "Expedia", "www.expedia.com", "Flights, hotels, and travel"]),
  site(["agoda", "Agoda", "www.agoda.com", "Hotels and travel stays"]),
  site([
    "skyscanner",
    "Skyscanner",
    "www.skyscanner.com",
    "Compare flights and travel",
    ["sky scanner"],
  ]),
  site(["grab", "Grab", "www.grab.com", "Rides, food, and deliveries"]),
  site(["foodpanda", "foodpanda", "www.foodpanda.ph", "Food and grocery delivery", ["food panda"]]),
  site([
    "coursera",
    "Coursera",
    "www.coursera.org",
    "Online courses and certificates",
    [],
    "https://www.coursera.org/search?query={query}",
  ]),
  site([
    "udemy",
    "Udemy",
    "www.udemy.com",
    "Online video courses",
    [],
    "https://www.udemy.com/courses/search/?q={query}",
  ]),
  site([
    "khanacademy",
    "Khan Academy",
    "www.khanacademy.org",
    "Free learning resources",
    ["khan academy"],
    "https://www.khanacademy.org/search?page_search_query={query}",
  ]),
  site([
    "edx",
    "edX",
    "www.edx.org",
    "University-backed online courses",
    [],
    "https://www.edx.org/search?q={query}",
  ]),
  site(["duolingo", "Duolingo", "www.duolingo.com", "Learn languages online"]),
  site([
    "quizlet",
    "Quizlet",
    "quizlet.com",
    "Study sets and learning tools",
    [],
    "https://quizlet.com/search?query={query}",
  ]),
  site([
    "wolframalpha",
    "Wolfram Alpha",
    "www.wolframalpha.com",
    "Computational knowledge engine",
    ["wolfram", "wolfram alpha"],
    "https://www.wolframalpha.com/input?i={query}",
  ]),
  site([
    "arxiv",
    "arXiv",
    "arxiv.org",
    "Open research papers",
    [],
    "https://arxiv.org/search/?query={query}&searchtype=all",
  ]),
  site([
    "scholar",
    "Google Scholar",
    "scholar.google.com",
    "Search scholarly literature",
    ["scholar"],
    "https://scholar.google.com/scholar?q={query}",
  ]),
  site([
    "researchgate",
    "ResearchGate",
    "www.researchgate.net",
    "Research publications and academics",
    ["research gate"],
    "https://www.researchgate.net/search/publication?q={query}",
  ]),
  site([
    "pubmed",
    "PubMed",
    "pubmed.ncbi.nlm.nih.gov",
    "Biomedical research literature",
    [],
    "https://pubmed.ncbi.nlm.nih.gov/?term={query}",
  ]),
  site([
    "jstor",
    "JSTOR",
    "www.jstor.org",
    "Academic journals and books",
    [],
    "https://www.jstor.org/action/doBasicSearch?Query={query}",
  ]),
  site([
    "gitlab",
    "GitLab",
    "gitlab.com",
    "Code hosting and DevOps",
    ["git lab"],
    "https://gitlab.com/search?search={query}",
  ]),
  site([
    "bitbucket",
    "Bitbucket",
    "bitbucket.org",
    "Git repositories and pipelines",
    ["bit bucket"],
    "https://bitbucket.org/repo/all?name={query}",
  ]),
  site([
    "npm",
    "npm",
    "www.npmjs.com",
    "JavaScript packages",
    [],
    "https://www.npmjs.com/search?q={query}",
  ]),
  site([
    "pypi",
    "PyPI",
    "pypi.org",
    "Python packages",
    ["python packages"],
    "https://pypi.org/search/?q={query}",
  ]),
  site([
    "mdn",
    "MDN Web Docs",
    "developer.mozilla.org",
    "Web platform documentation",
    ["mozilla docs", "mdn docs"],
    "https://developer.mozilla.org/en-US/search?q={query}",
  ]),
  site([
    "devto",
    "DEV Community",
    "dev.to",
    "Software development articles",
    ["dev to"],
    "https://dev.to/search?q={query}",
  ]),
  site([
    "codepen",
    "CodePen",
    "codepen.io",
    "Front-end code experiments",
    ["code pen"],
    "https://codepen.io/search/pens?q={query}",
  ]),
  site(["replit", "Replit", "replit.com", "Code and collaborate in the browser"]),
  site(["vercel", "Vercel", "vercel.com", "Deploy web applications"]),
  site(["netlify", "Netlify", "app.netlify.com", "Build and deploy websites"]),
  site(["cloudflare", "Cloudflare", "dash.cloudflare.com", "Web security and performance"]),
  site([
    "adobe",
    "Adobe",
    "www.adobe.com",
    "Creative and document tools",
    [],
    "https://www.adobe.com/search.html?q={query}",
  ]),
  site([
    "behance",
    "Behance",
    "www.behance.net",
    "Creative portfolios and inspiration",
    [],
    "https://www.behance.net/search/projects?search={query}",
  ]),
  site([
    "dribbble",
    "Dribbble",
    "dribbble.com",
    "Design portfolios and inspiration",
    [],
    "https://dribbble.com/search/{query}",
  ]),
] as const;

export type SearchIntent =
  | { kind: "empty" }
  | { kind: "url"; url: string; label: string }
  | { kind: "site"; url: string; label: string; site: TrustedSite; query: string }
  | {
      kind: "web";
      url: string;
      label: string;
      query: string;
      provider: SearchProviderDefinition;
    };

export function isSearchProviderId(value: unknown): value is SearchProviderId {
  return typeof value === "string" && SEARCH_PROVIDER_IDS.includes(value as SearchProviderId);
}

export function providerById(id: SearchProviderId): SearchProviderDefinition {
  const fallback = SEARCH_PROVIDERS[0];
  if (!fallback) throw new Error("Lattice needs at least one web search provider.");
  return SEARCH_PROVIDERS.find((provider) => provider.id === id) ?? fallback;
}

function fillQuery(template: string, query: string): string {
  return template.replace("{query}", encodeURIComponent(query.trim()));
}

export function webSearchUrl(query: string, providerId: SearchProviderId = "google"): string {
  return fillQuery(providerById(providerId).searchUrl, query);
}

function secureAddress(input: string): string | null {
  const trimmed = input.trim();
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  if (hasScheme) {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") throw new Error("Only HTTPS addresses are allowed.");
    if (!url.hostname) throw new Error("The address must include a hostname.");
    return url.toString();
  }
  if (/\s/.test(trimmed)) return null;
  const addressLike =
    /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#].*)?$/i.test(
      trimmed,
    ) ||
    /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#].*)?$/.test(trimmed) ||
    /^localhost(?::\d{1,5})?(?:[/?#].*)?$/i.test(trimmed);
  return addressLike ? new URL(`https://${trimmed}`).toString() : null;
}

function matchingSite(
  input: string,
  sites: readonly TrustedSite[],
): { site: TrustedSite; query: string } | null {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");
  const matches = sites.flatMap((candidate) =>
    candidate.aliases.map((alias) => ({ candidate, alias: alias.toLowerCase().trim() })),
  );
  matches.sort((left, right) => right.alias.length - left.alias.length);
  for (const { candidate, alias } of matches) {
    if (normalized === alias) return { site: candidate, query: "" };
    if (normalized.startsWith(`${alias} `)) {
      return { site: candidate, query: input.trim().slice(alias.length).trim() };
    }
  }
  return null;
}

export function resolveSearchIntent(
  input: string,
  providerId: SearchProviderId = "google",
  sites: readonly TrustedSite[] = TRUSTED_SITES,
): SearchIntent {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  if (trimmed.length > 2_048) throw new Error("Enter a search or address up to 2,048 characters.");

  const address = secureAddress(trimmed);
  if (address) return { kind: "url", url: address, label: new URL(address).hostname };

  const matched = matchingSite(trimmed, sites);
  if (matched) {
    const url = matched.query
      ? matched.site.searchUrl
        ? fillQuery(matched.site.searchUrl, matched.query)
        : webSearchUrl(`site:${matched.site.domain} ${matched.query}`, providerId)
      : matched.site.homeUrl;
    return {
      kind: "site",
      url,
      label: matched.query
        ? `Search ${matched.site.name} for “${matched.query}”`
        : `Open ${matched.site.name}`,
      site: matched.site,
      query: matched.query,
    };
  }

  const provider = providerById(providerId);
  return {
    kind: "web",
    url: webSearchUrl(trimmed, provider.id),
    label: `Search ${provider.name} for “${trimmed}”`,
    query: trimmed,
    provider,
  };
}

export function resolveNavigationInput(input: string): string {
  const intent = resolveSearchIntent(input, "google", []);
  if (intent.kind === "empty") throw new Error("Enter a search or web address.");
  return intent.url;
}
