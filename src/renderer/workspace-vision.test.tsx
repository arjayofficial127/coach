import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isCoachBoard, newCoachPlanner, writeCoachObject } from "../shared/coach-board";
import type { WorkspaceDirectoryEntry, WorkspaceFileDocument } from "../shared/contracts";
import { sourceMarkdown } from "../shared/source-capture";
import { WorkspaceBoard } from "./workspace-board";
import { WorkspaceHome } from "./workspace-home";
import { WorkspaceMarkdown } from "./workspace-markdown";

const noop = () => {};
const home = (
  files: WorkspaceDirectoryEntry[] = [],
  documents: Record<string, WorkspaceFileDocument> = {},
) =>
  renderToStaticMarkup(
    <WorkspaceHome
      files={files}
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

describe("unified workspace views", () => {
  it("renders honest empty states and creation choices without fictional tasks", () => {
    const html = home();
    expect(html).toContain("No recent files yet.");
    expect(html).toContain("No board cards due today.");
    expect(html).toContain("Create your first folder");
    expect(html).toContain('data-icon="inbox"');
    expect(html).toContain('data-icon="papers"');
    expect(html).toContain('data-icon="calendar"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("% complete");
  });
  it("uses a paper icon instead of a pencil for Markdown files", () => {
    const html = home([
      {
        id: "note",
        name: "Thought.md",
        relativePath: "Inbox/Thought.md",
        kind: "file",
        fileType: "markdown",
        size: 10,
        updatedAt: new Date().toISOString(),
      },
    ]);
    expect(html).toContain('data-icon="file"');
    expect(html).not.toContain('data-icon="edit"');
  });
  it("derives Today and Inbox from real indexed content", () => {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const planner = newCoachPlanner("Actual planner");
    planner.cards.push({
      id: "one",
      title: "Real due card",
      columnId: planner.columns[0]!.id,
      dueDate: today,
    });
    const file: WorkspaceDirectoryEntry = {
      id: "1",
      name: "Plan.coach",
      relativePath: "Inbox/Plan.coach",
      kind: "file",
      fileType: "coach",
      size: 1,
      updatedAt: now.toISOString(),
    };
    const document: WorkspaceFileDocument = {
      ...file,
      desktopId: "desk",
      fileType: "coach",
      content: writeCoachObject(planner),
    };
    const html = home([file], { [file.relativePath]: document });
    expect(html).toContain("Real due card");
    expect(html).toContain("Inbox · 1");
    expect(html).toContain("Workspace summary");
    expect(html).toContain("Location");
    expect(html).toContain("Modified");
    expect(html).not.toContain("No board cards due today.");
  });
  it("opens an empty planner in Calendar without seeded cards", () => {
    const planner = newCoachPlanner("My plan");
    expect(isCoachBoard(planner)).toBe(true);
    expect(planner.cards).toEqual([]);
    const html = renderToStaticMarkup(
      <WorkspaceBoard board={planner} onChange={noop} onLink={noop} />,
    );
    expect(html).toContain("ws-calendar-grid");
  });
  it("renders quotes as inert text and invokes local embed rendering only outside fences", () => {
    const content = sourceMarkdown({
      url: "https://example.com",
      title: "Source",
      text: "![[Hidden.coach]]\n<img src=x onerror=evil()>\n```\n[[Private]]",
    });
    const html = renderToStaticMarkup(
      <WorkspaceMarkdown
        content={content + "\n![[Board.coach]]"}
        onLink={noop}
        onEmbed={(target) => <span data-local-embed>{target}</span>}
      />,
    );
    expect(html).toContain("<blockquote>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html.match(/data-local-embed/g)).toHaveLength(1);
    expect(html).toContain("Board.coach</span>");
  });
});
