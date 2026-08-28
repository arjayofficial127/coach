import { type FormEvent, useMemo, useState } from "react";
import { Icon } from "./icon";
import {
  addEarningIdea,
  addNetWorthSnapshot,
  addWealthEntry,
  changeEarningIdeaStatus,
  correctEarningIdea,
  correctNetWorthSnapshot,
  correctWealthEntry,
  type EarningIdeaStatus,
  type EffectiveEarningIdea,
  effectiveEarningIdea,
  effectiveNetWorth,
  effectiveWealthEntry,
  featureEarningIdea,
  formatPhp,
  localWealthDay,
  parsePhpAmount,
  restoreWealthEntry,
  setWealthTargets,
  summarizeWealthMonth,
  voidWealthEntry,
  type WealthEntryKind,
  type WealthLabState,
  wealthMonthKey,
} from "./wealth-lab-model";

type WealthView = "overview" | "money" | "earn" | "net-worth";

interface WealthLabSurfaceProps {
  state: WealthLabState;
  onChange: (state: WealthLabState) => void;
  onFocusIdea: (idea: EffectiveEarningIdea) => void;
  timerActive: boolean;
  reportStatus: (status: string) => void;
}

const views: Array<{ id: WealthView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "money", label: "Money" },
  { id: "earn", label: "Earn more" },
  { id: "net-worth", label: "Net worth" },
];

const ideaStatuses: EarningIdeaStatus[] = ["idea", "testing", "earning", "paused", "retired"];

function toInputAmount(minor: number): string {
  return (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);
}

