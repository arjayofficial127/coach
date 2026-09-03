export interface CoachCard {
  id: string;
  title: string;
  columnId: string;
  dueDate?: string;
  note?: string;
  [key: string]: unknown;
}

export interface CoachBoard {
  version: 1;
  kind: "board";
  title: string;
  columns: { id: string; title: string; [key: string]: unknown }[];
  cards: CoachCard[];
  [key: string]: unknown;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isCoachBoard(value: unknown): value is CoachBoard {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.kind !== "board" ||
    typeof value.title !== "string" ||
    value.title.length > 200 ||
    !Array.isArray(value.columns) ||
    value.columns.length < 1 ||
    value.columns.length > 12 ||
    !Array.isArray(value.cards) ||
    value.cards.length > 500
  )
    return false;
  const ids = new Set<string>();
  for (const column of value.columns) {
    if (
      !record(column) ||
      typeof column.id !== "string" ||
      !/^[\w-]{1,80}$/.test(column.id) ||
      ids.has(column.id) ||
      typeof column.title !== "string" ||
      column.title.length > 100
    )
      return false;
    ids.add(column.id);
  }
  const cards = new Set<string>();
  for (const card of value.cards) {
    if (
      !record(card) ||
      typeof card.id !== "string" ||
      !/^[\w-]{1,80}$/.test(card.id) ||
      cards.has(card.id) ||
      typeof card.title !== "string" ||
      card.title.length > 500 ||
      typeof card.columnId !== "string" ||
      !ids.has(card.columnId) ||
      (card.note !== undefined && (typeof card.note !== "string" || card.note.length > 500)) ||
      (card.dueDate !== undefined &&
        (typeof card.dueDate !== "string" ||
          (card.dueDate !== "" &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(card.dueDate) ||
              Number.isNaN(Date.parse(card.dueDate)) ||
              new Date(card.dueDate).toISOString().slice(0, 10) !== card.dueDate))))
    )
      return false;
    cards.add(card.id);
  }
  return true;
}

export function newCoachBoard(title: string): CoachBoard {
  return {
    version: 1,
    kind: "board",
    title,
    columns: [
      { id: "next", title: "Next" },
      { id: "doing", title: "Doing" },
      { id: "done", title: "Done" },
    ],
    cards: [],
  };
}

export function newCoachPlanner(title: string): CoachBoard {
  return { ...newCoachBoard(title), defaultView: "calendar" };
}

export function parseCoachObject(content: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(content);
    return record(value) && value.version === 1 && typeof value.kind === "string" ? value : null;
  } catch {
    return null;
  }
}

export function writeCoachObject(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
