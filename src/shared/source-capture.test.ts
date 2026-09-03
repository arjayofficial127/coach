import { describe, expect, it } from "vitest";
import { noteReferences } from "../renderer/local-workspace-model";
import { sourceCapture, sourceMarkdown, withoutFencedCode } from "./source-capture";

describe("explicit browser source capture", () => {
  it.each([
    "file:///C:/private/secret.md",
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:secret@example.com",
  ])("rejects unsafe provenance %s", (url) => {
    expect(() => sourceCapture(url, "Source", "quote")).toThrow();
  });
  it("normalizes provenance and bounds untrusted text", () => {
    expect(sourceCapture("https://example.com", "", { text: "not a selection" })).toEqual({
      url: "https://example.com/",
      title: "example.com",
      text: "",
    });
    const result = sourceCapture("https://example.com", "t".repeat(400), "q".repeat(30_000));
    expect(result.title).toHaveLength(300);
    expect(result.text).toHaveLength(20_000);
  });
  it("keeps hostile Markdown literal and indexes only the real source", () => {
    const content = sourceMarkdown({
      url: "https://example.com/a(b)",
      title: "]](file:///private)",
      text: "[[Private.md]]\n```\n![image](https://evil.example)\n<script>evil()</script>",
    });
    expect(content).toContain("````quote");
    expect(content).toContain("[Source](https://example.com/a%28b%29)");
    expect(noteReferences(content)).toEqual([
      { label: "Source", target: "https://example.com/a%28b%29" },
    ]);
    expect(content).not.toContain("file:///private");
  });
  it("does not close a fence on a backtick-prefixed content line", () => {
    expect(withoutFencedCode("```quote\n```not-a-close\n[[private]]\n```\n[[Real]]")).toBe(
      "\n\n\n\n[[Real]]",
    );
  });
});
