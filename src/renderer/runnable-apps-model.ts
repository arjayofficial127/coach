import {
  type BulletJournalState,
  DEFAULT_BULLET_JOURNAL_STATE,
  parseBulletJournalState,
} from "./bullet-journal-model";

export const RUNNABLE_APPS_STORAGE_KEY = "lattice.runnable-apps.v1";
export const MAX_POMODORO_TASK_LENGTH = 160;
export const MAX_POMODORO_HISTORY = 500;

export type RunnableAppId = "pomodoro" | "daily-flow";
export type PomodoroOutcome = "completed" | "stopped";

export interface RunnableAppDefinition {
  id: RunnableAppId;
  name: string;
  description: string;
  status: "ready";
}

export const RUNNABLE_APP_CATALOG: RunnableAppDefinition[] = [
  {
    id: "pomodoro",
    name: "Pomodoro",
    description: "Run one task against a visible clock and keep an honest history.",
    status: "ready",
  },
  {
    id: "daily-flow",
    name: "Daily Flow",
    description: "Capture what has your attention and choose one clear next action.",
    status: "ready",
  },
];

export interface PomodoroActiveRun {
  id: string;
  task: string;
  plannedSeconds: number;
  startedAt: string;
  accumulatedMilliseconds: number;
  runningSince: string | null;
  pauseCount: number;
  sourceJournalItemId?: string;
}

export interface PomodoroOriginalResult {
  outcome: PomodoroOutcome;
  elapsedSeconds: number;
  endedAt: string;
}

export interface PomodoroCorrection {
  id: string;
  createdAt: string;
  outcome: PomodoroOutcome;
  elapsedSeconds: number;
  note: string;
}

export interface PomodoroRunRecord {
  id: string;
  task: string;
  plannedSeconds: number;
  startedAt: string;
  original: PomodoroOriginalResult;
  corrections: PomodoroCorrection[];
  sourceJournalItemId?: string;
}

export interface RunnableAppsState {
  version: 2;
  pomodoro: {
    activeRun: PomodoroActiveRun | null;
    history: PomodoroRunRecord[];
  };
  bulletJournal: BulletJournalState;
}

export const DEFAULT_RUNNABLE_APPS_STATE: RunnableAppsState = {
  version: 2,
  pomodoro: { activeRun: null, history: [] },
  bulletJournal: DEFAULT_BULLET_JOURNAL_STATE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedTask(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, MAX_POMODORO_TASK_LENGTH)
    : "";
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const integer = Math.round(value);
  return integer >= minimum && integer <= maximum ? integer : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseOutcome(value: unknown): PomodoroOutcome | null {
  return value === "completed" || value === "stopped" ? value : null;
}

function parseActiveRun(value: unknown): PomodoroActiveRun | null {
  if (!isRecord(value)) return null;
  const task = normalizedTask(value.task);
  const plannedSeconds = boundedInteger(value.plannedSeconds, 60, 43_200);
  const accumulatedMilliseconds = boundedInteger(value.accumulatedMilliseconds, 0, 604_800_000);
  const pauseCount = boundedInteger(value.pauseCount, 0, 10_000);
  if (
    typeof value.id !== "string" ||
    !task ||
    !plannedSeconds ||
    accumulatedMilliseconds === null ||
    pauseCount === null ||
    !validDate(value.startedAt) ||
    (value.runningSince !== null && !validDate(value.runningSince))
  ) {
    return null;
  }
  return {
    id: value.id,
    task,
    plannedSeconds,
    startedAt: value.startedAt,
    accumulatedMilliseconds,
    runningSince: value.runningSince,
    pauseCount,
    sourceJournalItemId:
      typeof value.sourceJournalItemId === "string" ? value.sourceJournalItemId : undefined,
  };
}

function parseCorrection(value: unknown): PomodoroCorrection | null {
  if (!isRecord(value)) return null;
  const outcome = parseOutcome(value.outcome);
  const elapsedSeconds = boundedInteger(value.elapsedSeconds, 0, 604_800);
  if (
    typeof value.id !== "string" ||
    !validDate(value.createdAt) ||
    !outcome ||
    elapsedSeconds === null
  ) {
    return null;
  }
  return {
    id: value.id,
    createdAt: value.createdAt,
    outcome,
    elapsedSeconds,
    note:
      typeof value.note === "string" ? value.note.replace(/\s+/g, " ").trim().slice(0, 240) : "",
  };
}

function parseHistoryRecord(value: unknown): PomodoroRunRecord | null {
  if (!isRecord(value) || !isRecord(value.original)) return null;
  const task = normalizedTask(value.task);
  const plannedSeconds = boundedInteger(value.plannedSeconds, 60, 43_200);
  const outcome = parseOutcome(value.original.outcome);
  const elapsedSeconds = boundedInteger(value.original.elapsedSeconds, 0, 604_800);
  if (
    typeof value.id !== "string" ||
    !task ||
    !plannedSeconds ||
    !validDate(value.startedAt) ||
    !outcome ||
    elapsedSeconds === null ||
    !validDate(value.original.endedAt)
  ) {
    return null;
  }
  return {
    id: value.id,
    task,
    plannedSeconds,
    startedAt: value.startedAt,
    original: { outcome, elapsedSeconds, endedAt: value.original.endedAt },
    corrections: Array.isArray(value.corrections)
      ? value.corrections.map(parseCorrection).filter((item): item is PomodoroCorrection => !!item)
      : [],
    sourceJournalItemId:
      typeof value.sourceJournalItemId === "string" ? value.sourceJournalItemId : undefined,
  };
}

export function parseRunnableAppsState(serialized: string | null): RunnableAppsState {
  if (!serialized) return DEFAULT_RUNNABLE_APPS_STATE;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (
      !isRecord(value) ||
      (value.version !== 1 && value.version !== 2) ||
      !isRecord(value.pomodoro)
    ) {
      return DEFAULT_RUNNABLE_APPS_STATE;
    }
    return {
      version: 2,
      pomodoro: {
        activeRun: parseActiveRun(value.pomodoro.activeRun),
        history: Array.isArray(value.pomodoro.history)
          ? value.pomodoro.history
              .map(parseHistoryRecord)
              .filter((item): item is PomodoroRunRecord => !!item)
              .slice(0, MAX_POMODORO_HISTORY)
          : [],
      },
      bulletJournal:
        value.version === 2
          ? parseBulletJournalState(value.bulletJournal)
          : DEFAULT_BULLET_JOURNAL_STATE,
    };
  } catch {
    return DEFAULT_RUNNABLE_APPS_STATE;
  }
}

