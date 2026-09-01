import { describe, expect, it } from "vitest";
import { removeDesktopRecords } from "./desktop-lifecycle";

describe("desktop lifecycle", () => {
  it("removes only records owned by the permanently deleted desktop", () => {
    const result = removeDesktopRecords(
      [
        { id: "visit-1", desktopId: "research" },
        { id: "visit-2", desktopId: "client" },
        { id: "visit-3", desktopId: "research" },
      ],
      "research",
    );

    expect(result).toEqual({
      kept: [{ id: "visit-2", desktopId: "client" }],
      removedCount: 2,
    });
  });

  it("is a no-op when the desktop has no browser-owned records", () => {
    const records = [{ id: "visit-1", desktopId: "client" }];
    expect(removeDesktopRecords(records, "research")).toEqual({
      kept: records,
      removedCount: 0,
    });
  });
});
