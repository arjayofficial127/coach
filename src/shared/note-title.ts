const MAX_TITLE_LENGTH = 120;

/**
 * The title a note shows is its own first line, so renaming a heading renames what the reader sees
 * without touching the file on disk. Frontmatter is skipped because it is metadata, not a title.
 */
export function firstLineTitle(content: string): string {
  let body = content.replace(/^﻿/, "");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
  if (frontmatter) body = body.slice(frontmatter[0].length);

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s{0,3}[-*+]\s+(?:\[[ xX]\]\s+)?/, "")
      .trim();
    if (!line || /^[-=_*]{3,}$/.test(line)) continue;
    return line.length > MAX_TITLE_LENGTH ? `${line.slice(0, MAX_TITLE_LENGTH).trimEnd()}…` : line;
  }
  return "";
}

/** Presentation title for an open or listed file: its first line, else its filename. */
export function noteTitle(content: string | null | undefined, fallback: string): string {
  return (content ? firstLineTitle(content) : "") || fallback;
}
