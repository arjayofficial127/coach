import { type FormEvent, useMemo, useState } from "react";
import {
  type BulletJournalState,
  cancelJournalItem,
  captureJournalItem,
  completeJournalTask,
  correctJournalText,
  type EffectiveJournalItem,
  effectiveJournalItem,
  fileJournalNote,
  type JournalKind,
  journalCarryover,
  journalItemsForLane,
  journalLog,
  localDayKey,
  migrateJournalTask,
  organizeJournalTask,
  reopenJournalTask,
  setNowJournalTask,
} from "./bullet-journal-model";
import { Icon } from "./icon";

export type DailyFlowView = "today" | "inbox" | "next" | "waiting" | "someday" | "log";

interface DailyFlowSurfaceProps {
  journal: BulletJournalState;
  initialView?: DailyFlowView;
  onChange: (journal: BulletJournalState) => void;
  onFocusTask: (item: EffectiveJournalItem) => void;
  timerActive: boolean;
  reportStatus: (status: string) => void;
  offerRecovery: (message: string, run: () => void | Promise<void>, actionLabel?: string) => void;
}

const views: Array<{ id: DailyFlowView; label: string }> = [
  { id: "today", label: "Today" },
  { id: "inbox", label: "Inbox" },
  { id: "next", label: "Next" },
  { id: "waiting", label: "Waiting" },
  { id: "someday", label: "Someday" },
  { id: "log", label: "Log" },
];

function journalSymbol(item: EffectiveJournalItem): string {
  if (item.lifecycle === "completed") return "×";
  if (item.lifecycle === "cancelled") return "—";
  if (item.kind === "event") return "○";
  if (item.kind === "note") return "–";
  if (item.lane === "today" && item.day !== item.original.capturedDay) return ">";
  return "•";
}

function compactDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function laneLabel(item: EffectiveJournalItem): string {
  if (item.lifecycle !== "open") return item.lifecycle;
  if (item.kind !== "task") return item.kind;
  if (item.lane === "waiting" && item.waitingFor) return `Waiting · ${item.waitingFor}`;
  return item.lane;
}

