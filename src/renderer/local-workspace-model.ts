import type {
  LatticeApi,
  WorkspaceDirectoryEntry,
  WorkspaceDirectoryListing,
  WorkspaceFileDocument,
} from "../shared/contracts";
import { withoutFencedCode } from "../shared/source-capture";

export interface WorkspaceIndex {
  directories: Record<string, WorkspaceDirectoryListing>;
  entries: WorkspaceDirectoryEntry[];
  documents: Record<string, WorkspaceFileDocument>;
  partial: boolean;
}

export interface WorkspaceFolderCounts {
  directFiles: number;
  totalFiles: number;
  directFolders: number;
  totalFolders: number;
  directComplete: boolean;
  totalComplete: boolean;
}

const MAX_DIRECTORY_ITEMS = 500;

export function workspaceFolderCounts(
  index: WorkspaceIndex,
  relativePath: string,
): WorkspaceFolderCounts {
  const listing = index.directories[relativePath];
  const directEntries = listing?.entries ?? [];
  const prefix = relativePath ? `${relativePath}/` : "";
  const descendants = index.entries.filter(
    (entry) => !relativePath || entry.relativePath.startsWith(prefix),
  );
  const descendantFolders = descendants.filter((entry) => entry.kind === "folder");
  const directComplete = Boolean(listing) && directEntries.length < MAX_DIRECTORY_ITEMS;
  const totalComplete =
    directComplete &&
    descendantFolders.every((entry) => {
      const childListing = index.directories[entry.relativePath];
      return childListing ? childListing.entries.length < MAX_DIRECTORY_ITEMS : false;
    });

  return {
    directFiles: directEntries.filter((entry) => entry.kind === "file").length,
    totalFiles: descendants.filter((entry) => entry.kind === "file").length,
    directFolders: directEntries.filter((entry) => entry.kind === "folder").length,
    totalFolders: descendantFolders.length,
    directComplete,
    totalComplete,
  };
}

// Only known product diagnostics may cross into the UI. Native filesystem errors can contain
// absolute device paths, including failures before the file broker reaches its own catch block.
const publicWorkspaceErrors = new Set([
  "Choose a location inside this desktop.",
  "That workspace path is not allowed.",
  "Use a simple file or folder name without reserved characters.",
  "Create .md files with the matching extension.",
  "Create .text files with the matching extension.",
  "Create .coach files with the matching extension.",
  "A .coach file must contain valid JSON.",
  "A .coach file must contain a document object.",
  "This .coach board has invalid columns, cards, or dates. Review its JSON before saving.",
  "This .coach object does not match the supported version 1 envelope.",
  "This .coach document does not match the supported document format.",
  "This desktop is not available in the local workspace.",
  "This desktop folder is unavailable.",
  "Linked workspace items are not supported.",
  "Coach can edit .md, .text, and .coach files.",
  "This file is too large for the Coach editor.",
  "A file or folder with that name already exists here.",
  "This file changed outside Coach. Reopen it before saving your edits.",
  "Open an HTTPS website first, then capture its source here.",
  "Keep the existing file extension when renaming.",
  "This item changed outside Coach. Refresh before renaming it.",
  "Rename the desktop from the sidebar.",
  "Could not save the folder role. Its original name was restored.",
  "Folder role could not be saved. Check the folder names in Explorer before continuing.",
  "Rename did not finish. Refresh to inspect the current names before retrying.",
  "Could not rename this item. Check the folder connection and permissions, then refresh.",
  "Folder renaming is currently supported in the Windows app.",
]);

export function workspaceErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  // Electron wraps rejected invoke messages; return the allowlisted text, never the wrapper.
  const message = error.message.split("Error: ").at(-1) ?? "";
  return publicWorkspaceErrors.has(message) ? message : fallback;
}

