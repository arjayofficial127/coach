import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceDirectoryEntry, WorkspaceFileDocument } from "../shared/contracts";
import { notePreview } from "./local-workspace-model";
import { WorkspaceHome } from "./workspace-home";

const title = "catch this bros";
const entry: WorkspaceDirectoryEntry = {
  id: "capture",
  name: `2026-09-03 - ${title} - fd1d6b08.md`,
  relativePath: `Inbox/2026-09-03 - ${title} - fd1d6b08.md`,
  kind: "file",
  fileType: "markdown",
  size: 100,
  updatedAt: "2026-09-03T00:00:00.000Z",
};
const noop = () => {};
const dashboard = (content?: string) => {
  const documents: Record<string, WorkspaceFileDocument> =
    content === undefined
      ? {}
      : {
          [entry.relativePath]: { ...entry, desktopId: "research", fileType: "markdown", content },
        };
  const before = JSON.stringify(documents);
  const html = renderToStaticMarkup(
    <WorkspaceHome
      files={[entry]}
      folders={[]}
      documents={documents}
      capture=""
      captureBusy={false}
      onCaptureChange={noop}
      onCapture={noop}
      onOpen={noop}
      onFolder={noop}
      onNewFolder={noop}
      onFocus={noop}
      onInbox={noop}
      onNew={noop}
      onRecent={noop}
    />,
  );
  expect(JSON.stringify(documents)).toBe(before);
  return html;
};

describe("workspace note previews", () => {
  it.each([
    `# ${title}\n\n${title}`,
    `---\ncoach_type: "inbox-item"\n---\n\n# ${title}\n\n${title}\n`,
    `\r\n# ${title}\r\n\r\ncatch   this bros\r\n`,
    `# ${title}\n`,
    title,
    `# ${title}\n\n${title}\n\n${title}`,
  ])("shows the capture once with no empty/filler paragraph: %s", (content) => {
    expect(notePreview(content, title)).toBe("");
  });

  it.each([
    [`# ${title}\n\nMore to say.`, "More to say."],
    [`# ${title}\n\n${title}\n\nMore to say.`, "More to say."],
    [`# ${title}\nMore to say.`, "More to say."],
    [`# Other heading\n\n${title}`, `Other heading ${title}`],
    [`# ${title}\n\n${title} tomorrow.`, `${title} tomorrow.`],
    [`# ${title}\n\nA story.\n\n${title}`, `A story. ${title}`],
    [`# ${title}\n\n> ${title}`, title],
    [`# ${title}\n\n\`\`\`\n${title}\n\`\`\``, title],
    [`# ${title}\n\n${title}!`, `${title}!`],
  ])("preserves additional or structurally meaningful content: %s", (content, preview) => {
    expect(notePreview(content, title)).toBe(preview);
  });

  it("compares before truncating and retains the full additional preview budget", () => {
    const extra = "More content. ".repeat(30);
    expect(notePreview(`# ${title}\n\n${extra}`, title)).toBe(extra.trim().slice(0, 180));
    expect(notePreview(`${title} ${"x".repeat(200)}`, title)).toContain(`${title} `);
  });

  it("lists indexed files without leaking document content into the dashboard", () => {
    const html = dashboard(`# ${title}\n\nPrivate body copy.`);
    expect(html).toContain(`<strong>${title}</strong>`);
    expect(html).toContain("Inbox");
    expect(html).not.toContain("Private body copy.");
  });

  it("retains the existing preview when there is no displayed title to compare", () => {
    expect(notePreview(`# ${title}\n\n${title}`)).toBe(`${title} ${title}`);
  });
});
