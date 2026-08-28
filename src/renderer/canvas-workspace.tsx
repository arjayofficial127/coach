import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CanvasLinkKind,
  CanvasPageNode,
  CanvasPageRecord,
  CanvasPageSummary,
  CanvasTextNode,
  CanvasTypedLink,
  VaultInfo,
} from "../shared/contracts";
import { Icon } from "./icon";

interface CanvasWorkspaceProps {
  vault: VaultInfo | null;
  pages: CanvasPageSummary[];
  initialPageId?: string | null;
  onPagesChange(pages: CanvasPageSummary[]): void;
  connectVault(): Promise<void>;
  openUrl(url: string): Promise<void>;
  reportStatus(message: string): void;
}

interface DragState {
  nodeId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
}

const linkKinds: Array<{ value: CanvasLinkKind; label: string }> = [
  { value: "page", label: "Page" },
  { value: "object", label: "Object" },
  { value: "url", label: "URL" },
  { value: "document", label: "Document" },
  { value: "image", label: "Image" },
  { value: "file", label: "File" },
];

function nextPosition(count: number): { x: number; y: number } {
  return { x: 40 + (count % 3) * 390, y: 40 + Math.floor(count / 3) * 300 };
}

function objectTitle(node: CanvasPageNode): string {
  return node.latticeTitle;
}

function defaultTarget(
  kind: CanvasLinkKind,
  pages: CanvasPageSummary[],
  nodes: CanvasPageNode[],
  currentNodeId: string,
): string {
  if (kind === "page") return pages[0]?.id ?? "";
  if (kind === "object") return nodes.find((node) => node.id !== currentNodeId)?.id ?? "";
  if (kind === "url") return "https://example.com";
  return "Files/example.md";
}