// A bounded read-only view, using the existing desktop-scoped broker. No recursive filesystem grant.
export async function loadWorkspaceIndex(
  api: LatticeApi["localWorkspace"],
  desktopId: string,
  signal: AbortSignal,
): Promise<WorkspaceIndex> {
  const index: WorkspaceIndex = { directories: {}, entries: [], documents: {}, partial: false };
  const pending = [""];
  let count = 0;
  while (pending.length && count < 80 && index.entries.length < 2000) {
    if (signal.aborted) throw new Error("Index cancelled");
    const relativePath = pending.shift() ?? "";
    try {
      const listing = await api.listDirectory({ desktopId, relativePath });
      index.directories[relativePath] = listing;
      index.entries.push(...listing.entries.slice(0, 2000 - index.entries.length));
      if (listing.entries.length >= 500) index.partial = true;
      for (const entry of listing.entries)
        if (entry.kind === "folder") pending.push(entry.relativePath);
    } catch (error) {
      if (!relativePath) throw error;
      index.partial = true;
    }
    count++;
  }
  if (pending.length) index.partial = true;
  const readable = index.entries
    .filter((entry) => entry.kind === "file" && entry.fileType !== "other")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let bytes = 0;
  for (const entry of readable) {
    if (signal.aborted) throw new Error("Index cancelled");
    if (
      Object.keys(index.documents).length >= 64 ||
      entry.size > 128_000 ||
      bytes + entry.size > 2_000_000
    ) {
      index.partial = true;
      continue;
    }
    try {
      index.documents[entry.relativePath] = await api.readFile({
        desktopId,
        relativePath: entry.relativePath,
      });
      bytes += entry.size;
    } catch {
      index.partial = true;
    }
  }
  return index;
}

