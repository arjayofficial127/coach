import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderProbeMarkdown } from "./atomic-note";
import { listSavedLinksFromVault, parseSavedLinkMarkdown } from "./saved-link-reader";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("saved link reader", () => {
  it("parses the constrained frontmatter format", () => {
    const markdown = renderProbeMarkdown(
      {
        title: "A useful page",
        url: "https://example.com/read",
        description: "A concise description.",
        folder: "Research",
      },
      "link-1",
      "2026-08-28T00:00:00.000Z",
    );
    expect(parseSavedLinkMarkdown(markdown, "Saved Links/Research/page.md", "Research")).toEqual({
      id: "link-1",
      title: "A useful page",
      url: "https://example.com/read",
      description: "A concise description.",
      savedAt: "2026-08-28T00:00:00.000Z",
      folder: "Research",
      desktopId: "",
      relativePath: "Saved Links/Research/page.md",
    });
  });

  it("lists valid links recursively and ignores unrelated Markdown", async () => {
    const vault = await mkdtemp(path.join(os.tmpdir(), "lattice-library-test-"));
    temporaryRoots.push(vault);
    const folder = path.join(vault, "Saved Links", "Build");
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, "saved.md"),
      renderProbeMarkdown(
        {
          title: "Builder",
          url: "https://example.com/build",
          description: "Build reference",
          folder: "Build",
        },
        "link-2",
        "2026-08-28T01:00:00.000Z",
      ),
      "utf8",
    );
    await writeFile(path.join(folder, "ordinary.md"), "# Not a saved link\n", "utf8");

    await expect(listSavedLinksFromVault(vault)).resolves.toEqual([
      expect.objectContaining({ id: "link-2", folder: "Build" }),
    ]);
  });
});
