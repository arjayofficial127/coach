export const MAX_JOURNAL_ITEMS = 1_000;
export const MAX_JOURNAL_ACTIVITIES = 64;
export const MAX_JOURNAL_TEXT_LENGTH = 240;
export const MAX_TODAY_TASKS = 3;

export type JournalKind = "task" | "note" | "event";
export type GtdLane = "inbox" | "today" | "next" | "waiting" | "someday" | "reference";
export type ItemLifecycle = "open" | "completed" | "cancelled";

export interface JournalOriginal {
  text: string;
  kind: JournalKind;
  capturedAt: string;
  capturedDay: string;
}

export interface JournalActivity {
  id: string;
  recordedAt: string;
  type:
    | "organized"
    | "migrated"
    | "now-set"
    | "now-cleared"
    | "completed"
    | "cancelled"
    | "reopened"
    | "text-corrected";
  lane?: GtdLane;
  day?: string;
  waitingFor?: string;
  text?: string;
  note?: string;
}

export interface JournalItem {
  id: string;
  original: JournalOriginal;
  activity: JournalActivity[];
}

export interface BulletJournalState {
  items: JournalItem[];
}

export interface EffectiveJournalItem {
  id: string;
  original: JournalOriginal;
  text: string;
  kind: JournalKind;
  lane: GtdLane;
  day: string;
  waitingFor: string;
  lifecycle: ItemLifecycle;
  now: boolean;
  corrected: boolean;
  activity: JournalActivity[];
}

export const DEFAULT_BULLET_JOURNAL_STATE: BulletJournalState = { items: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown, maximum = MAX_JOURNAL_TEXT_LENGTH): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseKind(value: unknown): JournalKind | null {
  return value === "task" || value === "note" || value === "event" ? value : null;
}

function parseLane(value: unknown): GtdLane | undefined {
  return value === "inbox" ||
    value === "today" ||
    value === "next" ||
    value === "waiting" ||
    value === "someday" ||
    value === "reference"
    ? value
    : undefined;
}

function parseActivity(value: unknown): JournalActivity | null {
  if (!isRecord(value) || typeof value.id !== "string" || !validIsoDate(value.recordedAt)) {
    return null;
  }
  const types: JournalActivity["type"][] = [
    "organized",
    "migrated",
    "now-set",
    "now-cleared",
    "completed",
    "cancelled",
    "reopened",
    "text-corrected",
  ];
  if (!types.includes(value.type as JournalActivity["type"])) return null;
  const activity: JournalActivity = {
    id: value.id,
    recordedAt: value.recordedAt,
    type: value.type as JournalActivity["type"],
  };
  const lane = parseLane(value.lane);
  if (lane) activity.lane = lane;
  if (isDayKey(value.day)) activity.day = value.day;
  const waitingFor = normalizedText(value.waitingFor, 120);
  if (waitingFor) activity.waitingFor = waitingFor;
  const text = normalizedText(value.text);
  if (text) activity.text = text;
  const note = normalizedText(value.note);
  if (note) activity.note = note;
  if ((activity.type === "organized" || activity.type === "reopened") && !activity.lane) {
    return null;
  }
  if (activity.type === "migrated" && !activity.day) return null;
  if (activity.type === "text-corrected" && !activity.text) return null;
  if (activity.lane === "waiting" && !activity.waitingFor) return null;
  return activity;
}

function parseItem(value: unknown): JournalItem | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.original)) return null;
  const text = normalizedText(value.original.text);
  const kind = parseKind(value.original.kind);
  if (
    !text ||
    !kind ||
    !validIsoDate(value.original.capturedAt) ||
    !isDayKey(value.original.capturedDay)
  ) {
    return null;
  }
  if (!Array.isArray(value.activity) || value.activity.length > MAX_JOURNAL_ACTIVITIES) return null;
  const ids = new Set<string>();
  const activity = value.activity.map(parseActivity).filter((entry): entry is JournalActivity => {
    if (!entry || ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  });
  return {
    id: value.id,
    original: {
      text,
      kind,
      capturedAt: value.original.capturedAt,
      capturedDay: value.original.capturedDay,
    },
    activity,
  };
}

