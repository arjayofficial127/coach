import { describe, expect, it } from "vitest";
import { applyRequestedTabOrder, moveTabInOrder } from "./tab-order";

describe("moveTabInOrder", () => {
  const order = ["a", "b", "c", "d"];

  it("drops a tab before the tab it was released on", () => {
    expect(moveTabInOrder(order, "d", "b", "before")).toEqual(["a", "d", "b", "c"]);
  });

  it("drops a tab after the tab it was released on", () => {
    expect(moveTabInOrder(order, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
  });

  it("keeps the order when a tab is dropped on itself", () => {
    expect(moveTabInOrder(order, "b", "b", "before")).toEqual(order);
  });

  it("ignores ids that are not open", () => {
    expect(moveTabInOrder(order, "missing", "b", "before")).toEqual(order);
    expect(moveTabInOrder(order, "a", "missing", "after")).toEqual(order);
  });

  it("does not mutate the order it was given", () => {
    const original = [...order];
    moveTabInOrder(order, "a", "d", "after");
    expect(order).toEqual(original);
  });
});

describe("applyRequestedTabOrder", () => {
  it("reorders the requested tabs inside the slots they already occupy", () => {
    expect(applyRequestedTabOrder(["a", "other", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "other",
      "a",
      "b",
    ]);
  });

  it("leaves tabs the renderer did not name exactly where they were", () => {
    expect(applyRequestedTabOrder(["work", "a", "b"], ["b", "a"])).toEqual(["work", "b", "a"]);
  });

  it("keeps the current order when the request names no open tab", () => {
    expect(applyRequestedTabOrder(["a", "b"], ["gone"])).toEqual(["a", "b"]);
  });

  it("ignores unknown and repeated ids instead of dropping a tab", () => {
    expect(applyRequestedTabOrder(["a", "b", "c"], ["c", "c", "gone", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("returns every open tab exactly once", () => {
    const current = ["a", "b", "c", "d"];
    const next = applyRequestedTabOrder(current, ["d", "b"]);
    expect([...next].sort()).toEqual([...current].sort());
  });
});
