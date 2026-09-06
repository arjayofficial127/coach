import { describe, expect, it } from "vitest";
import { firstLineTitle, noteTitle } from "./note-title";

describe("firstLineTitle", () => {
  it("uses the first line exactly as written", () => {
    expect(firstLineTitle("catch this bros\n\nthe rest")).toBe("catch this bros");
  });

  it("skips frontmatter and reads the heading below it", () => {
    expect(
      firstLineTitle('---\ncoach_type: "inbox-item"\n---\n\n# catch this bro\n\nMy thought.'),
    ).toBe("catch this bro");
  });

  it("strips only leading Markdown markers, keeping case and punctuation", () => {
    expect(firstLineTitle("## Café — v1.2 (draft)")).toBe("Café — v1.2 (draft)");
    expect(firstLineTitle("- [ ] Call the bank")).toBe("Call the bank");
    expect(firstLineTitle("> Quoted opening")).toBe("Quoted opening");
  });

  it("ignores blank lines and horizontal rules", () => {
    expect(firstLineTitle("\n\n---\n\nReal title")).toBe("Real title");
  });

  it("returns nothing for an empty or whitespace-only file", () => {
    expect(firstLineTitle("")).toBe("");
    expect(firstLineTitle("\n \n\t\n")).toBe("");
    expect(firstLineTitle('---\ncoach_type: "inbox-item"\n---\n')).toBe("");
  });

  it("bounds a long first line instead of returning a paragraph", () => {
    const title = firstLineTitle(`${"word ".repeat(60)}\nbody`);
    expect(title.length).toBeLessThanOrEqual(121);
    expect(title.endsWith("…")).toBe(true);
  });

  it("handles CRLF files", () => {
    expect(firstLineTitle("---\r\nkind: note\r\n---\r\n\r\n# Windows note\r\n")).toBe("Windows note");
  });
});

describe("noteTitle", () => {
  it("falls back to the filename title when there is no first line", () => {
    expect(noteTitle("", "catch this bro")).toBe("catch this bro");
    expect(noteTitle(null, "catch this bro")).toBe("catch this bro");
    expect(noteTitle("Real first line", "catch this bro")).toBe("Real first line");
  });
});
