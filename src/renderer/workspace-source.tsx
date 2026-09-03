import { useEffect, useRef, useState } from "react";
import type { BrowserSourceCapture, BrowserState } from "../shared/contracts";
import { Icon } from "./icon";

export function WorkspaceSource({
  tabs,
  active,
  suspended,
  canInsert,
  destination,
  onSelect,
  onNavigate,
  onViewport,
  onInsert,
  onClose,
}: {
  tabs: BrowserState[];
  active: BrowserState | null;
  suspended: boolean;
  canInsert: boolean;
  destination: string | null;
  onSelect: (id: string) => Promise<void>;
  onNavigate: (url: string) => Promise<void>;
  onViewport: (node: HTMLDivElement | null) => void;
  onInsert: (source: BrowserSourceCapture) => void;
  onClose: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState(active?.url === "about:blank" ? "" : (active?.url ?? ""));
  const [capture, setCapture] = useState<BrowserSourceCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Another tab at the same URL must invalidate a captured selection too.
  useEffect(() => {
    setAddress(active?.url === "about:blank" ? "" : (active?.url ?? ""));
    setCapture(null);
    setBusy(false);
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [active?.id, active?.url]);
  useEffect(() => {
    onViewport(
      !suspended && !capture && active?.id && active.url.startsWith("https://")
        ? viewport.current
        : null,
    );
    return () => onViewport(null);
  }, [active?.url, active?.id, suspended, capture, onViewport]);
  const readSelection = async () => {
    if (!active || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await window.lattice.browser.captureSelection(active.id);
      if (generation.current === request) setCapture(result);
    } catch {
      if (generation.current === request)
        setError("Could not capture this source. Check the HTTPS tab and try again.");
    } finally {
      if (generation.current === request) setBusy(false);
    }
  };
  return (
    <aside className="ws-research" aria-label="Research beside your notes" data-workspace-research>
      <header>
        <strong>
          <Icon name="globe" /> Research beside your notes
        </strong>
        <button type="button" aria-label="Close research pane" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <label className="ws-source-tab-picker">
        This desktop's browser tabs
        <select
          aria-label="Research tab"
          value={active?.id ?? ""}
          onChange={(e) => {
            void onSelect(e.target.value).catch(() => setError("Could not switch this source."));
          }}
        >
          {!active && <option value="">Choose a tab</option>}
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.title || tab.url}
            </option>
          ))}
        </select>
      </label>
      <form
        className="ws-research-address"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          void onNavigate(address).catch(() =>
            setError("Enter a complete HTTPS address without credentials."),
          );
        }}
      >
        <input
          aria-label="Research web address"
          placeholder="https://…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit" aria-label="Open research address">
          <Icon name="arrow-right" />
        </button>
      </form>
      <div className="ws-research-navigation">
        <button
          type="button"
          aria-label="Research back"
          disabled={!active?.canGoBack}
          onClick={() =>
            void window.lattice.browser
              .back()
              .catch(() => setError("Could not go back in this source."))
          }
        >
          <Icon name="arrow-left" />
        </button>
        <button
          type="button"
          aria-label="Reload research"
          disabled={!active}
          onClick={() =>
            void window.lattice.browser
              .reload()
              .catch(() => setError("Could not reload this source."))
          }
        >
          <Icon name="reload" />
        </button>
        <small>Isolated website · {active?.loading ? "Loading…" : "Current website profile"}</small>
      </div>
      {capture ? (
        <section className="ws-source-review" aria-label="Review captured source">
          <strong>{capture.title}</strong>
          <small>{capture.url}</small>
          {capture.text ? (
            <blockquote>{capture.text}</blockquote>
          ) : (
            <p>
              No text selected. Add the source link, or return to the page and select a passage.
            </p>
          )}
          <button
            type="button"
            className="primary-action"
            disabled={!canInsert}
            onClick={() => {
              onInsert(capture);
              setCapture(null);
            }}
          >
            Add {capture.text ? "quote" : "source"} to draft
          </button>
          <button type="button" onClick={() => setCapture(null)}>
            Return to source
          </button>
          <p>
            Destination: {destination ?? "Open a document first"}. Source URL included. Your note is
            not saved until you choose Save.
          </p>
        </section>
      ) : (
        <div className="ws-research-viewport" ref={viewport} data-workspace-source-viewport>
          <div className="ws-source-placeholder">
            <Icon name="globe" />
            <p>
              {active?.url.startsWith("https://")
                ? "The website is displayed here in the desktop app."
                : "Open an HTTPS source to research beside your notes."}
            </p>
            <small>Remote pages cannot access your local files.</small>
          </div>
        </div>
      )}
      {error && (
        <p className="ws-notice" role="alert">
          {error}
        </p>
      )}
      {!capture && (
        <footer>
          <button
            type="button"
            className="ws-text-action"
            disabled={!active?.url.startsWith("https://") || busy || suspended}
            onClick={() => void readSelection()}
          >
            <Icon name="plus" /> {busy ? "Reading selection…" : "Capture quote or source"}
          </button>
          <small>
            {canInsert
              ? "Select text on the page, then review before adding."
              : "Open a Markdown, text, or Coach document to insert a source."}
          </small>
        </footer>
      )}
    </aside>
  );
}
