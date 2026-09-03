import { describe, expect, it } from "vitest";
import { notePage, writeNotePage } from "./workspace-page-model";

describe("reversible clean note editing", () => {
  const capture =
    '---\ncoach_type: "inbox-item"\nunknown: keep-me\n---\n\n# Catch this\n\nCatch this';
  it.each([
    "",
    "Plain text",
    "# Different heading\n\nBody",
    "# Catch this\n\nBody",
    capture,
    capture.replaceAll("\n", "\r\n"),
  ])("opening and switching modes leaves source byte-identical: %s", (source) => {
    const page = notePage(source, "Catch this");
    expect(writeNotePage(page, page.body)).toBe(source);
  });
  it("collapses only generated title echoes and appends without overwriting them", () => {
    const page = notePage(capture, "Catch this");
    expect(page.body).toBe("");
    expect(writeNotePage(page, "Next thought")).toBe(`${capture}\n\nNext thought`);
    expect(notePage(writeNotePage(page, "Next thought"), "Catch this").body).toBe("Next thought");
  });
  it("preserves metadata, source headings and CRLF when editing the body", () => {
    const source = `${capture}\n\nOld body`.replaceAll("\n", "\r\n");
    const page = notePage(source, "Catch this");
    expect(page.body).toBe("Old body");
    expect(writeNotePage(page, "New body")).toBe(source.replace("Old body", "New body"));
    expect(writeNotePage(notePage(capture.replaceAll("\n", "\r\n"), "Catch this"), "More")).toBe(
      `${capture.replaceAll("\n", "\r\n")}\r\n\r\nMore`,
    );
  });
  it("does not remove repeated ordinary prose or mismatched capture titles", () => {
    expect(notePage("# Catch this\n\nCatch this\n\nCatch this", "Catch this").body).toBe(
      "Catch this\n\nCatch this",
    );
    expect(notePage(capture, "Renamed").body).toContain("# Catch this");
    expect(notePage(`${capture} again\n\nMore`, "Catch this").body).toBe(
      "Catch this again\n\nMore",
    );
  });
  it("retains unsupported Markdown, links and hostile text without parsing into HTML", () => {
    const body = "<script>evil()</script>\n[[Other]]\n![local](image.png)\n```\n# Catch this\n```";
    expect(notePage(`# Catch this\n\n${body}`, "Catch this").body).toBe(body);
    expect(writeNotePage(notePage(`# Catch this\n\n${body}`, "Catch this"), `${body}\nMore`)).toBe(
      `# Catch this\n\n${body}\nMore`,
    );
  });
  it("keeps meaningful body indentation editable and does not fold indented code as a heading", () => {
    expect(notePage("# Catch this\n\n    code()", "Catch this").body).toBe("    code()");
    expect(notePage("    # Catch this\n\nBody", "Catch this").body).toBe(
      "    # Catch this\n\nBody",
    );
    expect(notePage("# Catch this\r\n\r\n\tcode()", "Catch this").body).toBe("\tcode()");
  });
});
