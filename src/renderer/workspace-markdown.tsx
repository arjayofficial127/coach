/** biome-ignore-all lint/suspicious/noArrayIndexKey: Parsed Markdown table cells are stateless and identified by their source row and column positions. */
import { createElement, type ReactNode } from "react";
import { noteBody } from "./local-workspace-model";

function inline(text: string, onLink: (target: string) => void): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern =
    /(!?\[([^\]\n]{0,500})\]\(([^)\n]{1,2048})\)|\[\[([^\]\n]{1,500})\]\]|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    result.push(text.slice(last, match.index));
    const key = match.index;
    if (match[3] || match[4]) {
      const [target, alias] = (match[4] ?? match[3] ?? "").split("|");
      result.push(
        <button
          type="button"
          className="ws-inline-link"
          key={key}
          onClick={() => onLink(target ?? "")}
        >
          {match[1]?.startsWith("!") ? "Image: " : ""}
          {match[2] || alias || target || "Link"}
        </button>,
      );
    } else if (match[5]) result.push(<strong key={key}>{match[5]}</strong>);
    else if (match[6]) result.push(<code key={key}>{match[6]}</code>);
    else result.push(<em key={key}>{match[7]}</em>);
    last = (match.index ?? 0) + match[0].length;
  }
  result.push(text.slice(last));
  return result;
}

// Render a deliberately small Markdown dialect as React nodes, never HTML or remote embeds.
export function WorkspaceMarkdown({
  content,
  onChange,
  onLink,
  onEmbed,
  titleAlreadyShown,
}: {
  content: string;
  onChange?: (content: string) => void;
  onLink: (target: string) => void;
  onEmbed?: (target: string) => ReactNode;
  titleAlreadyShown?: string;
}) {
  const body = noteBody(content);
  const prefix = content.slice(0, content.length - body.length);
  const lines = body.slice(0, 100_000).split(/\r?\n/);
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const key = i;
    const fence = /^(`{3,})(.*)$/.exec(line);
    if (fence) {
      const code: string[] = [];
      while (
        ++i < lines.length &&
        !new RegExp(`^\u0060{${fence[1]!.length},}\\s*$`).test(lines[i] ?? "")
      )
        code.push(lines[i] ?? "");
      blocks.push(
        fence[2]?.trim() === "quote" ? (
          <blockquote key={key}>{code.join("\n")}</blockquote>
        ) : (
          <pre key={key}>
            <code>{code.join("\n")}</code>
          </pre>
        ),
      );
      continue;
    }
    if (!line.trim()) continue;
    const embed = /^!\[\[([^\]\n]{1,500})\]\]$/.exec(line.trim());
    if (embed && onEmbed) {
      blocks.push(<div key={key}>{onEmbed(embed[1]!.split("|")[0]!)}</div>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      if (!blocks.length && heading[1] === "#" && heading[2]?.trim() === titleAlreadyShown)
        continue;
      blocks.push(
        createElement(`h${heading[1]?.length ?? 1}`, { key }, inline(heading[2] ?? "", onLink)),
      );
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const cells = (row: string) => row.replace(/^\s*\||\|\s*$/g, "").split("|");
      const rows: string[][] = [];
      i++;
      while (i + 1 < lines.length && lines[i + 1]?.includes("|"))
        rows.push(cells(lines[++i] ?? ""));
      blocks.push(
        <div className="ws-markdown-table" key={key}>
          <table>
            <thead>
              <tr>
                {cells(line).map((cell, index) => (
                  <th key={`${key}-${index}`}>{inline(cell, onLink)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${key}-${index}`}>
                  {row.map((cell, column) => (
                    <td key={`${key}-${index}-${column}`}>{inline(cell, onLink)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const task = /^\s*[-*] \[([ xX])\] (.*)$/.exec(line);
    if (task) {
      const lineIndex = i;
      blocks.push(
        <label className="ws-checkline" key={key}>
          <input
            type="checkbox"
            checked={task[1]?.toLowerCase() === "x"}
            disabled={!onChange || body.length > 100_000}
            onChange={() => {
              if (body.length > 100_000) return;
              const next = [...lines];
              next[lineIndex] = line.replace(
                /\[([ xX])\]/,
                task[1]?.toLowerCase() === "x" ? "[ ]" : "[x]",
              );
              onChange?.(prefix + next.join("\n"));
            }}
          />
          <span>{inline(task[2] ?? "", onLink)}</span>
        </label>,
      );
    } else if (/^>\s?/.test(line))
      blocks.push(<blockquote key={key}>{inline(line.replace(/^>\s?/, ""), onLink)}</blockquote>);
    else if (/^\s*([-*]|\d+\.)\s/.test(line))
      blocks.push(
        <p className="ws-listline" key={key}>
          • {inline(line.replace(/^\s*([-*]|\d+\.)\s/, ""), onLink)}
        </p>,
      );
    else if (/^---+$/.test(line)) blocks.push(<hr key={key} />);
    else blocks.push(<p key={key}>{inline(line, onLink)}</p>);
  }
  return (
    <article className="ws-markdown" data-markdown-preview>
      {body.length > 100_000 && (
        <p className="ws-notice">
          Preview shows the first 100,000 characters. Use Markdown source to edit the complete file.
        </p>
      )}
      {blocks.length ? (
        blocks
      ) : (
        <p className="ws-muted">
          Your note starts here. Choose Edit note to add your first thought.
        </p>
      )}
    </article>
  );
}
