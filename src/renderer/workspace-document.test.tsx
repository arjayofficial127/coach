import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceDocument } from "./workspace-document";

describe("workspace title controls", () => {
  const render = (content: string, draft = content, saving = false) =>
    renderToStaticMarkup(
      <WorkspaceDocument
        tab={{
          document: {
            desktopId: "work",
            name: "Thought.md",
            relativePath: "Inbox/Thought.md",
            fileType: "markdown",
            content,
            updatedAt: "2026-09-03T00:00:00.000Z",
          },
          draft,
          history: [],
        }}
        saving={saving}
        onChange={() => {}}
        onSave={() => {}}
        onLink={() => {}}
        onSplit={() => {}}
        onReload={() => {}}
        onRename={() => {}}
      />,
    );
  it("opens straight into writing with a closed tools menu and no idle Save button", () => {
    const html = render("# Thought\n\nBody");
    expect(html).toContain("Body</textarea>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('class="ws-document-tools"');
    expect(html).not.toContain('class="ws-file-details"');
    expect(html).not.toContain('class="primary-action"');
    expect(html.match(/Saved locally/g)).toHaveLength(1);
    expect(html).not.toContain("Session history");
    expect(html).not.toContain("characters");
  });
  it("only exposes Save for dirty or in-flight drafts", () => {
    expect(render("saved", "changed")).toContain('class="primary-action">Save</button>');
    expect(render("saved", "changed", true)).toContain(
      'class="primary-action" disabled="">Saving…</button>',
    );
    expect(render("saved", "changed", true)).not.toContain("Saved locally");
  });
  it("does not print a generated capture title repeatedly on the page", () => {
    const html = render('---\ncoach_type: "inbox-item"\n---\n\n# Thought\n\nThought');
    expect(html).toContain('placeholder="Continue your thought…"');
    expect(html).not.toContain("Thought</textarea>");
    expect(html).not.toContain("coach_type");
  });
  it("keeps hostile source inert while making it editable", () => {
    const html = render("<img src=x onerror=evil()>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
  it("exposes an editable title without repeating the full path subtitle", () => {
    const html = renderToStaticMarkup(
      <WorkspaceDocument
        tab={{
          document: {
            desktopId: "work",
            name: "Brief.text",
            relativePath: "Brief.text",
            fileType: "text",
            content: "saved",
            updatedAt: "2026-09-03T00:00:00.000Z",
          },
          draft: "changed",
          history: [],
        }}
        saving={false}
        onChange={() => {}}
        onSave={() => {}}
        onLink={() => {}}
        onSplit={() => {}}
        onReload={() => {}}
        onRename={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Rename file Brief.text"');
    expect(html).not.toContain("<small>Brief.text</small>");
    expect(html).toContain("Unsaved changes");
    expect(html).not.toContain('disabled=""');
  });
});
