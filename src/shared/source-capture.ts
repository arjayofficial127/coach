import type { BrowserSourceCapture } from "./contracts";

// Remote text is data, never HTML or a command. Only the main process supplies provenance.
export function sourceCapture(
  url: string,
  title: string,
  selection: unknown,
): BrowserSourceCapture {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("Open an HTTPS source without credentials before capturing.");
  return {
    url: parsed.href,
    title: title.slice(0, 300) || parsed.hostname,
    text: typeof selection === "string" ? selection.slice(0, 20_000).trim() : "",
  };
}

export function sourceMarkdown(source: BrowserSourceCapture): string {
  const safe = sourceCapture(source.url, source.title, source.text);
  const fence = "`".repeat(
    Math.max(3, ...[...safe.text.matchAll(/`+/g)].map((m) => m[0].length + 1)),
  );
  const url = safe.url.replace(/\(/g, "%28").replace(/\)/g, "%29");
  // A fixed label prevents a hostile page title from introducing Markdown syntax.
  return `${safe.text ? `${fence}quote\n${safe.text}\n${fence}\n\n` : ""}[Source](${url})\n`;
}

export function withoutFencedCode(content: string): string {
  let fence = 0;
  return content
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(`{3,})/.exec(line);
      if (match && !fence) {
        fence = match[1]!.length;
        return "";
      }
      if (match && match[1]!.length >= fence && /^`+\s*$/.test(line)) {
        fence = 0;
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n");
}
