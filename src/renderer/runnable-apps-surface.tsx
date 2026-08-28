import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import type { EffectiveJournalItem } from "./bullet-journal-model";
import { DailyFlowSurface } from "./daily-flow-surface";
import { Icon } from "./icon";
import {
  activeElapsedMilliseconds,
  correctPomodoroRun,
  effectivePomodoroResult,
  finishPomodoro,
  formatTimerDuration,
  pausePomodoro,
  RUNNABLE_APP_CATALOG,
  type RunnableAppId,
  type RunnableAppsState,
  resumePomodoro,
  startPomodoro,
} from "./runnable-apps-model";
import type { EffectiveEarningIdea } from "./wealth-lab-model";
import { WealthLabSurface } from "./wealth-lab-surface";

interface RunnableAppsSurfaceProps {
  state: RunnableAppsState;
  onChange: (state: RunnableAppsState) => void;
  reportStatus: (status: string) => void;
  offerRecovery: (message: string, run: () => void | Promise<void>, actionLabel?: string) => void;
}

const durationPresets = [15, 25, 45, 60];

function sentenceCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function historyTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function RunnableAppsSurface({
  state,
  onChange,
  reportStatus,
  offerRecovery,
}: RunnableAppsSurfaceProps) {
  const [task, setTask] = useState("");
  const [selectedApp, setSelectedApp] = useState<RunnableAppId>("pomodoro");
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [now, setNow] = useState(Date.now());
  const [correctingRunId, setCorrectingRunId] = useState<string | null>(null);
  const [correctedOutcome, setCorrectedOutcome] = useState<"completed" | "stopped">("completed");
  const [correctedMinutes, setCorrectedMinutes] = useState(60);
  const [correctionNote, setCorrectionNote] = useState("");
  const activeRun = state.pomodoro.activeRun;

  useEffect(() => {
    if (!activeRun?.runningSince) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [activeRun?.runningSince]);

  const elapsedSeconds = activeRun
    ? Math.floor(activeElapsedMilliseconds(activeRun, now) / 1000)
    : 0;
  const remainingSeconds = activeRun ? Math.max(0, activeRun.plannedSeconds - elapsedSeconds) : 0;
  const overrunSeconds = activeRun ? Math.max(0, elapsedSeconds - activeRun.plannedSeconds) : 0;
  const progress = activeRun
    ? Math.min(1, elapsedSeconds / Math.max(1, activeRun.plannedSeconds))
    : 0;
  const timerStyle = useMemo(
    () => ({ "--timer-progress": `${Math.round(progress * 360)}deg` }) as CSSProperties,
    [progress],
  );

  const commit = (next: RunnableAppsState, message: string) => {
    const previous = state;
    onChange(next);
    reportStatus(message);
    offerRecovery(message, () => onChange(previous));
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    try {
      commit(
        startPomodoro(state, { task, plannedMinutes }),
        `Pomodoro started for ${plannedMinutes} minutes`,
      );
      setTask("");
      setNow(Date.now());
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const pauseOrResume = () => {
    if (!activeRun) return;
    if (activeRun.runningSince) {
      commit(pausePomodoro(state), "Pomodoro paused; elapsed time is preserved");
    } else {
      commit(resumePomodoro(state), "Pomodoro resumed");
      setNow(Date.now());
    }
  };

  const finish = (outcome: "completed" | "stopped") => {
    try {
      commit(
        finishPomodoro(state, outcome),
        outcome === "completed"
          ? "Task completed and original timer result saved"
          : "Timer stopped and original result saved",
      );
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const beginCorrection = (runId: string, elapsed: number, outcome: "completed" | "stopped") => {
    setCorrectingRunId(runId);
    setCorrectedOutcome(outcome);
    setCorrectedMinutes(Math.max(0, Math.round(elapsed / 60)));
    setCorrectionNote("");
  };

  const submitCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (!correctingRunId) return;
    try {
      commit(
        correctPomodoroRun(state, {
          runId: correctingRunId,
          outcome: correctedOutcome,
          elapsedMinutes: correctedMinutes,
          note: correctionNote,
        }),
        "Correction appended; the original result remains unchanged",
      );
      setCorrectingRunId(null);
      setCorrectionNote("");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const focusJournalTask = (item: EffectiveJournalItem) => {
    if (state.pomodoro.activeRun) {
      setSelectedApp("pomodoro");
      reportStatus("The running Pomodoro was preserved");
      return;
    }
    try {
      commit(
        startPomodoro(state, {
          task: item.text,
          plannedMinutes: 25,
          sourceJournalItemId: item.id,
        }),
        "Focused Pomodoro started from Daily Flow",
      );
      setSelectedApp("pomodoro");
      setNow(Date.now());
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const focusWealthIdea = (idea: EffectiveEarningIdea) => {
    if (state.pomodoro.activeRun) {
      setSelectedApp("pomodoro");
      reportStatus("The running Pomodoro was preserved");
      return;
    }
    try {
      commit(
        startPomodoro(state, {
          task: idea.nextStep,
          plannedMinutes: 25,
          sourceWealthIdeaId: idea.id,
        }),
        "Focused Pomodoro started from Wealth Lab",
      );
      setSelectedApp("pomodoro");
      setNow(Date.now());
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="trusted-surface runnable-apps-surface" data-runnable-apps>
      <aside className="app-library" aria-label="Runnable apps">
        <span className="eyebrow">Local tools</span>
        <h1>Runnable apps</h1>
        <p>Small tools that produce durable, inspectable results.</p>
        <div className="app-catalog">
          {RUNNABLE_APP_CATALOG.map((app) => (
            <button
              type="button"
              className={selectedApp === app.id ? "app-catalog-item active" : "app-catalog-item"}
              key={app.id}
              aria-pressed={selectedApp === app.id}
              data-runnable-app={app.id}
              onClick={() => setSelectedApp(app.id)}
            >
              <span className="app-catalog-icon">
                {app.id === "pomodoro" ? (
                  <Icon name="timer" />
                ) : (
                  <b>{app.id === "wealth-lab" ? "₱" : "•"}</b>
                )}
              </span>
              <span>
                <strong>{app.name}</strong>
                <small>{app.description}</small>
              </span>
              <em>{app.status}</em>
            </button>
          ))}
        </div>
        <div className="app-library-note">
          <Icon name="lock" />
          <span>
            <strong>Local to this profile</strong>
            Runs and corrections stay on this computer.
          </span>
        </div>
      </aside>

      {selectedApp === "daily-flow" ? (
        <DailyFlowSurface
          journal={state.bulletJournal}
          onChange={(bulletJournal) => onChange({ ...state, bulletJournal })}
          onFocusTask={focusJournalTask}
          timerActive={Boolean(activeRun)}
          reportStatus={reportStatus}
          offerRecovery={offerRecovery}
        />
      ) : selectedApp === "wealth-lab" ? (
        <WealthLabSurface
          state={state.wealthLab}
          onChange={(wealthLab) => onChange({ ...state, wealthLab })}
          onFocusIdea={focusWealthIdea}
          timerActive={Boolean(activeRun)}
          reportStatus={reportStatus}
          offerRecovery={offerRecovery}
        />
      ) : (
        <section className="pomodoro-app" aria-labelledby="pomodoro-heading">
          <header className="pomodoro-header">
            <span className="pomodoro-mark">
              <Icon name="timer" />
            </span>
            <span>
              <small>Runnable app 01</small>
              <h2 id="pomodoro-heading">Pomodoro</h2>
              <p>Commit to one task. The clock records what actually happened.</p>
            </span>
            <span className="local-app-badge">Local app</span>
          </header>

          {activeRun ? (
            <section className="active-pomodoro" data-active-pomodoro>
              <div className="timer-dial" style={timerStyle}>
                <div>
                  <small>
                    {overrunSeconds > 0
                      ? "Over target"
                      : activeRun.runningSince
                        ? "Focusing"
                        : "Paused"}
                  </small>
                  <strong data-timer-clock>
                    {overrunSeconds > 0
                      ? `+${formatTimerDuration(overrunSeconds)}`
                      : formatTimerDuration(remainingSeconds)}
                  </strong>
                  <span>{formatTimerDuration(elapsedSeconds)} elapsed</span>
                </div>
              </div>
              <div className="active-pomodoro-copy">
                <span className="eyebrow">Current task</span>
                <h3>{activeRun.task}</h3>
                <p>
                  Planned for {formatTimerDuration(activeRun.plannedSeconds)} · started{" "}
                  {historyTimestamp(activeRun.startedAt)}
                </p>
                <div className="timer-actions">
                  <button type="button" className="timer-secondary" onClick={pauseOrResume}>
                    {activeRun.runningSince ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="timer-complete"
                    onClick={() => finish("completed")}
                  >
                    <Icon name="check" /> Complete
                  </button>
                  <button type="button" className="timer-stop" onClick={() => finish("stopped")}>
                    Stop & save
                  </button>
                </div>
                <small className="timer-hint">
                  Nothing is inferred: completing or stopping requires an explicit action.
                </small>
              </div>
            </section>
          ) : (
            <form className="pomodoro-starter" onSubmit={start} data-pomodoro-starter>
              <span className="eyebrow">Start deliberately</span>
              <h3>What will this timer protect?</h3>
              <label>
                <span>Task</span>
                <input
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  maxLength={160}
                  placeholder="Finish the release notes"
                  data-pomodoro-task
                />
              </label>
              <fieldset>
                <legend>Duration</legend>
                <div className="duration-presets">
                  {durationPresets.map((minutes) => (
                    <button
                      type="button"
                      key={minutes}
                      className={plannedMinutes === minutes ? "active" : ""}
                      onClick={() => setPlannedMinutes(minutes)}
                    >
                      {minutes}m
                    </button>
                  ))}
                </div>
                <label className="custom-duration">
                  <span>Custom</span>
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={plannedMinutes}
                    onChange={(event) => setPlannedMinutes(Number(event.target.value))}
                    data-pomodoro-minutes
                  />
                  <em>minutes</em>
                </label>
              </fieldset>
              <button type="submit" className="start-pomodoro" disabled={!task.trim()}>
                <Icon name="timer" /> Run timer
              </button>
            </form>
          )}

          <section className="pomodoro-history" aria-labelledby="pomodoro-history-heading">
            <header>
              <span>
                <span className="eyebrow">Durable activity</span>
                <h3 id="pomodoro-history-heading">Run history</h3>
              </span>
              <p>{state.pomodoro.history.length} recorded</p>
            </header>
            {state.pomodoro.history.length === 0 ? (
              <div className="empty-run-history">
                <Icon name="timer" />
                <strong>No runs yet</strong>
                <span>Your stopped and completed timers will appear here.</span>
              </div>
            ) : (
              <div className="run-history-list">
                {state.pomodoro.history.map((run) => {
                  const effective = effectivePomodoroResult(run);
                  const overridden = run.corrections.length > 0;
                  return (
                    <article className="run-history-item" key={run.id} data-pomodoro-run={run.id}>
                      <div className="run-history-main">
                        <span className={`run-outcome ${effective.outcome}`}>
                          <Icon name={effective.outcome === "completed" ? "check" : "close"} />
                        </span>
                        <span className="run-history-copy">
                          <span>
                            <strong>{run.task}</strong>
                            {overridden && <em className="override-badge">Overridden</em>}
                          </span>
                          <small>
                            Original: {sentenceCase(run.original.outcome)} at{" "}
                            {formatTimerDuration(run.original.elapsedSeconds)} ·{" "}
                            {historyTimestamp(run.original.endedAt)}
                          </small>
                          {overridden && (
                            <b data-effective-result>
                              Corrected: {sentenceCase(effective.outcome)} at{" "}
                              {formatTimerDuration(effective.elapsedSeconds)}
                            </b>
                          )}
                          {"note" in effective && effective.note && <q>{effective.note}</q>}
                        </span>
                        <button
                          type="button"
                          className="correct-run-button"
                          onClick={() =>
                            beginCorrection(run.id, effective.elapsedSeconds, effective.outcome)
                          }
                        >
                          Correct result
                        </button>
                      </div>
                      {correctingRunId === run.id && (
                        <form className="run-correction-form" onSubmit={submitCorrection}>
                          <header>
                            <strong>Append a correction</strong>
                            <span>The original record above will not change.</span>
                          </header>
                          <label>
                            <span>Correct outcome</span>
                            <select
                              value={correctedOutcome}
                              onChange={(event) =>
                                setCorrectedOutcome(event.target.value as "completed" | "stopped")
                              }
                              data-correction-outcome
                            >
                              <option value="completed">Completed</option>
                              <option value="stopped">Stopped</option>
                            </select>
                          </label>
                          <label>
                            <span>Actual minutes</span>
                            <input
                              type="number"
                              min="0"
                              max="10080"
                              value={correctedMinutes}
                              onChange={(event) => setCorrectedMinutes(Number(event.target.value))}
                              data-correction-minutes
                            />
                          </label>
                          <label className="correction-note">
                            <span>Why? (optional)</span>
                            <input
                              value={correctionNote}
                              maxLength={240}
                              onChange={(event) => setCorrectionNote(event.target.value)}
                              placeholder="Timer was left paused"
                              data-correction-note
                            />
                          </label>
                          <div>
                            <button type="submit" className="save-correction">
                              Save correction
                            </button>
                            <button
                              type="button"
                              className="cancel-correction"
                              onClick={() => setCorrectingRunId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}