function progress(current: number, target: number): number {
  return target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function readableStatus(status: EarningIdeaStatus): string {
  return status === "idea" ? "Idea" : `${status[0]?.toUpperCase()}${status.slice(1)}`;
}

export function WealthLabSurface({
  state,
  onChange,
  onFocusIdea,
  timerActive,
  reportStatus,
}: WealthLabSurfaceProps) {
  const today = localWealthDay();
  const month = wealthMonthKey();
  const monthSummary = summarizeWealthMonth(state, month);
  const entries = useMemo(() => state.entries.map(effectiveWealthEntry), [state.entries]);
  const ideas = useMemo(() => state.ideas.map(effectiveEarningIdea), [state.ideas]);
  const snapshots = useMemo(
    () => state.netWorthSnapshots.map(effectiveNetWorth),
    [state.netWorthSnapshots],
  );
  const featuredIdea = ideas.find((idea) => idea.id === state.featuredIdeaId) ?? null;
  const latestNetWorth = snapshots[0] ?? null;
  const [view, setView] = useState<WealthView>("overview");
  const [entryKind, setEntryKind] = useState<WealthEntryKind>("expense");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryLabel, setEntryLabel] = useState("");
  const [entryCategory, setEntryCategory] = useState("");
  const [entryDay, setEntryDay] = useState(today);
  const [correctingEntryId, setCorrectingEntryId] = useState<string | null>(null);
  const [correctedEntryAmount, setCorrectedEntryAmount] = useState("");
  const [correctedEntryLabel, setCorrectedEntryLabel] = useState("");
  const [correctedEntryCategory, setCorrectedEntryCategory] = useState("");
  const [correctedEntryDay, setCorrectedEntryDay] = useState(today);
  const [incomeTarget, setIncomeTarget] = useState(toInputAmount(state.monthlyIncomeTargetMinor));
  const [investmentTarget, setInvestmentTarget] = useState(
    toInputAmount(state.monthlyInvestmentTargetMinor),
  );
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaHypothesis, setIdeaHypothesis] = useState("");
  const [ideaNextStep, setIdeaNextStep] = useState("");
  const [ideaPotential, setIdeaPotential] = useState("");
  const [correctingIdeaId, setCorrectingIdeaId] = useState<string | null>(null);
  const [correctedIdeaTitle, setCorrectedIdeaTitle] = useState("");
  const [correctedIdeaHypothesis, setCorrectedIdeaHypothesis] = useState("");
  const [correctedIdeaNextStep, setCorrectedIdeaNextStep] = useState("");
  const [correctedIdeaPotential, setCorrectedIdeaPotential] = useState("");
  const [assets, setAssets] = useState("");
  const [liabilities, setLiabilities] = useState("");
  const [snapshotDay, setSnapshotDay] = useState(today);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [correctingSnapshotId, setCorrectingSnapshotId] = useState<string | null>(null);
  const [correctedAssets, setCorrectedAssets] = useState("");
  const [correctedLiabilities, setCorrectedLiabilities] = useState("");
  const [correctedSnapshotDay, setCorrectedSnapshotDay] = useState(today);
  const [correctedSnapshotNote, setCorrectedSnapshotNote] = useState("");

  const apply = (operation: () => WealthLabState, message: string) => {
    try {
      onChange(operation());
      reportStatus(message);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const submitTargets = (event: FormEvent) => {
    event.preventDefault();
    const income = incomeTarget.trim() ? parsePhpAmount(incomeTarget, true) : 0;
    const investment = investmentTarget.trim() ? parsePhpAmount(investmentTarget, true) : 0;
    if (income === null || investment === null) {
      reportStatus("Enter valid non-negative monthly targets");
      return;
    }
    apply(() => setWealthTargets(state, income, investment), "Monthly targets saved locally");
  };

  const submitEntry = (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = parsePhpAmount(entryAmount);
    if (amountMinor === null) {
      reportStatus("Enter a positive amount with up to two decimals");
      return;
    }
    try {
      onChange(
        addWealthEntry(state, {
          kind: entryKind,
          amountMinor,
          label: entryLabel,
          category: entryCategory,
          occurredOn: entryDay,
        }),
      );
      setEntryAmount("");
      setEntryLabel("");
      setEntryCategory("");
      reportStatus(`${entryKind === "investment" ? "Contribution" : entryKind} recorded`);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const beginEntryCorrection = (entry: (typeof entries)[number]) => {
    setCorrectingEntryId(entry.id);
    setCorrectedEntryAmount(toInputAmount(entry.amountMinor));
    setCorrectedEntryLabel(entry.label);
    setCorrectedEntryCategory(entry.category);
    setCorrectedEntryDay(entry.occurredOn);
  };

  const submitEntryCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (!correctingEntryId) return;
    const amountMinor = parsePhpAmount(correctedEntryAmount);
    if (amountMinor === null) {
      reportStatus("Enter a valid corrected amount");
      return;
    }
    apply(
      () =>
        correctWealthEntry(state, {
          entryId: correctingEntryId,
          amountMinor,
          label: correctedEntryLabel,
          category: correctedEntryCategory,
          occurredOn: correctedEntryDay,
          note: "Corrected from the money log",
        }),
      "Correction appended; the original money entry remains",
    );
    setCorrectingEntryId(null);
  };

  const submitIdea = (event: FormEvent) => {
    event.preventDefault();
    const potentialMonthlyMinor = ideaPotential.trim() ? parsePhpAmount(ideaPotential, true) : 0;
    if (potentialMonthlyMinor === null) {
      reportStatus("Enter a valid estimated monthly upside");
      return;
    }
    try {
      onChange(
        addEarningIdea(state, {
          title: ideaTitle,
          hypothesis: ideaHypothesis,
          nextStep: ideaNextStep,
          potentialMonthlyMinor,
        }),
      );
      setIdeaTitle("");
      setIdeaHypothesis("");
      setIdeaNextStep("");
      setIdeaPotential("");
      reportStatus("Earning idea captured as an unproven experiment");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const beginIdeaCorrection = (idea: EffectiveEarningIdea) => {
    setCorrectingIdeaId(idea.id);
    setCorrectedIdeaTitle(idea.title);
    setCorrectedIdeaHypothesis(idea.hypothesis);
    setCorrectedIdeaNextStep(idea.nextStep);
    setCorrectedIdeaPotential(toInputAmount(idea.potentialMonthlyMinor));
  };

  const submitIdeaCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (!correctingIdeaId) return;
    const potentialMonthlyMinor = correctedIdeaPotential.trim()
      ? parsePhpAmount(correctedIdeaPotential, true)
      : 0;
    if (potentialMonthlyMinor === null) {
      reportStatus("Enter a valid corrected estimate");
      return;
    }
    apply(
      () =>
        correctEarningIdea(state, {
          ideaId: correctingIdeaId,
          title: correctedIdeaTitle,
          hypothesis: correctedIdeaHypothesis,
          nextStep: correctedIdeaNextStep,
          potentialMonthlyMinor,
        }),
      "Idea correction appended; its original stays visible",
    );
    setCorrectingIdeaId(null);
  };

  const submitSnapshot = (event: FormEvent) => {
    event.preventDefault();
    const assetsMinor = assets.trim() ? parsePhpAmount(assets, true) : 0;
    const liabilitiesMinor = liabilities.trim() ? parsePhpAmount(liabilities, true) : 0;
    if (assetsMinor === null || liabilitiesMinor === null) {
      reportStatus("Enter valid assets and liabilities");
      return;
    }
    try {
      onChange(
        addNetWorthSnapshot(state, {
          assetsMinor,
          liabilitiesMinor,
          measuredOn: snapshotDay,
          note: snapshotNote,
        }),
      );
      setAssets("");
      setLiabilities("");
      setSnapshotNote("");
      reportStatus("Net-worth snapshot recorded");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const beginSnapshotCorrection = (snapshot: (typeof snapshots)[number]) => {
    setCorrectingSnapshotId(snapshot.id);
    setCorrectedAssets(toInputAmount(snapshot.assetsMinor));
    setCorrectedLiabilities(toInputAmount(snapshot.liabilitiesMinor));
    setCorrectedSnapshotDay(snapshot.measuredOn);
    setCorrectedSnapshotNote(snapshot.note);
  };

  const submitSnapshotCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (!correctingSnapshotId) return;
    const assetsMinor = correctedAssets.trim() ? parsePhpAmount(correctedAssets, true) : 0;
    const liabilitiesMinor = correctedLiabilities.trim()
      ? parsePhpAmount(correctedLiabilities, true)
      : 0;
    if (assetsMinor === null || liabilitiesMinor === null) {
      reportStatus("Enter valid corrected assets and liabilities");
      return;
    }
    apply(
      () =>
        correctNetWorthSnapshot(state, {
          snapshotId: correctingSnapshotId,
          assetsMinor,
          liabilitiesMinor,
          measuredOn: correctedSnapshotDay,
          note: correctedSnapshotNote,
        }),
      "Net-worth correction appended; the original remains",
    );
    setCorrectingSnapshotId(null);
  };

  return (
    <section className="wealth-lab-app" aria-labelledby="wealth-lab-heading" data-wealth-lab>
      <header className="wealth-lab-header">
        <span className="wealth-lab-mark">₱</span>
        <span>
          <small>Runnable app 03 · Private money decisions</small>
          <h2 id="wealth-lab-heading">Wealth Lab</h2>
          <p>See the truth. Grow earning power. Invest consistently.</p>
        </span>
        <span className="local-app-badge">Profile local · PHP</span>
      </header>

      <nav className="wealth-lab-tabs" aria-label="Wealth Lab sections">
        {views.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={view === candidate.id ? "active" : ""}
            aria-current={view === candidate.id ? "page" : undefined}
            onClick={() => setView(candidate.id)}
            data-wealth-view={candidate.id}
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      {view === "overview" && (
        <div className="wealth-overview" data-wealth-overview>
          <section className="wealth-metrics" aria-label="This month">
            <article>
              <small>Income · this month</small>
              <strong data-month-income>{formatPhp(monthSummary.incomeMinor)}</strong>
              <span>
                {percent(progress(monthSummary.incomeMinor, state.monthlyIncomeTargetMinor) / 100)}{" "}
                of target
              </span>
            </article>
            <article>
              <small>Spent</small>
              <strong>{formatPhp(monthSummary.expenseMinor)}</strong>
              <span>{percent(monthSummary.savingsRate)} savings rate</span>
            </article>
            <article>
              <small>Invested</small>
              <strong data-month-invested>{formatPhp(monthSummary.investmentMinor)}</strong>
              <span>{percent(monthSummary.investmentRate)} of income</span>
            </article>
            <article className={monthSummary.netCashMinor >= 0 ? "positive" : "negative"}>
              <small>Net cash</small>
              <strong data-month-net-cash>{formatPhp(monthSummary.netCashMinor)}</strong>
              <span>Income minus spending</span>
            </article>
          </section>

          <div className="wealth-overview-grid">
            <section className="wealth-goals-card">
              <header>
                <span>
                  <small>Monthly system</small>
                  <h3>Targets you control</h3>
                </span>
                <Icon name="sparkle" />
              </header>
              <div className="wealth-goal-progress">
                <span>
                  <b>Income</b>
                  <em>{formatPhp(state.monthlyIncomeTargetMinor)}</em>
                </span>
                <i>
                  <b
                    style={{
                      width: `${progress(monthSummary.incomeMinor, state.monthlyIncomeTargetMinor)}%`,
                    }}
                  />
                </i>
                <span>
                  <b>Investing</b>
                  <em>{formatPhp(state.monthlyInvestmentTargetMinor)}</em>
                </span>
                <i>
                  <b
                    style={{
                      width: `${progress(monthSummary.investmentMinor, state.monthlyInvestmentTargetMinor)}%`,
                    }}
                  />
                </i>
              </div>
              <form onSubmit={submitTargets} data-wealth-targets>
                <label>
                  Income target
                  <span>
                    <b>₱</b>
                    <input
                      value={incomeTarget}
                      onChange={(event) => setIncomeTarget(event.target.value)}
                      inputMode="decimal"
                      data-income-target
                    />
                  </span>
                </label>
                <label>
                  Invest target
                  <span>
                    <b>₱</b>
                    <input
                      value={investmentTarget}
                      onChange={(event) => setInvestmentTarget(event.target.value)}
                      inputMode="decimal"
                      data-investment-target
                    />
                  </span>
                </label>
                <button type="submit">Save targets</button>
              </form>
            </section>

            <section className="wealth-next-move" data-featured-idea>
              <header>
                <span>
                  <small>One money move</small>
                  <h3>{featuredIdea?.title ?? "Choose one earning experiment"}</h3>
                </span>
                <em>{featuredIdea ? readableStatus(featuredIdea.status) : "No idea selected"}</em>
              </header>
              {featuredIdea ? (
                <>
                  <p>{featuredIdea.hypothesis}</p>
                  <div>
                    <span>
                      <small>Smallest next test</small>
                      <strong>{featuredIdea.nextStep}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onFocusIdea(featuredIdea)}
                      data-focus-wealth-idea
                    >
                      <Icon name="timer" /> {timerActive ? "View timer" : "Focus 25m"}
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setView("earn")}>
                  Capture an earning idea
                </button>
              )}
            </section>

            <section className="wealth-net-worth-card">
              <small>Latest net worth</small>
              <strong data-latest-net-worth>
                {latestNetWorth ? formatPhp(latestNetWorth.netWorthMinor) : "No snapshot yet"}
              </strong>
              <span>
                {latestNetWorth
                  ? `Measured ${latestNetWorth.measuredOn}`
                  : "Assets minus liabilities—not a market forecast."}
              </span>
              <button type="button" onClick={() => setView("net-worth")}>
                {latestNetWorth ? "View history" : "Add snapshot"}
              </button>
            </section>
          </div>

          <p className="wealth-safety-note">
            <Icon name="lock" /> No bank connections, brokerage actions, live prices, or investment
            recommendations. Estimates stay visibly unverified.
          </p>
        </div>
      )}

      {view === "money" && (
        <div className="wealth-section" data-wealth-money>
          <header className="wealth-section-heading">
            <span>
              <small>Money log</small>
              <h3>Record what actually happened</h3>
            </span>
            <p>Contributions are tracked separately from spending.</p>
          </header>
          <form className="wealth-entry-form" onSubmit={submitEntry} data-wealth-entry-form>
            <fieldset>
              <legend className="sr-only">Entry type</legend>
              {(["income", "expense", "investment"] as WealthEntryKind[]).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  className={entryKind === kind ? "active" : ""}
                  onClick={() => setEntryKind(kind)}
                  data-entry-kind={kind}
                >
                  {kind === "income" ? "+ Income" : kind === "expense" ? "− Spent" : "↗ Invested"}
                </button>
              ))}
            </fieldset>
            <label>
              <span>Description</span>
              <input
                value={entryLabel}
                onChange={(event) => setEntryLabel(event.target.value)}
                maxLength={160}
                placeholder="Salary, rent, index fund…"
                data-entry-label
              />
            </label>
            <label>
              <span>Amount</span>
              <span className="money-input">
                <b>₱</b>
                <input
                  value={entryAmount}
                  onChange={(event) => setEntryAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  data-entry-amount
                />
              </span>
            </label>
            <label>
              <span>Category</span>
              <input
                value={entryCategory}
                onChange={(event) => setEntryCategory(event.target.value)}
                maxLength={80}
                placeholder="Optional"
                data-entry-category
              />
            </label>
            <label>
              <span>Date</span>
              <input
                type="date"
                value={entryDay}
                onChange={(event) => setEntryDay(event.target.value)}
                data-entry-day
              />
            </label>
            <button type="submit" data-entry-submit>
              Record
            </button>
          </form>
          <div className="wealth-entry-list">
            {entries.length === 0 ? (
              <p className="wealth-empty">Your money log is clear.</p>
            ) : (
              entries.map((entry) => (
                <article
                  key={entry.id}
                  className={`wealth-entry ${entry.kind} ${entry.active ? "" : "voided"}`}
                  data-wealth-entry={entry.id}
                >
                  <span className="wealth-entry-kind">
                    {entry.kind === "income" ? "+" : entry.kind === "expense" ? "−" : "↗"}
                  </span>
                  <span className="wealth-entry-copy">
                    <span>
                      <strong>{entry.label}</strong>
                      {entry.corrected && <em>Corrected</em>}
                      {!entry.active && <em>Voided</em>}
                    </span>
                    <small>
                      {entry.category || entry.kind} · {entry.occurredOn}
                    </small>
                    {entry.corrected && (
                      <q>
                        Original: {formatPhp(entry.original.amountMinor)} · {entry.original.label}
                      </q>
                    )}
                  </span>
                  <strong className="wealth-entry-amount">{formatPhp(entry.amountMinor)}</strong>
                  <div className="wealth-entry-actions">
                    <button type="button" onClick={() => beginEntryCorrection(entry)}>
                      Correct
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        apply(
                          () =>
                            entry.active
                              ? voidWealthEntry(state, entry.id)
                              : restoreWealthEntry(state, entry.id),
                          entry.active ? "Entry voided; original retained" : "Entry restored",
                        )
                      }
                    >
                      {entry.active ? "Void" : "Restore"}
                    </button>
                  </div>
                  {correctingEntryId === entry.id && (
                    <form className="wealth-correction-form" onSubmit={submitEntryCorrection}>
                      <input
                        value={correctedEntryLabel}
                        onChange={(event) => setCorrectedEntryLabel(event.target.value)}
                        data-entry-correction-label
                      />
                      <span className="money-input">
                        <b>₱</b>
                        <input
                          value={correctedEntryAmount}
                          onChange={(event) => setCorrectedEntryAmount(event.target.value)}
                          inputMode="decimal"
                          data-entry-correction-amount
                        />
                      </span>
                      <input
                        value={correctedEntryCategory}
                        onChange={(event) => setCorrectedEntryCategory(event.target.value)}
                        placeholder="Category"
                      />
                      <input
                        type="date"
                        value={correctedEntryDay}
                        onChange={(event) => setCorrectedEntryDay(event.target.value)}
                      />
                      <button type="submit" data-entry-correction-submit>
                        Save correction
                      </button>
                      <button type="button" onClick={() => setCorrectingEntryId(null)}>
                        Cancel
                      </button>
                    </form>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {view === "earn" && (
        <div className="wealth-section" data-wealth-ideas>
          <header className="wealth-section-heading">
            <span>
              <small>Earning lab</small>
              <h3>Turn ideas into paid evidence</h3>
            </span>
            <p>Potential is an estimate until a real customer pays.</p>
          </header>
          <form className="earning-idea-form" onSubmit={submitIdea} data-earning-idea-form>
            <label>
              <span>Idea</span>
              <input
                value={ideaTitle}
                onChange={(event) => setIdeaTitle(event.target.value)}
                maxLength={160}
                placeholder="What could you sell?"
                data-idea-title
              />
            </label>
            <label>
              <span>Why it may work</span>
              <textarea
                value={ideaHypothesis}
                onChange={(event) => setIdeaHypothesis(event.target.value)}
                maxLength={320}
                placeholder="Who has the problem, and why might they pay?"
                data-idea-hypothesis
              />
            </label>
            <label>
              <span>Smallest paid test</span>
              <input
                value={ideaNextStep}
                onChange={(event) => setIdeaNextStep(event.target.value)}
                maxLength={240}
                placeholder="One action you can finish"
                data-idea-next-step
              />
            </label>
            <label>
              <span>Unverified monthly upside</span>
              <span className="money-input">
                <b>₱</b>
                <input
                  value={ideaPotential}
                  onChange={(event) => setIdeaPotential(event.target.value)}
                  inputMode="decimal"
                  placeholder="Optional"
                  data-idea-potential
                />
              </span>
            </label>
            <button type="submit" data-idea-submit>
              Capture experiment
            </button>
          </form>
          <div className="earning-idea-list">
            {ideas.length === 0 ? (
              <p className="wealth-empty">
                Capture one idea worth testing—not ten worth worrying about.
              </p>
            ) : (
              ideas.map((idea) => (
                <article
                  key={idea.id}
                  className={`earning-idea ${state.featuredIdeaId === idea.id ? "featured" : ""}`}
                  data-earning-idea={idea.id}
                >
                  <header>
                    <span>
                      <small>{readableStatus(idea.status)}</small>
                      <h4>{idea.title}</h4>
                    </span>
                    <strong>
                      {idea.potentialMonthlyMinor > 0
                        ? `${formatPhp(idea.potentialMonthlyMinor)} / mo?`
                        : "Upside unknown"}
                    </strong>
                  </header>
                  <p>{idea.hypothesis}</p>
                  <div className="idea-next-step">
                    <small>Next test</small>
                    <strong>{idea.nextStep}</strong>
                  </div>
                  {idea.corrected && <q>Original idea: {idea.original.title}</q>}
                  <div className="earning-idea-actions">
                    <select
                      value={idea.status}
                      onChange={(event) =>
                        apply(
                          () =>
                            changeEarningIdeaStatus(
                              state,
                              idea.id,
                              event.target.value as EarningIdeaStatus,
                            ),
                          `Idea moved to ${event.target.value}`,
                        )
                      }
                      data-idea-status
                    >
                      {ideaStatuses.map((status) => (
                        <option key={status} value={status}>
                          {readableStatus(status)}
                        </option>
                      ))}
                    </select>
                    {idea.status !== "retired" && state.featuredIdeaId !== idea.id && (
                      <button
                        type="button"
                        onClick={() =>
                          apply(
                            () => featureEarningIdea(state, idea.id),
                            "Primary earning experiment selected",
                          )
                        }
                      >
                        Make primary
                      </button>
                    )}
                    {idea.status !== "retired" && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onFocusIdea(idea)}
                        data-focus-wealth-idea
                      >
                        <Icon name="timer" /> {timerActive ? "View timer" : "Focus 25m"}
                      </button>
                    )}
                    <button type="button" onClick={() => beginIdeaCorrection(idea)}>
                      Correct
                    </button>
                  </div>
                  {correctingIdeaId === idea.id && (
                    <form className="idea-correction-form" onSubmit={submitIdeaCorrection}>
                      <input
                        value={correctedIdeaTitle}
                        onChange={(event) => setCorrectedIdeaTitle(event.target.value)}
                        data-idea-correction-title
                      />
                      <textarea
                        value={correctedIdeaHypothesis}
                        onChange={(event) => setCorrectedIdeaHypothesis(event.target.value)}
                      />
                      <input
                        value={correctedIdeaNextStep}
                        onChange={(event) => setCorrectedIdeaNextStep(event.target.value)}
                      />
                      <span className="money-input">
                        <b>₱</b>
                        <input
                          value={correctedIdeaPotential}
                          onChange={(event) => setCorrectedIdeaPotential(event.target.value)}
                          inputMode="decimal"
                        />
                      </span>
                      <button type="submit">Save correction</button>
                      <button type="button" onClick={() => setCorrectingIdeaId(null)}>
                        Cancel
                      </button>
                    </form>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {view === "net-worth" && (
        <div className="wealth-section" data-net-worth>
          <header className="wealth-section-heading">
            <span>
              <small>Long view</small>
              <h3>Net worth snapshots</h3>
            </span>
            <p>Measure occasionally. Do not turn market noise into a daily mood.</p>
          </header>
          <form className="net-worth-form" onSubmit={submitSnapshot} data-net-worth-form>
            <label>
              <span>Total assets</span>
              <span className="money-input">
                <b>₱</b>
                <input
                  value={assets}
                  onChange={(event) => setAssets(event.target.value)}
                  inputMode="decimal"
                  placeholder="Cash + investments + assets"
                  data-assets
                />
              </span>
            </label>
            <label>
              <span>Total liabilities</span>
              <span className="money-input">
                <b>₱</b>
                <input
                  value={liabilities}
                  onChange={(event) => setLiabilities(event.target.value)}
                  inputMode="decimal"
                  placeholder="Debt"
                  data-liabilities
                />
              </span>
            </label>
            <label>
              <span>Measured on</span>
              <input
                type="date"
                value={snapshotDay}
                onChange={(event) => setSnapshotDay(event.target.value)}
                data-snapshot-day
              />
            </label>
            <label>
              <span>Note</span>
              <input
                value={snapshotNote}
                onChange={(event) => setSnapshotNote(event.target.value)}
                maxLength={240}
                placeholder="Optional context"
                data-snapshot-note
              />
            </label>
            <button type="submit" data-snapshot-submit>
              Add snapshot
            </button>
          </form>
          <div className="net-worth-history">
            {snapshots.length === 0 ? (
              <p className="wealth-empty">No net-worth snapshot yet.</p>
            ) : (
              snapshots.map((snapshot) => (
                <article key={snapshot.id} data-net-worth-snapshot={snapshot.id}>
                  <span>
                    <small>{snapshot.measuredOn}</small>
                    <strong>{formatPhp(snapshot.netWorthMinor)}</strong>
                    {snapshot.corrected && <em>Corrected</em>}
                  </span>
                  <span>
                    <small>Assets</small>
                    <b>{formatPhp(snapshot.assetsMinor)}</b>
                  </span>
                  <span>
                    <small>Liabilities</small>
                    <b>{formatPhp(snapshot.liabilitiesMinor)}</b>
                  </span>
                  <button type="button" onClick={() => beginSnapshotCorrection(snapshot)}>
                    Correct
                  </button>
                  {snapshot.corrected && (
                    <q>
                      Original net worth:{" "}
                      {formatPhp(
                        snapshot.original.assetsMinor - snapshot.original.liabilitiesMinor,
                      )}
                    </q>
                  )}
                  {correctingSnapshotId === snapshot.id && (
                    <form className="snapshot-correction-form" onSubmit={submitSnapshotCorrection}>
                      <span className="money-input">
                        <b>₱</b>
                        <input
                          value={correctedAssets}
                          onChange={(event) => setCorrectedAssets(event.target.value)}
                          inputMode="decimal"
                        />
                      </span>
                      <span className="money-input">
                        <b>₱</b>
                        <input
                          value={correctedLiabilities}
                          onChange={(event) => setCorrectedLiabilities(event.target.value)}
                          inputMode="decimal"
                        />
                      </span>
                      <input
                        type="date"
                        value={correctedSnapshotDay}
                        onChange={(event) => setCorrectedSnapshotDay(event.target.value)}
                      />
                      <input
                        value={correctedSnapshotNote}
                        onChange={(event) => setCorrectedSnapshotNote(event.target.value)}
                        placeholder="Note"
                      />
                      <button type="submit">Save correction</button>
                      <button type="button" onClick={() => setCorrectingSnapshotId(null)}>
                        Cancel
                      </button>
                    </form>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
