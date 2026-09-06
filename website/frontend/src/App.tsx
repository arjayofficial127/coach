import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

type CapabilityIcon = "browse" | "capture" | "organize" | "connect" | "act" | "tools";

interface Capability {
  id: CapabilityIcon;
  label: string;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  signal: string;
  preview: ReactNode;
}

const DOWNLOAD_URL =
  import.meta.env.VITE_DOWNLOAD_URL ?? "https://github.com/arjayofficial127/coach/releases/latest";

const capabilities: Capability[] = [
  {
    id: "browse",
    label: "Browse",
    number: "01",
    eyebrow: "Persistent context",
    title: "Keep the web in working order.",
    description:
      "Separate the parts of your life without losing your place. Coach remembers the tabs, desktops, and context you meant to return to.",
    points: ["Restart-safe desktops", "Website profiles", "Global search", "Focus view"],
    signal: "48 tabs · 3 desktops · one clear view",
    preview: (
      <div className="mini-browser" aria-hidden="true">
        <div className="mini-tabbar">
          <span className="mini-tab active">
            <i />
            Research
          </span>
          <span className="mini-tab">
            <i />
            Planning
          </span>
          <span className="mini-tab">
            <i />
            Reading
          </span>
        </div>
        <div className="mini-browser-body">
          <div className="mini-rail">
            <span className="active" />
            <span />
            <span />
            <span />
          </div>
          <div className="mini-dashboard">
            <div className="mini-search">
              Search this desktop <kbd>⌘ K</kbd>
            </div>
            <div className="mini-card-grid">
              <span>
                <i />
                Open tabs <b>48</b>
              </span>
              <span>
                <i />
                History <b>12</b>
              </span>
              <span>
                <i />
                Saved <b>08</b>
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "capture",
    label: "Capture",
    number: "02",
    eyebrow: "Zero-friction memory",
    title: "Catch it before it disappears.",
    description:
      "Save a page, queue something to read, or drop a thought into your Inbox without leaving the moment that created it.",
    points: ["Quick-thought Inbox", "Saved links", "Reading queue", "Obsidian Markdown"],
    signal: "Thought captured · original preserved",
    preview: (
      <div className="capture-preview" aria-hidden="true">
        <div className="paper-note">
          <span>QUICK CAPTURE</span>
          <p>The idea before it disappears…</p>
          <div>
            <i /> Saved to Daily Flow
          </div>
        </div>
        <div className="capture-stack">
          <span>
            <Icon name="bookmark" /> Saved link
          </span>
          <span>
            <Icon name="queue" /> Reading queue
          </span>
          <span>
            <Icon name="note" /> Personal Inbox
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "organize",
    label: "Organize",
    number: "03",
    eyebrow: "A calmer overview",
    title: "See the whole picture without the noise.",
    description:
      "Return to one composed dashboard for what is open, what mattered, and what you were doing before the day moved on.",
    points: ["Live tab overview", "Local history", "Favorites", "Recently closed"],
    signal: "Everything visible · nothing shouting",
    preview: (
      <div className="overview-preview" aria-hidden="true">
        <div className="overview-head">
          <span>GOOD MORNING</span>
          <strong>Let’s focus on what matters.</strong>
        </div>
        <div className="overview-row">
          <span>
            <i className="violet" />
            Open tabs<b>16</b>
          </span>
          <span>
            <i className="cyan" />
            History<b>10</b>
          </span>
          <span>
            <i className="orange" />
            Favorites<b>04</b>
          </span>
        </div>
        <div className="overview-line">
          <i /> One meaningful next step <b>→</b>
        </div>
      </div>
    ),
  },
  {
    id: "connect",
    label: "Connect",
    number: "04",
    eyebrow: "Spatial thinking",
    title: "Let ideas become a map.",
    description:
      "Build canvas pages that connect notes, websites, files, and other pages—stored in formats your Obsidian vault can understand.",
    points: ["JSON Canvas pages", "Typed connections", "Local reference index", "Obsidian handoff"],
    signal: "6 objects · 9 connections · one idea",
    preview: (
      <div className="canvas-preview" aria-hidden="true">
        <svg viewBox="0 0 500 280" preserveAspectRatio="none">
          <title>Connected Coach canvas</title>
          <path d="M120 72 C205 72 183 142 265 142" />
          <path d="M265 142 C350 142 327 67 410 67" />
          <path d="M265 142 C345 142 335 226 410 226" />
          <path d="M120 221 C200 221 188 142 265 142" />
        </svg>
        <span className="canvas-node node-a">
          <Icon name="globe" /> Source
        </span>
        <span className="canvas-node node-b">
          <Icon name="note" /> Thought
        </span>
        <span className="canvas-node node-c central">
          <img src="/coach-mark.svg" alt="" /> Coach
        </span>
        <span className="canvas-node node-d">
          <Icon name="link" /> Reference
        </span>
        <span className="canvas-node node-e">
          <Icon name="file" /> Project
        </span>
      </div>
    ),
  },
  {
    id: "act",
    label: "Act",
    number: "05",
    eyebrow: "From intention to evidence",
    title: "Turn “later” into one clear move.",
    description:
      "Clarify captured tasks in Daily Flow, choose what is Now, and begin a linked focus session when it is time to move.",
    points: ["Daily Flow", "Now task", "Linked Pomodoro", "Durable activity records"],
    signal: "Now · Write the first page · 24:18",
    preview: (
      <div className="action-preview" aria-hidden="true">
        <div className="flow-column">
          <span>
            INBOX <b>04</b>
          </span>
          <p>
            <i /> Review research notes
          </p>
          <p className="selected">
            <i /> Write the first page
          </p>
          <p>
            <i /> Save references
          </p>
        </div>
        <div className="focus-clock">
          <svg viewBox="0 0 120 120">
            <title>Pomodoro progress</title>
            <circle cx="60" cy="60" r="52" />
            <circle className="progress" cx="60" cy="60" r="52" />
          </svg>
          <strong>24:18</strong>
          <span>WRITE THE FIRST PAGE</span>
        </div>
      </div>
    ),
  },
  {
    id: "tools",
    label: "Personal tools",
    number: "06",
    eyebrow: "Useful, focused, local",
    title: "Small tools for the life around the work.",
    description:
      "Run purpose-built tools for attention, planning, and private money reflection without scattering your context across more apps.",
    points: ["Pomodoro", "Daily Flow", "Wealth Lab", "Profile-scoped state"],
    signal: "Three tools · one personal workspace",
    preview: (
      <div className="tools-preview" aria-hidden="true">
        <div>
          <Icon name="timer" />
          <strong>Pomodoro</strong>
          <span>Focus with an honest history.</span>
        </div>
        <div>
          <Icon name="spark" />
          <strong>Daily Flow</strong>
          <span>Choose one clear next action.</span>
        </div>
        <div>
          <Icon name="chart" />
          <strong>Wealth Lab</strong>
          <span>Track money with intention.</span>
        </div>
      </div>
    ),
  },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    bookmark: <path d="M7 4h10v17l-5-3-5 3V4Z" />,
    queue: (
      <>
        <path d="M5 6h14" />
        <path d="M5 12h10" />
        <path d="M5 18h7" />
      </>
    ),
    note: (
      <>
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M14 3v5h5" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4" />
        <path d="M7.5 15.5 5 18a3.5 3.5 0 0 0 5 5l3-3" />
        <path d="m16.5 8.5 2.5-2.5a3.5 3.5 0 0 0-5-5l-3 3" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M14 3v5h5" />
      </>
    ),
    timer: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v5l3 2M9 2h6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
        <path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
        <path d="M2 20h22" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Coach Browser home">
      <span className="brand-mark">
        <img src="/coach-mark.svg" alt="" />
      </span>
      <span>
        Coach <b>Browser</b>
      </span>
    </a>
  );
}

function HeroVisual() {
  return (
    <div
      className="hero-visual"
      role="img"
      aria-label="Tabs, notes, links, and actions gathering into Coach Browser"
    >
      <div className="visual-halo" aria-hidden="true" />
      <div className="orbit orbit-one" aria-hidden="true" />
      <div className="orbit orbit-two" aria-hidden="true" />
      <div className="signal-chip chip-tabs">
        <span>
          <i className="dot violet" />
          Tabs
        </span>
        <b>48</b>
      </div>
      <div className="signal-chip chip-notes">
        <span>
          <i className="dot cyan" />
          Notes
        </span>
        <b>12</b>
      </div>
      <div className="signal-chip chip-links">
        <span>
          <i className="dot orange" />
          Links
        </span>
        <b>08</b>
      </div>
      <div className="signal-chip chip-actions">
        <span>
          <i className="dot green" />
          Actions
        </span>
        <b>04</b>
      </div>
      <div className="coach-core">
        <div className="core-pulse" aria-hidden="true" />
        <img src="/coach-mark.svg" alt="" />
        <span>COACH</span>
        <strong>Everything in orbit.</strong>
      </div>
      <div className="context-card context-left" aria-hidden="true">
        <span className="context-kicker">ACTIVE DESKTOP</span>
        <strong>Personal research</strong>
        <div>
          <i className="avatar-one" />
          <i className="avatar-two" />
          <i className="avatar-three" />
          <b>+16</b>
        </div>
      </div>
      <div className="context-card context-right" aria-hidden="true">
        <span className="context-kicker">NEXT MOVE</span>
        <strong>Review the one useful idea</strong>
        <span className="context-action">
          Start focus <b>→</b>
        </span>
      </div>
      <span className="data-line line-a" aria-hidden="true" />
      <span className="data-line line-b" aria-hidden="true" />
      <span className="data-line line-c" aria-hidden="true" />
      <span className="data-line line-d" aria-hidden="true" />
    </div>
  );
}

export function App() {
  const [activeCapability, setActiveCapability] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = capabilities[activeCapability];

  const moveCapability = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? capabilities.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + capabilities.length) %
            capabilities.length;
    setActiveCapability(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Primary navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#download">Why Coach</a>
        </nav>
        <a className="header-download" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
          Download <Icon name="download" />
        </a>
      </header>

      <main id="main">
        <section className="hero section-grid" id="top">
          <div className="ambient ambient-one" aria-hidden="true" />
          <div className="ambient ambient-two" aria-hidden="true" />
          <div className="hero-copy">
            <div className="eyebrow">
              <i /> A browser for everything you’re carrying
            </div>
            <h1>
              Your tabs, notes, and next actions—<em>finally in one flow.</em>
            </h1>
            <p>
              Coach Browser brings scattered browsing, saved ideas, reading, and personal actions
              into one focused workspace—so nothing useful gets lost and the next step stays clear.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                Download Coach Browser <Icon name="download" />
              </a>
              <a className="button secondary" href="#capabilities">
                See what it can do <Icon name="arrow" />
              </a>
            </div>
            <ul className="hero-proof" aria-label="Product qualities">
              <li>
                <i /> Windows desktop
              </li>
              <li>
                <i /> Local-first workspace
              </li>
              <li>
                <i /> Obsidian-compatible
              </li>
            </ul>
          </div>
          <HeroVisual />
          <a className="scroll-cue" href="#capabilities" aria-label="Scroll to capabilities">
            <span>Explore the system</span>
            <i />
          </a>
        </section>

        <section className="capabilities section-grid" id="capabilities">
          <div className="section-intro">
            <div className="eyebrow">
              <i /> One place. Many ways forward.
            </div>
            <h2>
              From first thought to <em>focused action.</em>
            </h2>
            <p>
              Everything Coach can do today, organized around the way unfinished work actually
              moves.
            </p>
          </div>

          <div className="capability-tabs" role="tablist" aria-label="Coach Browser capabilities">
            {capabilities.map((capability, index) => (
              <button
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={`tab-${capability.id}`}
                key={capability.id}
                role="tab"
                type="button"
                aria-selected={index === activeCapability}
                aria-controls={`panel-${capability.id}`}
                tabIndex={index === activeCapability ? 0 : -1}
                onClick={() => setActiveCapability(index)}
                onKeyDown={(event) => moveCapability(event, index)}
              >
                <span>{capability.number}</span>
                {capability.label}
                <i />
              </button>
            ))}
          </div>

          <article
            className="capability-panel"
            id={`panel-${active.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${active.id}`}
            key={active.id}
          >
            <div className="capability-copy">
              <span className="panel-eyebrow">{active.eyebrow}</span>
              <h3>{active.title}</h3>
              <p>{active.description}</p>
              <ul>
                {active.points.map((point) => (
                  <li key={point}>
                    <i />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="capability-signal">
                <span>LIVE SIGNAL</span>
                {active.signal}
              </div>
            </div>
            <div className={`capability-visual visual-${active.id}`}>
              <div className="visual-topline">
                <span>
                  <i /> COACH / {active.id.toUpperCase()}
                </span>
                <b>LIVE</b>
              </div>
              {active.preview}
            </div>
          </article>
          <p className="flow-line">
            <span>Browse</span>
            <i /> <span>capture</span>
            <i /> <span>connect</span>
            <i /> <span>act</span>
            <i /> <strong>return.</strong>
          </p>
        </section>

        <section className="download-section section-grid" id="download">
          <div className="download-aurora" aria-hidden="true" />
          <div className="download-rings" aria-hidden="true">
            <i className="ring-wide" />
            <i className="ring-middle" />
            <i className="ring-inner" />
            <span>
              <img src="/coach-mark.svg" alt="" />
            </span>
          </div>
          <div className="download-content">
            <div className="eyebrow centered">
              <i /> Less carrying. More moving.
            </div>
            <h2>
              Ready to give your scattered work <em>a place to belong?</em>
            </h2>
            <p>
              Bring the tabs, notes, links, and actions that have been following you everywhere.
              Coach helps you gather them, understand them, and choose what comes next.
            </p>
            <div className="download-actions">
              <a
                className="button primary large"
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                Download for Windows <Icon name="download" />
              </a>
              <a className="button ghost" href="#capabilities">
                Explore capabilities <Icon name="arrow" />
              </a>
            </div>
            <span className="release-note">Current preview release · Windows 10/11</span>
          </div>
          <footer className="site-footer">
            <Brand />
            <p>Your work is already connected. Now your browser can feel that way too.</p>
            <div>
              <a href="#capabilities">Capabilities</a>
              <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                Download
              </a>
              <span>© 2026 Coach Browser</span>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
