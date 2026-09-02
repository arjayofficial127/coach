import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceMarkdown } from "./workspace-markdown";

describe("safe workspace Markdown", () => {
  it("bounds malformed and oversized previews without offering lossy checkbox edits", () => {
    const content = `- [ ] Keep the whole file\n${"[".repeat(110_000)}\nEND OF FILE`;
    const rendered = renderToStaticMarkup(
      <WorkspaceMarkdown content={content} onChange={() => undefined} onLink={() => undefined} />,
    );
    expect(rendered).toContain("Preview shows the first 100,000 characters");
    expect(rendered).toContain('disabled=""');
    expect(rendered).not.toContain("END OF FILE");
  });
  it("renders useful structures without HTML execution or remote loads", () => {
    const rendered = renderToStaticMarkup(
      <WorkspaceMarkdown
        content={
          "# Hello\n\n- [ ] Review\n\n> A thought\n\n| Name | Status |\n| --- | --- |\n| Task | Next |\n\n<script>alert(1)</script>\n![tracking](https://attacker.example/image.png)\n[unsafe](javascript:alert(1))"
        }
        onLink={() => undefined}
      />,
    );
    expect(rendered).toContain("<h1>Hello</h1>");
    expect(rendered).toContain('type="checkbox"');
    expect(rendered).toContain("<table>");
    expect(rendered).toContain("<blockquote>");
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("<img");
    expect(rendered).not.toContain("href=");
    expect(rendered).toContain("&lt;script&gt;");
  });
});