export function CanvasWorkspace({
  vault,
  pages,
  initialPageId,
  onPagesChange,
  connectVault,
  openUrl,
  reportStatus,
}: CanvasWorkspaceProps) {
  const [draft, setDraft] = useState<CanvasPageRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createFolder, setCreateFolder] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const groupedPages = useMemo(() => {
    const groups = new Map<string, CanvasPageSummary[]>();
    for (const page of pages) {
      const folder = page.folder || "Pages";
      groups.set(folder, [...(groups.get(folder) ?? []), page]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [pages]);

  const refreshPages = async () => {
    onPagesChange(await window.lattice.vault.listCanvasPages());
  };

  const openPage = useCallback(
    async (pageId: string) => {
      try {
        const page = await window.lattice.vault.getCanvasPage(pageId);
        setDraft(page);
        setDirty(false);
        setSelectedNodeId(null);
        reportStatus(`Opened canvas page “${page.title}”`);
      } catch (error) {
        reportStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [reportStatus],
  );

  useEffect(() => {
    if (initialPageId) void openPage(initialPageId);
  }, [initialPageId, openPage]);

  const createPage = async (event: FormEvent) => {
    event.preventDefault();
    if (!createTitle.trim()) return;
    try {
      const created = await window.lattice.vault.createCanvasPage({
        title: createTitle,
        description: createDescription,
        folder: createFolder,
      });
      await refreshPages();
      setDraft(created);
      setCreating(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateFolder("");
      setDirty(false);
      reportStatus("Canvas page created atomically in the Obsidian vault");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const updateDraft = (change: (current: CanvasPageRecord) => CanvasPageRecord) => {
    setDraft((current) => (current ? change(current) : current));
    setDirty(true);
  };

  const updateNode = (nodeId: string, change: (node: CanvasPageNode) => CanvasPageNode) => {
    updateDraft((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? change(node) : node)),
    }));
  };

  const savePage = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await window.lattice.vault.saveCanvasPage({
        id: draft.id,
        title: draft.title,
        description: draft.description,
        nodes: draft.nodes,
        edges: draft.edges,
      });
      setDraft(saved);
      setDirty(false);
      await refreshPages();
      reportStatus("Canvas page saved atomically");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const addObject = (kind: "note" | "iframe" | "links") => {
    if (!draft) return;
    const position = nextPosition(draft.nodes.length);
    const id = crypto.randomUUID();
    const node: CanvasPageNode =
      kind === "iframe"
        ? {
            id,
            type: "link",
            ...position,
            width: 350,
            height: 240,
            url: "https://example.com",
            latticeKind: "iframe",
            latticeTitle: "Website",
            latticeDescription: "Why this website belongs on the page.",
          }
        : kind === "links"
          ? {
              id,
              type: "text",
              ...position,
              width: 430,
              height: 290,
              text: "Related pages and resources",
              latticeKind: "links",
              latticeTitle: "Links",
              latticeLinks: [],
            }
          : {
              id,
              type: "text",
              ...position,
              width: 350,
              height: 240,
              text: "Write a description or Markdown note…",
              latticeKind: "note",
              latticeTitle: "Description",
            };
    updateDraft((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      nodeCount: current.nodes.length + 1,
    }));
    setSelectedNodeId(id);
  };

  const removeObject = (nodeId: string) => {
    updateDraft((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.fromNode !== nodeId && edge.toNode !== nodeId),
      nodeCount: Math.max(0, current.nodes.length - 1),
    }));
    setSelectedNodeId(null);
  };

  const addTypedLink = (node: CanvasTextNode) => {
    const kind: CanvasLinkKind = "url";
    const link: CanvasTypedLink = {
      id: crypto.randomUUID(),
      label: "New link",
      kind,
      target: defaultTarget(kind, pages, draft?.nodes ?? [], node.id),
    };
    updateNode(node.id, (current) =>
      current.type === "text"
        ? { ...current, latticeLinks: [...(current.latticeLinks ?? []), link] }
        : current,
    );
  };

  const updateTypedLink = (
    nodeId: string,
    linkId: string,
    change: (link: CanvasTypedLink) => CanvasTypedLink,
  ) => {
    updateNode(nodeId, (node) =>
      node.type === "text"
        ? {
            ...node,
            latticeLinks: (node.latticeLinks ?? []).map((link) =>
              link.id === linkId ? change(link) : link,
            ),
          }
        : node,
    );
  };

  const removeTypedLink = (nodeId: string, linkId: string) => {
    updateNode(nodeId, (node) =>
      node.type === "text"
        ? {
            ...node,
            latticeLinks: (node.latticeLinks ?? []).filter((link) => link.id !== linkId),
          }
        : node,
    );
  };

  const followTypedLink = async (nodeId: string, link: CanvasTypedLink) => {
    if (link.kind === "page") {
      await openPage(link.target);
      return;
    }
    if (link.kind === "object") {
      setSelectedNodeId(link.target);
      document.getElementById(`canvas-object-${link.target}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
      reportStatus("Focused the linked canvas object");
      return;
    }
    if (link.kind === "url") {
      await openUrl(link.target);
      return;
    }
    if (!draft) return;
    try {
      await window.lattice.vault.revealCanvasReference({
        pageId: draft.id,
        nodeId,
        linkId: link.id,
      });
      reportStatus(`Revealed ${link.kind} in its folder`);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, node: CanvasPageNode) => {
    if ((event.target as HTMLElement).closest("button, input, textarea, select, a")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      nodeId: node.id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
    setSelectedNodeId(node.id);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.round((drag.originX + event.clientX - drag.clientX) / 10) * 10;
    const y = Math.round((drag.originY + event.clientY - drag.clientY) / 10) * 10;
    updateNode(drag.nodeId, (node) => ({ ...node, x, y }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!vault) {
    return (
      <div className="trusted-surface canvas-surface">
        <div className="empty-library">
          <span className="empty-icon">
            <Icon name="folder" />
          </span>
          <h2>Connect a vault to create pages</h2>
          <p>Every page is a local, Obsidian-compatible .canvas file with no private database.</p>
          <button type="button" className="primary-action" onClick={() => void connectVault()}>
            Choose Obsidian vault
          </button>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="trusted-surface canvas-surface canvas-index">
        <header className="canvas-index-header">
          <div>
            <span className="eyebrow">Obsidian JSON Canvas</span>
            <h1>Pages</h1>
            <p>{pages.length} pages · nested folders · local and portable</p>
          </div>
          <button type="button" className="primary-action" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New page
          </button>
        </header>

        {creating && (
          <form className="canvas-create-form" onSubmit={createPage}>
            <div>
              <span className="eyebrow">Create a whole page</span>
              <h2>New canvas</h2>
              <p>
                The nested folder is created inside <strong>Lattice Pages</strong>.
              </p>
            </div>
            <label>
              <span>Title</span>
              <input
                required
                maxLength={200}
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                aria-label="Canvas page title"
                placeholder="Research operating system"
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                maxLength={4000}
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                aria-label="Canvas page description"
                placeholder="What this collection is for"
              />
            </label>
            <label>
              <span>Folder</span>
              <input
                maxLength={500}
                value={createFolder}
                onChange={(event) => setCreateFolder(event.target.value)}
                aria-label="Canvas page folder"
                placeholder="Projects / Browser"
              />
            </label>
            <div className="canvas-create-actions">
              <button type="submit" className="primary-action" disabled={!createTitle.trim()}>
                Create page
              </button>
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {pages.length === 0 && !creating ? (
          <div className="empty-library compact">
            <span className="empty-icon">
              <Icon name="sparkle" />
            </span>
            <h2>Build your first connected page</h2>
            <p>Add descriptions, websites, and lists that point to more pages or local files.</p>
            <button type="button" className="primary-action" onClick={() => setCreating(true)}>
              Create first page
            </button>
          </div>
        ) : (
          <div className="canvas-folder-list">
            {groupedPages.map(([folder, folderPages]) => (
              <section className="canvas-folder" key={folder}>
                <header>
                  <Icon name="folder" />
                  <strong>{folder}</strong>
                  <span>{folderPages.length}</span>
                </header>
                <div className="canvas-page-grid">
                  {folderPages.map((page) => (
                    <button
                      type="button"
                      className="canvas-page-card"
                      key={page.id}
                      onClick={() => void openPage(page.id)}
                    >
                      <span className="canvas-page-glyph">
                        <Icon name="library" />
                      </span>
                      <span>
                        <strong>{page.title}</strong>
                        <small>{page.description || "No page description"}</small>
                      </span>
                      <b>{page.nodeCount} objects</b>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  const boardWidth = Math.max(1_240, ...draft.nodes.map((node) => node.x + node.width + 80));
  const boardHeight = Math.max(760, ...draft.nodes.map((node) => node.y + node.height + 80));

  return (
    <div className="trusted-surface canvas-surface canvas-editor">
      <header className="canvas-editor-header">
        <button type="button" className="canvas-back" onClick={() => setDraft(null)}>
          <Icon name="arrow-left" /> Pages
        </button>
        <label className="canvas-title-field">
          <span className="sr-only">Canvas page title</span>
          <input
            value={draft.title}
            maxLength={200}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, title: event.target.value }))
            }
            aria-label="Edit canvas page title"
          />
          <small>{draft.folder || "Pages"}</small>
        </label>
        <div className="canvas-toolbar">
          <button type="button" onClick={() => addObject("note")}>
            <Icon name="edit" /> Note
          </button>
          <button type="button" onClick={() => addObject("iframe")}>
            <Icon name="globe" /> Website
          </button>
          <button type="button" onClick={() => addObject("links")}>
            <Icon name="bookmark" /> Links
          </button>
        </div>
        <button
          type="button"
          className={dirty ? "canvas-save dirty" : "canvas-save"}
          disabled={saving || !dirty || !draft.title.trim()}
          onClick={() => void savePage()}
        >
          <Icon name={dirty ? "bookmark" : "check"} />{" "}
          {saving ? "Saving…" : dirty ? "Save page" : "Saved"}
        </button>
      </header>
      <label className="canvas-description-field">
        <span>Page description</span>
        <input
          value={draft.description}
          maxLength={4000}
          onChange={(event) =>
            updateDraft((current) => ({ ...current, description: event.target.value }))
          }
          placeholder="Describe how this collection fits together"
        />
      </label>
      <div className="canvas-scroll">
        <div className="canvas-board" style={{ width: boardWidth, height: boardHeight }}>
          {draft.nodes.length === 0 && (
            <div className="canvas-empty-board">
              <Icon name="sparkle" />
              <strong>Add the first object</strong>
              <span>A description, isolated website, or list of connected things.</span>
            </div>
          )}
          {draft.nodes.map((node) => (
            <article
              id={`canvas-object-${node.id}`}
              key={node.id}
              className={`canvas-object ${node.type} ${node.latticeKind} ${selectedNodeId === node.id ? "selected" : ""}`}
              style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
            >
              <header
                className="canvas-object-header"
                onPointerDown={(event) => beginDrag(event, node)}
                onPointerMove={continueDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="canvas-object-type">
                  <Icon
                    name={
                      node.type === "link"
                        ? "globe"
                        : node.latticeKind === "links"
                          ? "bookmark"
                          : "edit"
                    }
                  />
                  {node.latticeKind === "iframe" ? "Isolated website" : node.latticeKind}
                </span>
                <span className="canvas-drag-hint">Drag</span>
                <button
                  type="button"
                  aria-label={`Delete ${objectTitle(node)}`}
                  onClick={() => removeObject(node.id)}
                >
                  <Icon name="close" />
                </button>
              </header>

              <label className="canvas-node-title">
                <span className="sr-only">Object title</span>
                <input
                  value={node.latticeTitle}
                  maxLength={200}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      latticeTitle: event.target.value,
                    }))
                  }
                />
              </label>

              {node.type === "link" && (
                <div className="canvas-website-body">
                  <input
                    type="url"
                    value={node.url}
                    aria-label="Website object URL"
                    onChange={(event) =>
                      updateNode(node.id, (current) =>
                        current.type === "link" ? { ...current, url: event.target.value } : current,
                      )
                    }
                  />
                  <textarea
                    value={node.latticeDescription}
                    maxLength={4000}
                    aria-label="Website object description"
                    onChange={(event) =>
                      updateNode(node.id, (current) =>
                        current.type === "link"
                          ? { ...current, latticeDescription: event.target.value }
                          : current,
                      )
                    }
                  />
                  <button
                    type="button"
                    className="canvas-open-live"
                    onClick={() => void openUrl(node.url)}
                  >
                    Open live in isolated browser <Icon name="arrow-right" />
                  </button>
                </div>
              )}

              {node.type === "text" && node.latticeKind === "note" && (
                <textarea
                  className="canvas-note-body"
                  value={node.text}
                  maxLength={20_000}
                  aria-label="Canvas note Markdown"
                  onChange={(event) =>
                    updateNode(node.id, (current) =>
                      current.type === "text" ? { ...current, text: event.target.value } : current,
                    )
                  }
                />
              )}

              {node.type === "text" && node.latticeKind === "links" && (
                <div className="canvas-links-body">
                  <textarea
                    value={node.text}
                    maxLength={20_000}
                    aria-label="Links object description"
                    onChange={(event) =>
                      updateNode(node.id, (current) =>
                        current.type === "text"
                          ? { ...current, text: event.target.value }
                          : current,
                      )
                    }
                  />
                  <div className="canvas-link-list">
                    {(node.latticeLinks ?? []).map((link) => (
                      <div className="canvas-link-row" key={link.id}>
                        <input
                          value={link.label}
                          maxLength={200}
                          aria-label="Canvas link label"
                          onChange={(event) =>
                            updateTypedLink(node.id, link.id, (current) => ({
                              ...current,
                              label: event.target.value,
                            }))
                          }
                        />
                        <select
                          value={link.kind}
                          aria-label="Canvas link type"
                          onChange={(event) => {
                            const kind = event.target.value as CanvasLinkKind;
                            updateTypedLink(node.id, link.id, (current) => ({
                              ...current,
                              kind,
                              target: defaultTarget(
                                kind,
                                pages.filter((page) => page.id !== draft.id),
                                draft.nodes,
                                node.id,
                              ),
                            }));
                          }}
                        >
                          {linkKinds.map((kind) => (
                            <option value={kind.value} key={kind.value}>
                              {kind.label}
                            </option>
                          ))}
                        </select>
                        {link.kind === "page" ? (
                          <select
                            value={link.target}
                            aria-label="Linked canvas page"
                            onChange={(event) =>
                              updateTypedLink(node.id, link.id, (current) => ({
                                ...current,
                                target: event.target.value,
                              }))
                            }
                          >
                            <option value="">Choose page</option>
                            {pages
                              .filter((page) => page.id !== draft.id)
                              .map((page) => (
                                <option key={page.id} value={page.id}>
                                  {page.folder ? `${page.folder} / ` : ""}
                                  {page.title}
                                </option>
                              ))}
                          </select>
                        ) : link.kind === "object" ? (
                          <select
                            value={link.target}
                            aria-label="Linked canvas object"
                            onChange={(event) =>
                              updateTypedLink(node.id, link.id, (current) => ({
                                ...current,
                                target: event.target.value,
                              }))
                            }
                          >
                            <option value="">Choose object</option>
                            {draft.nodes
                              .filter((candidate) => candidate.id !== node.id)
                              .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {objectTitle(candidate)}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            value={link.target}
                            maxLength={2048}
                            aria-label="Canvas link target"
                            placeholder={link.kind === "url" ? "https://…" : "Folder/file.ext"}
                            onChange={(event) =>
                              updateTypedLink(node.id, link.id, (current) => ({
                                ...current,
                                target: event.target.value,
                              }))
                            }
                          />
                        )}
                        <button
                          type="button"
                          className="canvas-follow-link"
                          onClick={() => void followTypedLink(node.id, link)}
                          aria-label={`Open ${link.label}`}
                        >
                          <Icon name="arrow-right" />
                        </button>
                        <button
                          type="button"
                          className="canvas-remove-link"
                          onClick={() => removeTypedLink(node.id, link.id)}
                          aria-label={`Remove ${link.label}`}
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="canvas-add-link"
                    onClick={() => addTypedLink(node)}
                  >
                    <Icon name="plus" /> Add page, object, URL, or file
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
