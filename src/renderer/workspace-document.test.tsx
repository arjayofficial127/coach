import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceDocument } from "./workspace-document";

describe("workspace title controls", () => {
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
