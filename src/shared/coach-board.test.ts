import { describe, expect, it } from "vitest";
import { isCoachBoard, newCoachBoard, parseCoachObject, writeCoachObject } from "./coach-board";

describe("Coach boards", () => {
  it("round-trips extensible JSON without erasing unknown fields", () => {
    const board = { ...newCoachBoard("Launch"), custom: { color: "purple" } };
    board.cards.push({
      id: "task",
      title: "Review",
      columnId: "next",
      dueDate: "2026-09-03",
      note: "Notes/Brief.md",
      extension: true,
    });
    expect(isCoachBoard(board)).toBe(true);
    expect(parseCoachObject(writeCoachObject(board))).toEqual(board);
  });
  it("rejects duplicate ids, unknown columns, oversized data, and impossible dates", () => {
    const board = newCoachBoard("Launch");
    const card = { id: "one", title: "Review", columnId: "next" };
    expect(isCoachBoard({ ...board, cards: [card, card] })).toBe(false);
    expect(isCoachBoard({ ...board, columns: [board.columns[0], board.columns[0]] })).toBe(false);
    expect(isCoachBoard({ ...board, cards: [{ ...card, columnId: "missing" }] })).toBe(false);
    expect(isCoachBoard({ ...board, cards: [{ ...card, dueDate: "2026-02-30" }] })).toBe(false);
    expect(isCoachBoard({ ...board, cards: [{ ...card, dueDate: "bad" }] })).toBe(false);
    expect(isCoachBoard({ ...board, cards: [{ ...card, title: "a".repeat(501) }] })).toBe(false);
    expect(isCoachBoard({ ...board, columns: [] })).toBe(false);
    expect(parseCoachObject("not JSON")).toBeNull();
    expect(parseCoachObject('{"version":2,"kind":"board"}')).toBeNull();
  });
});