export function activeElapsedMilliseconds(run: PomodoroActiveRun, now = Date.now()): number {
  const running = run.runningSince ? Math.max(0, now - Date.parse(run.runningSince)) : 0;
  return Math.max(0, run.accumulatedMilliseconds + running);
}

export function startPomodoro(
  state: RunnableAppsState,
  input: { task: string; plannedMinutes: number; sourceJournalItemId?: string },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): RunnableAppsState {
  if (state.pomodoro.activeRun) throw new Error("Finish or stop the current timer first.");
  const task = normalizedTask(input.task);
  const plannedMinutes = boundedInteger(input.plannedMinutes, 1, 720);
  if (!task) throw new Error("Name the task before starting.");
  if (!plannedMinutes) throw new Error("Choose a timer between 1 minute and 12 hours.");
  return {
    ...state,
    pomodoro: {
      ...state.pomodoro,
      activeRun: {
        id,
        task,
        plannedSeconds: plannedMinutes * 60,
        startedAt: now,
        accumulatedMilliseconds: 0,
        runningSince: now,
        pauseCount: 0,
        sourceJournalItemId: input.sourceJournalItemId,
      },
    },
  };
}

export function pausePomodoro(
  state: RunnableAppsState,
  now = new Date().toISOString(),
): RunnableAppsState {
  const run = state.pomodoro.activeRun;
  if (!run?.runningSince) return state;
  return {
    ...state,
    pomodoro: {
      ...state.pomodoro,
      activeRun: {
        ...run,
        accumulatedMilliseconds: activeElapsedMilliseconds(run, Date.parse(now)),
        runningSince: null,
        pauseCount: run.pauseCount + 1,
      },
    },
  };
}

export function resumePomodoro(
  state: RunnableAppsState,
  now = new Date().toISOString(),
): RunnableAppsState {
  const run = state.pomodoro.activeRun;
  if (!run || run.runningSince) return state;
  return {
    ...state,
    pomodoro: { ...state.pomodoro, activeRun: { ...run, runningSince: now } },
  };
}

export function finishPomodoro(
  state: RunnableAppsState,
  outcome: PomodoroOutcome,
  now = new Date().toISOString(),
): RunnableAppsState {
  const run = state.pomodoro.activeRun;
  if (!run) throw new Error("There is no active timer to finish.");
  const record: PomodoroRunRecord = {
    id: run.id,
    task: run.task,
    plannedSeconds: run.plannedSeconds,
    startedAt: run.startedAt,
    original: {
      outcome,
      elapsedSeconds: Math.round(activeElapsedMilliseconds(run, Date.parse(now)) / 1000),
      endedAt: now,
    },
    corrections: [],
    sourceJournalItemId: run.sourceJournalItemId,
  };
  return {
    ...state,
    pomodoro: {
      activeRun: null,
      history: [record, ...state.pomodoro.history].slice(0, MAX_POMODORO_HISTORY),
    },
  };
}

export function correctPomodoroRun(
  state: RunnableAppsState,
  input: {
    runId: string;
    outcome: PomodoroOutcome;
    elapsedMinutes: number;
    note?: string;
  },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): RunnableAppsState {
  const elapsedMinutes = boundedInteger(input.elapsedMinutes, 0, 10_080);
  if (elapsedMinutes === null)
    throw new Error("Corrected time must be between 0 and 10,080 minutes.");
  if (!state.pomodoro.history.some((run) => run.id === input.runId)) {
    throw new Error("The original timer record no longer exists.");
  }
  const correction: PomodoroCorrection = {
    id,
    createdAt: now,
    outcome: input.outcome,
    elapsedSeconds: elapsedMinutes * 60,
    note:
      typeof input.note === "string" ? input.note.replace(/\s+/g, " ").trim().slice(0, 240) : "",
  };
  return {
    ...state,
    pomodoro: {
      ...state.pomodoro,
      history: state.pomodoro.history.map((run) =>
        run.id === input.runId ? { ...run, corrections: [...run.corrections, correction] } : run,
      ),
    },
  };
}

export function effectivePomodoroResult(
  run: PomodoroRunRecord,
): PomodoroOriginalResult | PomodoroCorrection {
  return run.corrections.at(-1) ?? run.original;
}

export function formatTimerDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
