import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceDirectoryEntry, WorkspaceFileDocument } from "../shared/contracts";
import {
  resolveNoteReference,
  workspaceDisplayName,
  workspaceDisplayTitle,
  workspaceDocumentTitle,
  workspaceEntryTitle,
  workspaceTitle,
} from "./local-workspace-model";
import { WorkspaceDocument } from "./workspace-document";
import { WorkspaceHome } from "./workspace-home";

const name = "2026-09-03 - catch this bro - fd1d6b08.md";
const entry: WorkspaceDirectoryEntry = {
  id: "capture",
  name,
  relativePath: `Inbox/${name}`,
  kind: "file",
  fileType: "markdown",
  size: 100,
  updatedAt: "2026-09-03T00:00:00.000Z",
};
const document: WorkspaceFileDocument = {
  ...entry,
  desktopId: "research",
  fileType: "markdown",
  content: '---\ncoach_type: "inbox-item"\n---\n\n# catch this bro\n\nMy thought.',
};
const noop = () => {};

describe("readable capture titles", () => {
  it("removes only the generated capture wrapper, preserving case, punctuation and extension", () => {
    expect(workspaceDisplayTitle(name)).toBe("catch this bro");
    expect(workspaceDisplayName(name)).toBe("catch this bro.md");
    expect(workspaceDisplayTitle("2024-02-29 - Café - v1.2 - aBcD1234.MD")).toBe("Café - v1.2");
    expect(workspaceDisplayTitle("2026-09-03 - 2025-01-01 - Travel - fd1d6b08.md")).toBe(
      "2025-01-01 - Travel",
    );
  });

  it.each([
    "2026-09-03 - Journal.md",
    "Research - fd1d6b08.md",
    "2026-09-03 - Brief - not-an-id.md",
    "2026-09-03 - Brief - fd1d6b0.md",
    "2026-09-03 - Brief - fd1d6b080.md",
    "2026-09-03 - Brief - fd1d6b08.coach",
    "2026-09-03 - Brief - fd1d6b08.text",
    "2026-09-03 - Brief - fd1d6b08.md.backup",
    "2026-13-03 - Brief - fd1d6b08.md",
    "2026-02-30 - Brief - fd1d6b08.md",
    "2026-09-03 -  - fd1d6b08.md",
    "Brief.md",
  ])("keeps non-capture filename %s", (filename) => {
    expect(workspaceDisplayName(filename)).toBe(filename);
  });

  it("does not shorten folders or alter the physical rename stem and link identity", () => {
    const original = JSON.stringify(entry);
    expect(workspaceDisplayTitle(name, "folder")).toBe(name);
    expect(workspaceTitle(name)).toBe("2026-09-03 - catch this bro - fd1d6b08");
    expect(resolveNoteReference(entry.relativePath, "Source.md", [entry])).toEqual({
      kind: "file",
      entry,
    });
    expect(resolveNoteReference("catch this bro", "Source.md", [entry])).toEqual({
      kind: "missing",
    });
    expect(JSON.stringify(entry)).toBe(original);
  });

  it("uses the filename as the single title even when content starts differently", () => {
    expect(workspaceEntryTitle(entry)).toBe("catch this bro");
    expect(workspaceEntryTitle({ ...entry, kind: "folder", name: "Inbox" })).toBe("Inbox");
    expect(workspaceDocumentTitle(document)).toBe("catch this bro");
    expect(workspaceDocumentTitle(document, "Renamed in the note\n\nBody")).toBe("catch this bro");
    expect(workspaceDocumentTitle({ ...document, content: "" })).toBe("catch this bro");
  });

  it("keeps the filename title in the list and editable title line", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHome
        files={[entry]}
        folders={[]}
        documents={{ [entry.relativePath]: document }}
        capture=""
        captureBusy={false}
        onCaptureChange={noop}
        onCapture={noop}
        onOpen={noop}
        onFolder={noop}
        onNewFolder={noop}
        onFocus={noop}
        onInbox={noop}
        onNew={noop}
        onRecent={noop}
      />,
    );
    expect(html).toContain("<strong>catch this bro</strong>");

    const heading = renderToStaticMarkup(
      <WorkspaceDocument
        tab={{
          document,
          draft: '---\ncoach_type: "inbox-item"\n---\n\n# catch this bros\n\nMy thought.',
          history: [],
        }}
        saving={false}
        onChange={noop}
        onSave={noop}
        onLink={noop}
        onSplit={noop}
        onReload={noop}
        onRename={noop}
      />,
    );
    expect(heading).toContain('aria-label="Document title"');
    expect(heading).toContain('value="2026-09-03 - catch this bro - fd1d6b08"');
  });

  it("renders clean Home, recent and Inbox titles with a concise accessible action", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHome
        files={[entry]}
        folders={[]}
        documents={{ [entry.relativePath]: document }}
        capture=""
        captureBusy={false}
        onCaptureChange={noop}
        onCapture={noop}
        onOpen={noop}
        onFolder={noop}
        onNewFolder={noop}
        onFocus={noop}
        onInbox={noop}
        onNew={noop}
        onRecent={noop}
      />,
    );
    expect(html).toContain("<strong>catch this bro</strong>");
    expect(html).toContain('aria-label="Open catch this bro"');
    expect(html).not.toContain("fd1d6b08");
  });

  it("keeps technical details off the default page, without changing source or duplicating the heading", () => {
    const original = JSON.stringify(document);
    const html = renderToStaticMarkup(
      <WorkspaceDocument
        tab={{ document, draft: document.content, history: [] }}
        saving={false}
        onChange={noop}
        onSave={noop}
        onLink={noop}
        onSplit={noop}
        onReload={noop}
        onRename={noop}
      />,
    );
    expect(html).toContain('aria-label="Document title"');
    expect(html).toContain('value="2026-09-03 - catch this bro - fd1d6b08"');
    expect(html).not.toContain('class="ws-file-details"');
    expect(html).toContain('aria-label="Note tools for catch this bro" aria-expanded="false"');
    expect(html).toContain("My thought.</textarea>");
    expect(html).not.toContain("<h1>");
    expect(JSON.stringify(document)).toBe(original);
  });
});
