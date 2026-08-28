import { describe, expect, it } from "vitest";
import {
  activeElapsedMilliseconds,
  correctPomodoroRun,
  DEFAULT_RUNNABLE_APPS_STATE,
  effectivePomodoroResult,
  finishPomodoro,
  parseRunnableAppsState,
  pausePomodoro,
  resumePomodoro,
  startPomodoro,
} from "./runnable-apps-model";

const start = "2026-08-29T00:00:00.000Z";

describe("runnable Pomodoro app", () => {
  it("runs, pauses, resumes, and records the observed result", () => {
    let state = startPomodoro(
      DEFAULT_RUNNABLE_APPS_STATE,
      { task: "Write the implementation", plannedMinutes: 25 },
      start,
      "run-1",
    );
    const running = state.pomodoro.activeRun;
    if (!running) throw new Error("Expected an active run");
    expect(activeElapsedMilliseconds(running, Date.parse(start) + 30_000)).toBe(30_000);
    state = pausePomodoro(state, "2026-08-29T00:00:30.000Z");
    expect(state.pomodoro.activeRun?.pauseCount).toBe(1);
    const paused = state.pomodoro.activeRun;
    if (!paused) throw new Error("Expected a paused run");
    expect(activeElapsedMilliseconds(paused, Date.parse(start) + 90_000)).toBe(30_000);
    state = resumePomodoro(state, "2026-08-29T00:02:00.000Z");
    state = finishPomodoro(state, "stopped", "2026-08-29T00:02:45.000Z");
    expect(state.pomodoro.activeRun).toBeNull();
    expect(state.pomodoro.history[0]?.original).toEqual({
      outcome: "stopped",
      elapsedSeconds: 75,
      endedAt: "2026-08-29T00:02:45.000Z",
    });
  });

  it("appends a correction while preserving the immutable original", () => {
    const stopped = finishPomodoro(
      startPomodoro(
        DEFAULT_RUNNABLE_APPS_STATE,
        { task: "Deep work", plannedMinutes: 25 },
        start,
        "run-2",
      ),
      "stopped",
      "2026-08-29T00:10:00.000Z",
    );
    const original = structuredClone(stopped.pomodoro.history[0]?.original);
    const corrected = correctPomodoroRun(
      stopped,
      {
        runId: "run-2",
        outcome: "completed",
        elapsedMinutes: 60,
        note: "Forgot to stop the clock",
      },
      "2026-08-29T01:05:00.000Z",
      "correction-1",
    );
    const run = corrected.pomodoro.history[0];
    if (!run) throw new Error("Expected a corrected history record");
    expect(run.original).toEqual(original);
    expect(run.corrections).toHaveLength(1);
    expect(effectivePomodoroResult(run)).toMatchObject({
      outcome: "completed",
      elapsedSeconds: 3600,
      note: "Forgot to stop the clock",
    });
  });

  it("repairs malformed persisted data without inventing history", () => {
    expect(parseRunnableAppsState(null)).toEqual(DEFAULT_RUNNABLE_APPS_STATE);
    expect(parseRunnableAppsState("{")).toEqual(DEFAULT_RUNNABLE_APPS_STATE);
    expect(parseRunnableAppsState('{"version":2}')).toEqual(DEFAULT_RUNNABLE_APPS_STATE);
    expect(
      parseRunnableAppsState(
        JSON.stringify({ version: 1, pomodoro: { activeRun: { task: "bad" }, history: [{}] } }),
      ),
    ).toEqual(DEFAULT_RUNNABLE_APPS_STATE);
  });

  it("migrates version 1 Pomodoro data without losing active work or history", () => {
    const legacy = JSON.stringify({
      version: 1,
      pomodoro: {
        activeRun: {
          id: "legacy-active",
          task: "Keep this timer",
          plannedSeconds: 1500,
          startedAt: start,
          accumulatedMilliseconds: 12_000,
          runningSince: null,
          pauseCount: 1,
        },
        history: [],
      },
    });
    const migrated = parseRunnableAppsState(legacy);
    expect(migrated.version).toBe(3);
    expect(migrated.pomodoro.activeRun).toMatchObject({
      id: "legacy-active",
      task: "Keep this timer",
    });
    expect(migrated.bulletJournal.items).toEqual([]);
    expect(migrated.wealthLab.entries).toEqual([]);
  });

  it("migrates version 2 journal data without losing it", () => {
    const legacy = JSON.stringify({
      version: 2,
      pomodoro: { activeRun: null, history: [] },
      bulletJournal: {
        items: [
          {
            id: "journal-legacy",
            original: {
              text: "Keep this journal task",
              kind: "task",
              capturedAt: start,
              capturedDay: "2026-08-29",
            },
            activity: [],
          },
        ],
      },
    });
    const migrated = parseRunnableAppsState(legacy);
    expect(migrated.version).toBe(3);
    expect(migrated.bulletJournal.items[0]?.id).toBe("journal-legacy");
    expect(migrated.wealthLab).toEqual(DEFAULT_RUNNABLE_APPS_STATE.wealthLab);
  });

  it("retains the explicit Daily Flow source link without inferring task completion", () => {
    const active = startPomodoro(
      DEFAULT_RUNNABLE_APPS_STATE,
      { task: "Linked task", plannedMinutes: 25, sourceJournalItemId: "journal-1" },
      start,
      "run-linked",
    );
    const finished = finishPomodoro(active, "completed", "2026-08-29T00:25:00.000Z");
    expect(finished.pomodoro.history[0]?.sourceJournalItemId).toBe("journal-1");
    expect(finished.bulletJournal.items).toEqual([]);
  });

  it("rejects an empty task and parallel active timers", () => {
    expect(() =>
      startPomodoro(DEFAULT_RUNNABLE_APPS_STATE, { task: "   ", plannedMinutes: 25 }, start),
    ).toThrow("Name the task");
    const active = startPomodoro(
      DEFAULT_RUNNABLE_APPS_STATE,
      { task: "One thing", plannedMinutes: 25 },
      start,
      "run-3",
    );
    expect(() =>
      startPomodoro(active, { task: "Second thing", plannedMinutes: 25 }, start, "run-4"),
    ).toThrow("Finish or stop");
  });
});