export function parseBulletJournalState(value: unknown): BulletJournalState {
  if (!isRecord(value) || !Array.isArray(value.items)) return DEFAULT_BULLET_JOURNAL_STATE;
  const ids = new Set<string>();
  const items = value.items
    .slice(0, MAX_JOURNAL_ITEMS)
    .map(parseItem)
    .filter((item): item is JournalItem => {
      if (!item || ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    });
  const todayCounts = new Map<string, number>();
  const repairedToday = items.map((item) => {
    const effective = effectiveJournalItem(item);
    if (effective.kind !== "task" || effective.lifecycle !== "open" || effective.lane !== "today") {
      return item;
    }
    const count = todayCounts.get(effective.day) ?? 0;
    if (count < MAX_TODAY_TASKS) {
      todayCounts.set(effective.day, count + 1);
      return item;
    }
    return {
      ...item,
      activity: item.activity.filter(
        (event) =>
          event.type !== "migrated" &&
          event.type !== "now-set" &&
          !((event.type === "organized" || event.type === "reopened") && event.lane === "today"),
      ),
    };
  });
  let nowSeen = false;
  const repairedNow = repairedToday.map((item) => {
    const effective = effectiveJournalItem(item);
    if (!effective.now) return item;
    const eligible =
      effective.kind === "task" && effective.lifecycle === "open" && effective.lane === "today";
    if (eligible && !nowSeen) {
      nowSeen = true;
      return item;
    }
    return {
      ...item,
      activity: item.activity.filter((event) => event.type !== "now-set"),
    };
  });
  return { items: repairedNow };
}

export function effectiveJournalItem(item: JournalItem): EffectiveJournalItem {
  const effective: EffectiveJournalItem = {
    id: item.id,
    original: item.original,
    text: item.original.text,
    kind: item.original.kind,
    lane: item.original.kind === "task" ? "inbox" : "reference",
    day: item.original.capturedDay,
    waitingFor: "",
    lifecycle: "open",
    now: false,
    corrected: false,
    activity: item.activity,
  };
  for (const event of item.activity) {
    if (event.type === "organized" || event.type === "reopened") {
      if (event.lane) effective.lane = event.lane;
      if (event.day) effective.day = event.day;
      effective.waitingFor = event.waitingFor ?? "";
      if (event.type === "reopened") effective.lifecycle = "open";
    } else if (event.type === "migrated") {
      effective.lane = "today";
      if (event.day) effective.day = event.day;
      effective.now = false;
    } else if (event.type === "now-set") {
      effective.now = true;
    } else if (event.type === "now-cleared") {
      effective.now = false;
    } else if (event.type === "completed") {
      effective.lifecycle = "completed";
      effective.now = false;
    } else if (event.type === "cancelled") {
      effective.lifecycle = "cancelled";
      effective.now = false;
    } else if (event.type === "text-corrected" && event.text) {
      effective.text = event.text;
      effective.corrected = true;
    }
  }
  return effective;
}

function appendActivity(
  journal: BulletJournalState,
  itemId: string,
  activity: JournalActivity,
): BulletJournalState {
  const item = journal.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("The journal item no longer exists.");
  if (item.activity.length >= MAX_JOURNAL_ACTIVITIES) {
    throw new Error("This item reached its activity-history limit.");
  }
  return {
    items: journal.items.map((candidate) =>
      candidate.id === itemId
        ? { ...candidate, activity: [...candidate.activity, activity] }
        : candidate,
    ),
  };
}

export function captureJournalItem(
  journal: BulletJournalState,
  input: { text: string; kind: JournalKind; day: string },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): BulletJournalState {
  if (journal.items.length >= MAX_JOURNAL_ITEMS) {
    throw new Error("The journal reached its 1,000-item local limit.");
  }
  const text = normalizedText(input.text);
  if (!text) throw new Error("Write one thought before capturing.");
  if (!isDayKey(input.day)) throw new Error("The journal day is invalid.");
  return {
    items: [
      {
        id,
        original: { text, kind: input.kind, capturedAt: now, capturedDay: input.day },
        activity: [],
      },
      ...journal.items,
    ],
  };
}

export function captureJournalInboxNote(
  journal: BulletJournalState,
  text: string,
  day = localDayKey(),
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  const captured = captureJournalItem(journal, { text, kind: "note", day }, now, id);
  return appendActivity(captured, id, {
    id: eventId,
    recordedAt: now,
    type: "organized",
    lane: "inbox",
  });
}

export function fileJournalNote(
  journal: BulletJournalState,
  itemId: string,
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  const item = journal.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("The journal item no longer exists.");
  const effective = effectiveJournalItem(item);
  if (effective.kind !== "note" || effective.lifecycle !== "open" || effective.lane !== "inbox") {
    throw new Error("Only an open Inbox note can be filed.");
  }
  return appendActivity(journal, itemId, {
    id: eventId,
    recordedAt: now,
    type: "organized",
    lane: "reference",
  });
}

function openTask(journal: BulletJournalState, itemId: string): EffectiveJournalItem {
  const item = journal.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("The journal item no longer exists.");
  const effective = effectiveJournalItem(item);
  if (effective.kind !== "task" || effective.lifecycle !== "open") {
    throw new Error("Only an open task can move through GTD lists.");
  }
  return effective;
}

function todayCount(journal: BulletJournalState, day: string, excludingId?: string): number {
  return journal.items
    .map(effectiveJournalItem)
    .filter(
      (item) =>
        item.id !== excludingId &&
        item.kind === "task" &&
        item.lifecycle === "open" &&
        item.lane === "today" &&
        item.day === day,
    ).length;
}

export function organizeJournalTask(
  journal: BulletJournalState,
  input: {
    itemId: string;
    lane: Exclude<GtdLane, "inbox" | "reference">;
    day: string;
    waitingFor?: string;
  },
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  openTask(journal, input.itemId);
  if (!isDayKey(input.day)) throw new Error("The journal day is invalid.");
  const waitingFor = normalizedText(input.waitingFor, 120);
  if (input.lane === "waiting" && !waitingFor) {
    throw new Error("Name who or what this task is waiting for.");
  }
  if (input.lane === "today" && todayCount(journal, input.day, input.itemId) >= MAX_TODAY_TASKS) {
    throw new Error("Today already has three tasks. Move one out before adding another.");
  }
  return appendActivity(journal, input.itemId, {
    id: eventId,
    recordedAt: now,
    type: "organized",
    lane: input.lane,
    day: input.lane === "today" ? input.day : undefined,
    waitingFor: input.lane === "waiting" ? waitingFor : undefined,
  });
}

export function migrateJournalTask(
  journal: BulletJournalState,
  itemId: string,
  toDay: string,
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  openTask(journal, itemId);
  if (!isDayKey(toDay)) throw new Error("The migration day is invalid.");
  if (todayCount(journal, toDay, itemId) >= MAX_TODAY_TASKS) {
    throw new Error("That day already has three tasks.");
  }
  return appendActivity(journal, itemId, {
    id: eventId,
    recordedAt: now,
    type: "migrated",
    day: toDay,
  });
}

export function setNowJournalTask(
  journal: BulletJournalState,
  itemId: string,
  day: string,
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
  clearEventId: string = crypto.randomUUID(),
): BulletJournalState {
  const target = openTask(journal, itemId);
  if (target.lane !== "today" || target.day !== day) {
    throw new Error("Only one of today's tasks can become Now.");
  }
  const current = journal.items
    .map(effectiveJournalItem)
    .filter((item) => item.now && item.id !== itemId);
  let next = journal;
  for (const [index, item] of current.entries()) {
    next = appendActivity(next, item.id, {
      id: index === 0 ? clearEventId : crypto.randomUUID(),
      recordedAt: now,
      type: "now-cleared",
    });
  }
  if (target.now) return next;
  return appendActivity(next, itemId, { id: eventId, recordedAt: now, type: "now-set" });
}

export function completeJournalTask(
  journal: BulletJournalState,
  itemId: string,
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  openTask(journal, itemId);
  return appendActivity(journal, itemId, { id: eventId, recordedAt: now, type: "completed" });
}

export function cancelJournalItem(
  journal: BulletJournalState,
  itemId: string,
  note = "",
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  const item = journal.items.find((candidate) => candidate.id === itemId);
  if (!item || effectiveJournalItem(item).lifecycle !== "open") {
    throw new Error("Only an open journal item can be cancelled.");
  }
  return appendActivity(journal, itemId, {
    id: eventId,
    recordedAt: now,
    type: "cancelled",
    note: normalizedText(note),
  });
}

export function reopenJournalTask(
  journal: BulletJournalState,
  itemId: string,
  lane: Exclude<GtdLane, "reference" | "waiting"> = "inbox",
  day = localDayKey(),
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  const item = journal.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("The journal item no longer exists.");
  const effective = effectiveJournalItem(item);
  if (effective.kind !== "task" || effective.lifecycle === "open") {
    throw new Error("Only a finished task can be reopened.");
  }
  if (lane === "today" && todayCount(journal, day, itemId) >= MAX_TODAY_TASKS) {
    throw new Error("Today already has three tasks.");
  }
  return appendActivity(journal, itemId, {
    id: eventId,
    recordedAt: now,
    type: "reopened",
    lane,
    day: lane === "today" ? day : undefined,
  });
}

export function correctJournalText(
  journal: BulletJournalState,
  itemId: string,
  text: string,
  now = new Date().toISOString(),
  eventId: string = crypto.randomUUID(),
): BulletJournalState {
  const corrected = normalizedText(text);
  if (!corrected) throw new Error("Corrected text cannot be empty.");
  return appendActivity(journal, itemId, {
    id: eventId,
    recordedAt: now,
    type: "text-corrected",
    text: corrected,
  });
}

export function journalItemsForLane(
  journal: BulletJournalState,
  lane: GtdLane,
  day?: string,
): EffectiveJournalItem[] {
  return journal.items
    .map(effectiveJournalItem)
    .filter(
      (item) =>
        item.lifecycle === "open" && item.lane === lane && (lane !== "today" || item.day === day),
    );
}

export function journalCarryover(
  journal: BulletJournalState,
  today: string,
): EffectiveJournalItem[] {
  return journal.items
    .map(effectiveJournalItem)
    .filter(
      (item) =>
        item.kind === "task" &&
        item.lifecycle === "open" &&
        item.lane === "today" &&
        item.day < today,
    );
}

export function journalLog(journal: BulletJournalState): EffectiveJournalItem[] {
  return journal.items.map(effectiveJournalItem);
}
