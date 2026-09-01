import type { DesktopFolderArea, DesktopFolderSummary } from "../shared/contracts";
import { Icon, type IconName } from "./icon";

const areas: Array<{
  id: DesktopFolderArea;
  icon: IconName;
  description: string;
}> = [
  { id: "Inbox", icon: "sparkle", description: "Quick captures waiting to be clarified" },
  { id: "Notes", icon: "edit", description: "Markdown notes that belong to this desktop" },
  { id: "Files", icon: "folder", description: "Documents, images, and working files" },
  { id: "Planner", icon: "timer", description: "Plans and durable next-action material" },
];

function relativeTime(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Recently";
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

interface LocalFilesSurfaceProps {
  desktopName: string;
  workspaceName: string;
  summary: DesktopFolderSummary | null;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onReveal: () => void;
}

export function LocalFilesSurface({
  desktopName,
  workspaceName,
  summary,
  connected,
  busy,
  onConnect,
  onRefresh,
  onReveal,
}: LocalFilesSurfaceProps) {
  if (!connected) {
    return (
      <div className="trusted-surface local-files-surface local-files-empty">
        <span className="local-files-empty-icon">
          <Icon name="folder" />
        </span>
        <span className="eyebrow">Files belong beside browsing</span>
        <h1>Give {desktopName} a local home</h1>
        <p>
          Choose any local folder. Coach adds private <code>.coach</code> metadata and creates a
          visible desktop folder with Inbox, Notes, Files, and Planner inside it.
        </p>
        <button type="button" className="primary-action" onClick={onConnect}>
          Connect local folder
        </button>
        <small>Coach never moves, rewrites, or deletes existing files in the folder.</small>
      </div>
    );
  }

  return (
    <div className="trusted-surface local-files-surface">
      <header className="local-files-header">
        <div>
          <span className="eyebrow">{workspaceName || "Local workspace"}</span>
          <h1>{desktopName} files</h1>
          <p>One desktop, four clear places. Browser tabs stay close without becoming files.</p>
        </div>
        <div className="local-files-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            <Icon name="reload" /> {busy ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="primary-action" onClick={onReveal}>
            <Icon name="folder" /> Open folder
          </button>
        </div>
      </header>

      <section className="local-files-area-grid" aria-label={`${desktopName} folders`}>
        {areas.map((area) => {
          const count = summary?.items.filter((item) => item.area === area.id).length ?? 0;
          return (
            <article key={area.id} className={area.id === "Inbox" ? "inbox" : undefined}>
              <span className="local-files-area-icon">
                <Icon name={area.icon} />
              </span>
              <div>
                <strong>{area.id}</strong>
                <p>{area.description}</p>
              </div>
              <b>{count}</b>
            </article>
          );
        })}
      </section>

      <section className="local-files-recent">
        <header>
          <div>
            <span className="eyebrow">Across this desktop</span>
            <h2>Recent files and folders</h2>
          </div>
          <span>{summary?.fileCount ?? 0} items</span>
        </header>
        <div className="local-files-list">
          {summary?.items.slice(0, 20).map((item) => (
            <div key={item.id}>
              <span className={`local-file-kind ${item.area.toLowerCase()}`}>
                <Icon name={item.kind === "folder" ? "folder" : "edit"} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.area} · {item.kind}
                </small>
              </span>
              <time>{relativeTime(item.updatedAt)}</time>
            </div>
          ))}
          {!summary?.items.length && (
            <div className="local-files-list-empty">
              <Icon name="sparkle" />
              <span>
                <strong>This desktop is ready.</strong>
                <small>Quick notes land in Inbox; your own files stay where you put them.</small>
              </span>
            </div>
          )}
        </div>
      </section>

      <footer className="local-files-safety">
        <Icon name="lock" />
        <span>
          <strong>Local and inspectable.</strong>
          <small>
            Only folder and file names appear here. The private device path stays hidden.
          </small>
        </span>
      </footer>
    </div>
  );
}
