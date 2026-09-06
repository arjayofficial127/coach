import { describe, expect, it } from "vitest";
import { parseShellLocation } from "./shell-location-model";

describe("shell location", () => {
  const desktops = new Set(["work", "personal"]);

  it("restores a valid desktop and surface", () => {
    expect(
      parseShellLocation(
        JSON.stringify({ version: 1, desktopId: "personal", surface: "files" }),
        desktops,
      ),
    ).toEqual({ version: 1, desktopId: "personal", surface: "files" });
  });

  it("rejects missing desktops and unknown surfaces", () => {
    expect(
      parseShellLocation(
        JSON.stringify({ version: 1, desktopId: "missing", surface: "files" }),
        desktops,
      ),
    ).toBeNull();
    expect(
      parseShellLocation(
        JSON.stringify({ version: 1, desktopId: "work", surface: "surprise" }),
        desktops,
      ),
    ).toBeNull();
  });

  it("rejects malformed storage", () => {
    expect(parseShellLocation("not-json", desktops)).toBeNull();
  });
});
