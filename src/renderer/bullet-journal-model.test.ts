import { describe, expect, it } from "vitest";
import {
  cancelJournalItem,
  captureJournalInboxNote,
  captureJournalItem,
  completeJournalTask,
  correctJournalText,
  DEFAULT_BULLET_JOURNAL_STATE,
  effectiveJournalItem,
  fileJournalNote,
  journalCarryover,
  journalItemsForLane,
  migrateJournalTask,
  organizeJournalTask,
  parseBulletJournalState,
  reopenJournalTask,
  setNowJournalTask,
} from "./bullet-journal-model";

const day = "2026-08-29";
const now = "2026-08-29T01:00:00.000Z";

function captureTask(id: string, text = id) {
  return captureJournalItem(DEFAULT_BULLET_JOURNAL_STATE, { text, kind: "task", day }, now, id);
}

function firstItem(journal: ReturnType<typeof captureTask>) {
  const item = journal.items[0];
  if (!item) throw new Error("Expected a journal item");
  return item;
}

describe("Daily Flow journal model", () => {
  it("captures immutable task, note, and event originals", () => {
    let journal = captureJournalItem(
      DEFAULT_BULLET_JOURNAL_STATE,
      { text: "  Send   the proposal ", kind: "task", day },
      now,
      "task-1",
    );
    journal = captureJournalItem(journal, { text: "Idea", kind: "note", day }, now, "note-1");
    journal = captureJournalItem(journal, { text: "Met Ana", kind: "event", day }, now, "event-1");
    expect(journal.items.map((item) => item.original.kind)).toEqual(["event", "note", "task"]);
    expect(journal.items[2]?.original.text).toBe("Send the proposal");
    const note = journal.items[1];
    if (!note) throw new Error("Expected the captured note");
    expect(effectiveJournalItem(note).lane).toBe("reference");
  });

  it("keeps quick notes in Inbox until they are deliberately filed", () => {
    const inbox = captureJournalInboxNote(
      DEFAULT_BULLET_JOURNAL_STATE,
      "  Remember   the council idea ",
      day,
      now,
      "note-inbox",
      "organized-inbox",
    );
    expect(journalItemsForLane(inbox, "inbox").map((item) => item.text)).toEqual([
      "Remember the council idea",
    ]);
    expect(firstItem(inbox).original.kind).toBe("note");

    const filed = fileJournalNote(inbox, "note-inbox", now, "file-note");
    expect(journalItemsForLane(filed, "inbox")).toHaveLength(0);
    expect(effectiveJournalItem(firstItem(filed)).lane).toBe("reference");
    expect(firstItem(filed).original.text).toBe("Remember the council idea");
  });

  it("clarifies tasks and requires a waiting party", () => {
    const journal = captureTask("task-2", "Get approval");
    expect(() =>
      organizeJournalTask(journal, { itemId: "task-2", lane: "waiting", day }, now, "event-1"),
    ).toThrow("Name who");
    const waiting = organizeJournalTask(
      journal,
      { itemId: "task-2", lane: "waiting", day, waitingFor: "Finance" },
      now,
      "event-2",
    );
    expect(effectiveJournalItem(firstItem(waiting)).waitingFor).toBe("Finance");
  });

  it("caps Today at three and keeps exactly one Now task", () => {
    let journal = DEFAULT_BULLET_JOURNAL_STATE;
    for (let index = 1; index <= 4; index += 1) {
      journal = captureJournalItem(
        journal,
        { text: `Task ${index}`, kind: "task", day },
        now,
        `task-${index}`,
      );
    }
    for (let index = 1; index <= 3; index += 1) {
      journal = organizeJournalTask(
        journal,
        { itemId: `task-${index}`, lane: "today", day },
        now,
        `organize-${index}`,
      );
    }
    expect(() =>
      organizeJournalTask(journal, { itemId: "task-4", lane: "today", day }, now, "organize-4"),
    ).toThrow("three tasks");
    journal = setNowJournalTask(journal, "task-1", day, now, "now-1", "clear-1");
    journal = setNowJournalTask(journal, "task-2", day, now, "now-2", "clear-2");
    expect(
      journal.items
        .map(effectiveJournalItem)
        .filter((item) => item.now)
        .map((item) => item.id),
    ).toEqual(["task-2"]);
  });

  it("migrates carryover explicitly while preserving capture day", () => {
    let journal = captureJournalItem(
      DEFAULT_BULLET_JOURNAL_STATE,
      { text: "Carry me", kind: "task", day: "2026-08-28" },
      "2026-08-28T01:00:00.000Z",
      "task-old",
    );
    journal = organizeJournalTask(
      journal,
      { itemId: "task-old", lane: "today", day: "2026-08-28" },
      now,
      "organized",
    );
    expect(journalCarryover(journal, day)).toHaveLength(1);
    journal = migrateJournalTask(journal, "task-old", day, now, "migrated");
    const effective = effectiveJournalItem(firstItem(journal));
    expect(effective.day).toBe(day);
    expect(effective.original.capturedDay).toBe("2026-08-28");
    expect(journalCarryover(journal, day)).toHaveLength(0);
  });

  it("preserves complete/cancel mistakes through reopen and text correction", () => {
    let journal = captureTask("task-5", "Original wording");
    journal = completeJournalTask(journal, "task-5", now, "complete");
    journal = reopenJournalTask(journal, "task-5", "next", day, now, "reopen");
    journal = correctJournalText(journal, "task-5", "Corrected wording", now, "correct");
    const item = firstItem(journal);
    const effective = effectiveJournalItem(item);
    expect(item.original.text).toBe("Original wording");
    expect(item.activity.map((event) => event.type)).toEqual([
      "completed",
      "reopened",
      "text-corrected",
    ]);
    expect(effective).toMatchObject({ text: "Corrected wording", lifecycle: "open", lane: "next" });
    journal = cancelJournalItem(journal, "task-5", "No longer needed", now, "cancel");
    expect(effectiveJournalItem(firstItem(journal)).lifecycle).toBe("cancelled");
  });

  it("repairs malformed entries and selectors remain deterministic", () => {
    const parsed = parseBulletJournalState({
      items: [
        { id: "bad", original: { text: "Bad" }, activity: [] },
        {
          id: "good",
          original: { text: "Good", kind: "task", capturedAt: now, capturedDay: day },
          activity: [
            { id: "event", recordedAt: now, type: "organized", lane: "next" },
            { id: "event", recordedAt: now, type: "completed" },
          ],
        },
      ],
    });
    expect(parsed.items).toHaveLength(1);
    expect(journalItemsForLane(parsed, "next").map((item) => item.id)).toEqual(["good"]);
  });

  it("repairs persisted state that exceeds Today and Now focus limits", () => {
    const parsed = parseBulletJournalState({
      items: Array.from({ length: 4 }, (_, index) => ({
        id: `task-${index}`,
        original: {
          text: `Task ${index}`,
          kind: "task",
          capturedAt: now,
          capturedDay: day,
        },
        activity: [
          {
            id: `organized-${index}`,
            recordedAt: now,
            type: "organized",
            lane: "today",
            day,
          },
          { id: `now-${index}`, recordedAt: now, type: "now-set" },
        ],
      })),
    });
    const effective = parsed.items.map(effectiveJournalItem);
    expect(effective.filter((item) => item.lane === "today")).toHaveLength(3);
    expect(effective.filter((item) => item.now)).toHaveLength(1);
    expect(effective.find((item) => item.id === "task-3")?.lane).toBe("inbox");
  });
});
