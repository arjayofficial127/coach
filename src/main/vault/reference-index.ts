import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type {
  CanvasLinkKind,
  CanvasPageNode,
  CanvasPageRecord,
  SavedLinkRecord,
  VaultReferenceEntry,
  VaultReferenceIndex,
} from "../../shared/contracts";
import { assertPathWithinRoot } from "./atomic-note";

function isSafeRelativeVaultPath(input: string): boolean {
  if (!input.trim() || path.isAbsolute(input)) return false;
  const parts = input.replace(/\\/g, "/").split("/");
  return parts.every((part) => part && part !== "." && part !== ".." && !part.includes("\0"));
}

function objectTitle(node: CanvasPageNode): string {
  return (
    node.latticeTitle ||
    (node.type === "link"
      ? node.url
      : node.type === "file"
        ? path.basename(node.file)
        : "Untitled object")
  );
}

function normalizedUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function safeFileLabel(input: string): string {
  const normalized = input.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) || "Unnamed file";
}

function opaqueFileKey(input: string): string {
  return `file:${createHash("sha256").update(input.replace(/\\/g, "/").toLowerCase()).digest("hex").slice(0, 24)}`;
}

async function localFileStatus(
  vaultRoot: string,
  target: string,
): Promise<Pick<VaultReferenceEntry, "status" | "diagnostic" | "repairHint">> {
  if (!isSafeRelativeVaultPath(target)) {
    return {
      status: "unresolved",
      diagnostic: "The target is not a safe vault-relative file reference.",
      repairHint: "Choose a file inside the vault and enter its vault-relative name.",
    };
  }
  const absoluteTarget = path.resolve(vaultRoot, ...target.replace(/\\/g, "/").split("/"));
  assertPathWithinRoot(vaultRoot, absoluteTarget);
  try {
    const canonicalTarget = await realpath(absoluteTarget);
    assertPathWithinRoot(vaultRoot, canonicalTarget);
    if (!(await lstat(canonicalTarget)).isFile()) throw new Error("not-file");
    return {
      status: "resolved",
      diagnostic: "The referenced file exists inside this vault.",
      repairHint: "No repair needed.",
    };
  } catch {
    return {
      status: "unresolved",
      diagnostic: "No regular file exists at this vault-relative target.",
      repairHint: "Restore the file or edit the reference on its source canvas.",
    };
  }
}

export async function buildVaultReferenceIndex(
  vaultRoot: string,
  savedLinks: SavedLinkRecord[],
  pages: CanvasPageRecord[],
  generatedAt = new Date().toISOString(),
): Promise<VaultReferenceIndex> {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const entries: VaultReferenceEntry[] = [];
  const add = (entry: VaultReferenceEntry) => entries.push(entry);

  for (const link of savedLinks) {
    const url = normalizedUrl(link.url);
    add({
      id: `saved-link:${link.id}`,
      kind: "url",
      source: { kind: "saved-link", id: link.id, title: link.title },
      label: link.title,
      targetKey: `url:${url ?? link.url}`,
      targetLabel: url ? new URL(url).hostname.replace(/^www\./, "") : "Invalid URL",
      status: url ? "external" : "unresolved",
      diagnostic: url
        ? "External HTTPS target; availability is not probed."
        : "The saved URL is not valid HTTPS.",
      repairHint: url
        ? "Open the saved link to verify the remote destination."
        : "Edit the saved link URL in Obsidian.",
    });
  }

  for (const page of pages) {
    for (const node of page.nodes) {
      const source = {
        kind: "page" as const,
        id: page.id,
        title: page.title,
        objectId: node.id,
        objectTitle: objectTitle(node),
      };
      const candidates = [
        ...(node.type === "link"
          ? [
              {
                id: `node:${node.id}`,
                label: node.latticeTitle,
                kind: "url" as const,
                target: node.url,
              },
            ]
          : []),
        ...(node.type === "file"
          ? [
              {
                id: `node:${node.id}`,
                label: node.latticeTitle,
                kind: node.latticeKind,
                target: node.file,
              },
            ]
          : []),
        ...(node.type === "text" ? (node.latticeLinks ?? []) : []),
      ];
      for (const candidate of candidates) {
        const base = {
          id: `${page.id}:${node.id}:${candidate.id}`,
          kind: candidate.kind as CanvasLinkKind,
          source,
          label: candidate.label,
        };
        if (candidate.kind === "page") {
          const target = pageById.get(candidate.target);
          add({
            ...base,
            targetKey: `page:${candidate.target}`,
            targetLabel: target?.title ?? "Missing canvas page",
            status: target ? "resolved" : "unresolved",
            diagnostic: target
              ? "The canvas page ID resolves uniquely."
              : "No indexed canvas page has this stable ID.",
            repairHint: target
              ? "No repair needed."
              : "Restore the page or choose a current page on the source canvas.",
          });
        } else if (candidate.kind === "object") {
          const target = page.nodes.find((item) => item.id === candidate.target);
          add({
            ...base,
            targetKey: `object:${page.id}:${candidate.target}`,
            targetLabel: target ? objectTitle(target) : "Missing canvas object",
            status: target ? "resolved" : "unresolved",
            diagnostic: target
              ? "The object exists on the source canvas."
              : "No object on the source canvas has this ID.",
            repairHint: target
              ? "No repair needed."
              : "Choose an existing object on the source canvas.",
          });
        } else if (candidate.kind === "url") {
          const url = normalizedUrl(candidate.target);
          add({
            ...base,
            targetKey: `url:${url ?? candidate.target}`,
            targetLabel: url ? new URL(url).hostname.replace(/^www\./, "") : "Invalid URL",
            status: url ? "external" : "unresolved",
            diagnostic: url
              ? "External HTTPS target; availability is not probed."
              : "The URL is missing or is not valid HTTPS.",
            repairHint: url
              ? "Open it to verify the remote destination."
              : "Enter a complete HTTPS URL on the source canvas.",
          });
        } else {
          const result = await localFileStatus(vaultRoot, candidate.target);
          add({
            ...base,
            targetKey: opaqueFileKey(candidate.target),
            targetLabel: safeFileLabel(candidate.target),
            ...result,
          });
        }
      }
    }
  }

  entries.sort(
    (left, right) =>
      left.source.title.localeCompare(right.source.title) || left.label.localeCompare(right.label),
  );
  return {
    generatedAt,
    entries,
    unresolvedCount: entries.filter((entry) => entry.status === "unresolved").length,
  };
}