export function noteBody(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

export function notePreview(content: string, titleAlreadyShown?: string): string {
  let body = noteBody(content).trim();
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const title = titleAlreadyShown ? normalize(titleAlreadyShown) : "";
  if (title) {
    // Captures can contain both a generated H1 and a title-only body paragraph. Omit
    // these leading echoes in the card, never in the saved note or the source editor.
    const heading = /^#[\t ]+([^\r\n]+)(?:\r?\n|$)/.exec(body);
    if (heading && normalize(heading[1] ?? "") === title)
      body = body.slice(heading[0].length).trimStart();
    const paragraphs = body.split(/\r?\n[\t ]*\r?\n/);
    let first = 0;
    while (first < paragraphs.length && normalize(paragraphs[first] ?? "") === title) first++;
    body = paragraphs.slice(first).join("\n\n");
  }
  return body
    .replace(/[#*`>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export interface NoteReference {
  target: string;
  label: string;
}
export function noteReferences(content: string): NoteReference[] {
  const body = withoutFencedCode(noteBody(content).slice(0, 100_000)).replace(/`[^`\n]+`/g, "");
  const result: NoteReference[] = [];
  for (const match of body.matchAll(
    /\[\[([^\]\n]{1,500})\]\]|!?\[([^\]\n]{0,500})\]\(([^)\n]{1,2048})\)/g,
  )) {
    const [target, alias] = (match[1] ?? "").split("|");
    result.push({
      target: match[1] ? (target ?? "") : (match[3] ?? ""),
      label: match[1] ? (alias ?? target ?? "") : (match[2] ?? "Link"),
    });
    if (result.length >= 200) break;
  }
  return result.slice(0, 200);
}

export type ReferenceResolution =
  | { kind: "file"; entry: WorkspaceDirectoryEntry }
  | { kind: "url"; url: string }
  | { kind: "blocked" | "missing" | "ambiguous" | "anchor" };
export function resolveNoteReference(
  raw: string,
  source: string,
  entries: WorkspaceDirectoryEntry[],
): ReferenceResolution {
  let target: string;
  try {
    target = decodeURIComponent(raw.trim());
  } catch {
    return { kind: "blocked" };
  }
  if (/^https:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      return url.username || url.password ? { kind: "blocked" } : { kind: "url", url: url.href };
    } catch {
      return { kind: "blocked" };
    }
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.startsWith("/") ||
    target.includes("\\") ||
    [...target].some((character) => character.charCodeAt(0) < 32)
  )
    return { kind: "blocked" };
  target = target.split("#")[0] ?? "";
  if (!target) return { kind: "anchor" };
  const normalize = (value: string): string | null => {
    const parts: string[] = [];
    for (const part of value.split("/")) {
      if (part === "." || !part) continue;
      if (part === "..") {
        if (!parts.length) return null;
        parts.pop();
      } else if (part.startsWith(".")) return null;
      else parts.push(part);
    }
    return parts.join("/");
  };
  const parent = source.split("/").slice(0, -1).join("/");
  const relative = normalize(`${parent ? `${parent}/` : ""}${target}`);
  if (relative === null) return { kind: "blocked" };
  const paths = [relative, normalize(target)].filter((value): value is string => value !== null);
  const variants = (value: string) =>
    [value, `${value}.md`, `${value}.coach`, `${value}.text`].map((part) =>
      part.toLocaleLowerCase(),
    );
  for (const candidate of paths) {
    const matches = entries.filter(
      (entry) =>
        entry.kind === "file" &&
        variants(candidate).includes(entry.relativePath.toLocaleLowerCase()),
    );
    if (matches.length > 1) return { kind: "ambiguous" };
    if (matches[0]) return { kind: "file", entry: matches[0] };
  }
  if (!target.includes("/")) {
    const matches = entries.filter(
      (entry) => entry.kind === "file" && variants(target).includes(entry.name.toLocaleLowerCase()),
    );
    if (matches.length > 1) return { kind: "ambiguous" };
    if (matches[0]) return { kind: "file", entry: matches[0] };
  }
  return { kind: "missing" };
}

export interface WorkspaceTab {
  document: WorkspaceFileDocument;
  draft: string;
  history: { content: string; savedAt: string }[];
}

export function workspaceTitle(name: string, kind: "file" | "folder" = "file"): string {
  const dot = name.lastIndexOf(".");
  return kind === "file" && dot > 0 ? name.slice(0, dot) : name;
}

// Presentation only: captureLocalInboxNote writes this exact Markdown filename shape.
// Keep real names for identity, links, saves and explicit renaming. Never shorten folders,
// ordinary dated notes, or other file types just because they contain numbers or hyphens.
export function workspaceDisplayName(name: string, kind: "file" | "folder" = "file"): string {
  if (kind === "folder") return name;
  const capture =
    /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])) - (.+) - [\da-f]{8}(\.md)$/i.exec(name);
  if (!capture || new Date(`${capture[1]}T00:00:00.000Z`).toISOString().slice(0, 10) !== capture[1])
    return name;
  return `${capture[2]}${capture[3]}`;
}

export function workspaceDisplayTitle(name: string, kind: "file" | "folder" = "file"): string {
  return workspaceTitle(workspaceDisplayName(name, kind), kind);
}

export function workspaceEntryTitle(entry: Pick<WorkspaceDirectoryEntry, "name" | "kind">): string {
  return workspaceDisplayTitle(entry.name, entry.kind);
}

export function workspaceDocumentTitle(document: WorkspaceFileDocument, _draft?: string): string {
  return workspaceDisplayTitle(document.name, "file");
}

export function renamedWorkspacePath(value: string, fromPath: string, toPath: string): string {
  return value === fromPath
    ? toPath
    : value.startsWith(`${fromPath}/`)
      ? toPath + value.slice(fromPath.length)
      : value;
}

export function renameWorkspaceTabs(
  tabs: WorkspaceTab[],
  fromPath: string,
  toPath: string,
): WorkspaceTab[] {
  return tabs.map((tab) => {
    const relativePath = renamedWorkspacePath(tab.document.relativePath, fromPath, toPath);
    return relativePath === tab.document.relativePath
      ? tab
      : {
          ...tab,
          document: {
            ...tab.document,
            relativePath,
            name: relativePath.split("/").pop() ?? tab.document.name,
          },
        };
  });
}
export function acceptSavedDocument(
  tab: WorkspaceTab,
  saved: WorkspaceFileDocument,
  submitted: string,
): WorkspaceTab {
  return {
    document: saved,
    draft: tab.draft === submitted ? saved.content : tab.draft,
    history: [
      { content: tab.document.content, savedAt: tab.document.updatedAt },
      ...tab.history,
    ].slice(0, 5),
  };
}

export function insertMarkdown(
  content: string,
  start: number,
  end: number,
  template: string,
): { content: string; cursor: number } {
  const selection = content.slice(start, end);
  const inserted = template.replace("$selection", selection || "Text");
  return {
    content: content.slice(0, start) + inserted + content.slice(end),
    cursor: start + inserted.length,
  };
}
