export interface NotePage {
  prefix: string;
  body: string;
}

// A reversible view over the source, not a Markdown serializer. The prefix remains
// byte-for-byte intact, including frontmatter, line endings and generated headings.
export function notePage(source: string, title: string): NotePage {
  const metadata = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)?.[0] ?? "";
  let offset = metadata.length;
  const heading = /^(?:[\t ]*\r?\n)*#[\t ]+([^\r\n]+)(?:\r?\n|$)(?:[\t ]*\r?\n)*/.exec(
    source.slice(offset),
  );
  if (heading?.[1]?.trim() === title) {
    offset += heading[0].length;
    // Only generated Inbox captures get a collapsed title-only first paragraph.
    // Ordinary prose, repeated sentences and user-authored notes are never deduped.
    if (/^coach_type:\s*["']?inbox-item["']?\s*$/m.test(metadata)) {
      const paragraph = /^([^\r\n]+)(?:\r?\n[\t ]*\r?\n|\s*$)/.exec(source.slice(offset));
      if (paragraph?.[1]?.trim() === title) offset += paragraph[0].length;
    }
  }
  return { prefix: source.slice(0, offset), body: source.slice(offset) };
}

export function writeNotePage(page: NotePage, body: string): string {
  if (body === page.body) return page.prefix + page.body;
  const newline = page.prefix.includes("\r\n") ? "\r\n" : "\n";
  const separator = page.prefix && !/\r?\n$/.test(page.prefix) && body ? newline + newline : "";
  return page.prefix + separator + body;
}