export function DailyFlowSurface({
  journal,
  initialView = "today",
  onChange,
  onFocusTask,
  timerActive,
  reportStatus,
  offerRecovery,
}: DailyFlowSurfaceProps) {
  const today = localDayKey();
  const [view, setView] = useState<DailyFlowView>(initialView);
  const [captureText, setCaptureText] = useState("");
  const [captureKind, setCaptureKind] = useState<JournalKind>("task");
  const [clarifyingId, setClarifyingId] = useState<string | null>(null);
  const [clarifyLane, setClarifyLane] = useState<"today" | "next" | "waiting" | "someday">("next");
  const [waitingFor, setWaitingFor] = useState("");
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState("");
  const effectiveItems = useMemo(() => journal.items.map(effectiveJournalItem), [journal]);
  const todayItems = journalItemsForLane(journal, "today", today);
  const carryover = journalCarryover(journal, today);
  const nowItem = todayItems.find((item) => item.now) ?? null;
  const counts: Record<DailyFlowView, number> = {
    today: todayItems.length,
    inbox: journalItemsForLane(journal, "inbox").length,
    next: journalItemsForLane(journal, "next").length,
    waiting: journalItemsForLane(journal, "waiting").length,
    someday: journalItemsForLane(journal, "someday").length,
    log: effectiveItems.length,
  };
  const visibleItems =
    view === "log"
      ? journalLog(journal)
      : view === "today"
        ? todayItems
        : journalItemsForLane(journal, view);

  const commit = (next: BulletJournalState, message: string) => {
    const previous = journal;
    onChange(next);
    reportStatus(message);
    offerRecovery(message, () => onChange(previous));
  };

  const apply = (operation: () => BulletJournalState, message: string) => {
    try {
      commit(operation(), message);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const capture = (event: FormEvent) => {
    event.preventDefault();
    try {
      const message =
        captureKind === "task" ? "Task captured to Inbox" : `${captureKind} added to today’s log`;
      commit(
        captureJournalItem(journal, { text: captureText, kind: captureKind, day: today }),
        message,
      );
      setCaptureText("");
      setView(captureKind === "task" ? "inbox" : "log");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const clarify = (event: FormEvent) => {
    event.preventDefault();
    if (!clarifyingId) return;
    try {
      const message = `Task moved to ${clarifyLane === "today" ? "Today" : clarifyLane}`;
      commit(
        organizeJournalTask(journal, {
          itemId: clarifyingId,
          lane: clarifyLane,
          day: today,
          waitingFor,
        }),
        message,
      );
      setClarifyingId(null);
      setWaitingFor("");
      setView(clarifyLane);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const submitCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (!correctingId) return;
    apply(
      () => correctJournalText(journal, correctingId, correctedText),
      "Correction appended; the original wording remains in the activity trail",
    );
    setCorrectingId(null);
    setCorrectedText("");
  };

  const startCorrection = (item: EffectiveJournalItem) => {
    setCorrectingId(item.id);
    setCorrectedText(item.text);
  };

  const move = (itemId: string, lane: "today" | "next" | "waiting" | "someday") => {
    if (lane === "waiting") {
      setClarifyingId(itemId);
      setClarifyLane("waiting");
      return;
    }
    apply(
      () => organizeJournalTask(journal, { itemId, lane, day: today }),
      `Task moved to ${lane === "today" ? "Today" : lane}`,
    );
  };

  const fileNote = (itemId: string) => {
    apply(() => fileJournalNote(journal, itemId), "Note filed in the journal");
  };

  return (
    <section className="daily-flow-app" aria-labelledby="daily-flow-heading" data-daily-flow>
      <header className="daily-flow-header">
        <span className="daily-flow-mark">•</span>
        <span>
          <small>Runnable app 02 · Bullet journal + GTD</small>
          <h2 id="daily-flow-heading">Daily Flow</h2>
          <p>
            Capture what has your attention. Choose one next action. Migrate the rest deliberately.
          </p>
        </span>
        <span className="local-app-badge">Profile local</span>
      </header>

      <form className="daily-capture" onSubmit={capture} data-daily-capture>
        <fieldset className="capture-kind">
          <legend className="sr-only">Capture type</legend>
          {(["task", "note", "event"] as JournalKind[]).map((kind) => (
            <button
              type="button"
              key={kind}
              className={captureKind === kind ? "active" : ""}
              aria-pressed={captureKind === kind}
              onClick={() => setCaptureKind(kind)}
            >
              <span>{kind === "task" ? "•" : kind === "note" ? "–" : "○"}</span>
              {kind[0]?.toUpperCase()}
              {kind.slice(1)}
            </button>
          ))}
        </fieldset>
        <label>
          <span className="sr-only">What has your attention?</span>
          <input
            value={captureText}
            onChange={(event) => setCaptureText(event.target.value)}
            maxLength={240}
            placeholder="What has your attention?"
            data-journal-capture
          />
        </label>
        <button type="submit" disabled={!captureText.trim()} data-capture-submit>
          Capture <span>↵</span>
        </button>
      </form>

      {carryover.length > 0 && (
        <section className="carryover-tray" data-carryover>
          <header>
            <span>
              <strong>
                {carryover.length} unfinished task{carryover.length === 1 ? "" : "s"}
              </strong>
              <small>Nothing rolls forward without your choice.</small>
            </span>
            <em>Carryover</em>
          </header>
          {carryover.map((item) => (
            <div key={item.id}>
              <span>
                <b>{item.text}</b>
                <small>From {compactDay(item.day)}</small>
              </span>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    apply(
                      () => migrateJournalTask(journal, item.id, today),
                      "Task migrated to today",
                    )
                  }
                >
                  Today
                </button>
                <button type="button" onClick={() => move(item.id, "next")}>
                  Next
                </button>
                <button type="button" onClick={() => move(item.id, "someday")}>
                  Someday
                </button>
                <button
                  type="button"
                  onClick={() => apply(() => cancelJournalItem(journal, item.id), "Task cancelled")}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className={nowItem ? "now-card" : "now-card empty"} data-now-card>
        <span className="now-marker">
          <Icon name="sparkle" />
        </span>
        <span>
          <small>Now</small>
          <strong>{nowItem?.text ?? "Pick one task to protect."}</strong>
          <em>{nowItem ? "One clear next action" : "Keep today small: choose up to three."}</em>
        </span>
        {nowItem && (
          <div>
            <button
              type="button"
              className="focus-journal"
              onClick={() => onFocusTask(nowItem)}
              data-focus-journal-task
            >
              <Icon name="timer" /> {timerActive ? "View timer" : "Focus 25m"}
            </button>
            <button
              type="button"
              onClick={() =>
                apply(
                  () => completeJournalTask(journal, nowItem.id),
                  "Task completed in Daily Flow",
                )
              }
            >
              <Icon name="check" /> Complete
            </button>
          </div>
        )}
      </section>

      <nav className="daily-flow-tabs" aria-label="Daily Flow lists">
        {views.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={view === candidate.id ? "active" : ""}
            aria-current={view === candidate.id ? "page" : undefined}
            onClick={() => setView(candidate.id)}
          >
            {candidate.label}
            <span>{counts[candidate.id]}</span>
          </button>
        ))}
      </nav>

      <section className="daily-flow-list" aria-live="polite">
        <header>
          <span>
            <small>{view === "log" ? "Nothing disappears" : "Choose deliberately"}</small>
            <h3>{views.find((candidate) => candidate.id === view)?.label}</h3>
          </span>
          <p>
            {view === "today"
              ? `${todayItems.length} of 3 chosen`
              : view === "inbox"
                ? "Decide what each capture means"
                : `${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`}
          </p>
        </header>
        {visibleItems.length === 0 ? (
          <div className="empty-daily-flow">
            <span>{view === "inbox" ? "✓" : "•"}</span>
            <strong>
              {view === "today"
                ? "Choose up to three tasks from Inbox or Next."
                : view === "inbox"
                  ? "Nothing waiting for a decision."
                  : "This list is clear."}
            </strong>
          </div>
        ) : (
          <div className="journal-items">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`journal-item ${item.lifecycle} ${item.now ? "is-now" : ""}`}
                data-journal-item={item.id}
              >
                <span className="journal-symbol" aria-hidden="true">
                  {journalSymbol(item)}
                </span>
                <span className="journal-copy">
                  <span>
                    <strong>{item.text}</strong>
                    {item.corrected && <em>Corrected</em>}
                    {item.now && <em className="now-badge">Now</em>}
                  </span>
                  <small>
                    {laneLabel(item)} · captured {compactDay(item.original.capturedDay)}
                  </small>
                  {item.corrected && <q>Original: {item.original.text}</q>}
                </span>
                <div className="journal-actions">
                  {item.kind === "task" && item.lifecycle === "open" && (
                    <>
                      {item.lane === "inbox" && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            setClarifyingId(item.id);
                            setClarifyLane("next");
                          }}
                        >
                          Clarify
                        </button>
                      )}
                      {item.lane === "next" && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => move(item.id, "today")}
                        >
                          Today
                        </button>
                      )}
                      {item.lane === "today" && !item.now && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() =>
                            apply(
                              () => setNowJournalTask(journal, item.id, today),
                              "Now task selected",
                            )
                          }
                        >
                          Make now
                        </button>
                      )}
                      {(item.lane === "waiting" || item.lane === "someday") && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => move(item.id, "next")}
                        >
                          Move to Next
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          apply(() => completeJournalTask(journal, item.id), "Task completed")
                        }
                      >
                        Complete
                      </button>
                    </>
                  )}
                  {item.kind === "task" && item.lifecycle !== "open" && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        apply(() => reopenJournalTask(journal, item.id), "Task reopened in Inbox")
                      }
                    >
                      Reopen
                    </button>
                  )}
                  {item.kind === "note" && item.lifecycle === "open" && item.lane === "inbox" && (
                    <button type="button" className="primary" onClick={() => fileNote(item.id)}>
                      File note
                    </button>
                  )}
                  <button type="button" onClick={() => startCorrection(item)}>
                    Correct
                  </button>
                  {item.lifecycle === "open" && (
                    <button
                      type="button"
                      onClick={() =>
                        apply(() => cancelJournalItem(journal, item.id), "Item cancelled")
                      }
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {clarifyingId === item.id && (
                  <form className="clarify-task" onSubmit={clarify}>
                    <header>
                      <strong>Where does this task belong?</strong>
                      <span>The original capture stays in the log.</span>
                    </header>
                    <select
                      value={clarifyLane}
                      onChange={(event) =>
                        setClarifyLane(
                          event.target.value as "today" | "next" | "waiting" | "someday",
                        )
                      }
                      data-clarify-lane
                    >
                      <option value="today">Today</option>
                      <option value="next">Next action</option>
                      <option value="waiting">Waiting for</option>
                      <option value="someday">Someday / maybe</option>
                    </select>
                    {clarifyLane === "waiting" && (
                      <input
                        value={waitingFor}
                        onChange={(event) => setWaitingFor(event.target.value)}
                        maxLength={120}
                        placeholder="Who or what are you waiting for?"
                        data-waiting-for
                      />
                    )}
                    <button type="submit" data-clarify-submit>
                      Place task
                    </button>
                    <button type="button" onClick={() => setClarifyingId(null)}>
                      Cancel
                    </button>
                  </form>
                )}
                {correctingId === item.id && (
                  <form className="correct-journal-text" onSubmit={submitCorrection}>
                    <span>Append corrected wording</span>
                    <input
                      value={correctedText}
                      onChange={(event) => setCorrectedText(event.target.value)}
                      maxLength={240}
                      data-journal-correction
                    />
                    <button type="submit" data-journal-correction-submit>
                      Save correction
                    </button>
                    <button type="button" onClick={() => setCorrectingId(null)}>
                      Cancel
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="daily-flow-footnote">
        <Icon name="lock" /> Nothing moves, completes, or disappears without your choice.
      </p>
    </section>
  );
}
