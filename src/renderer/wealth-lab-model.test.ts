import { describe, expect, it } from "vitest";
import {
  addEarningIdea,
  addNetWorthSnapshot,
  addWealthEntry,
  changeEarningIdeaStatus,
  correctEarningIdea,
  correctNetWorthSnapshot,
  correctWealthEntry,
  DEFAULT_WEALTH_LAB_STATE,
  effectiveEarningIdea,
  effectiveNetWorth,
  effectiveWealthEntry,
  featureEarningIdea,
  parsePhpAmount,
  parseWealthLabState,
  restoreWealthEntry,
  setWealthTargets,
  summarizeWealthMonth,
  voidWealthEntry,
} from "./wealth-lab-model";

const day = "2026-08-29";
const now = "2026-08-29T02:00:00.000Z";

function firstEntry(state: ReturnType<typeof addWealthEntry>) {
  const entry = state.entries[0];
  if (!entry) throw new Error("Expected an entry");
  return entry;
}

describe("Wealth Lab model", () => {
  it("parses PHP amounts into safe integer centavos", () => {
    expect(parsePhpAmount("1,234.56")).toBe(123_456);
    expect(parsePhpAmount("0")).toBeNull();
    expect(parsePhpAmount("1.234")).toBeNull();
    expect(parsePhpAmount("not money")).toBeNull();
  });

  it("summarizes income, spending, investment, and rates without double-counting contributions", () => {
    let state = addWealthEntry(
      DEFAULT_WEALTH_LAB_STATE,
      { kind: "income", amountMinor: 10_000_000, label: "Salary", occurredOn: day },
      now,
      "income",
    );
    state = addWealthEntry(
      state,
      { kind: "expense", amountMinor: 4_000_000, label: "Living costs", occurredOn: day },
      now,
      "expense",
    );
    state = addWealthEntry(
      state,
      { kind: "investment", amountMinor: 2_000_000, label: "Contribution", occurredOn: day },
      now,
      "investment",
    );
    expect(summarizeWealthMonth(state, "2026-08")).toEqual({
      incomeMinor: 10_000_000,
      expenseMinor: 4_000_000,
      investmentMinor: 2_000_000,
      netCashMinor: 6_000_000,
      savingsRate: 0.6,
      investmentRate: 0.2,
    });
  });

  it("appends ledger corrections while retaining the original", () => {
    let state = addWealthEntry(
      DEFAULT_WEALTH_LAB_STATE,
      { kind: "expense", amountMinor: 4_000_000, label: "Original", occurredOn: day },
      now,
      "entry",
    );
    state = correctWealthEntry(
      state,
      { entryId: "entry", amountMinor: 3_500_000, label: "Corrected", occurredOn: day },
      now,
      "correction",
    );
    const entry = state.entries[0];
    if (!entry) throw new Error("Expected an entry");
    expect(entry.original.amountMinor).toBe(4_000_000);
    expect(effectiveWealthEntry(entry)).toMatchObject({
      amountMinor: 3_500_000,
      label: "Corrected",
      corrected: true,
    });
  });

  it("voids and restores a ledger entry without deleting it", () => {
    let state = addWealthEntry(
      DEFAULT_WEALTH_LAB_STATE,
      { kind: "income", amountMinor: 100_00, label: "Test", occurredOn: day },
      now,
      "entry",
    );
    state = voidWealthEntry(state, "entry", now, "void");
    expect(effectiveWealthEntry(firstEntry(state)).active).toBe(false);
    state = restoreWealthEntry(state, "entry", now, "restore");
    expect(effectiveWealthEntry(firstEntry(state)).active).toBe(true);
  });

  it("tracks income and contribution targets", () => {
    const state = setWealthTargets(DEFAULT_WEALTH_LAB_STATE, 12_000_000, 3_000_000);
    expect(state.monthlyIncomeTargetMinor).toBe(12_000_000);
    expect(state.monthlyInvestmentTargetMinor).toBe(3_000_000);
  });

  it("keeps earning ideas as explicit experiments with corrected originals", () => {
    let state = addEarningIdea(
      DEFAULT_WEALTH_LAB_STATE,
      {
        title: "Productized audit",
        hypothesis: "Small clinics will pay for a fixed-scope review",
        nextStep: "Interview three clinic owners",
        potentialMonthlyMinor: 5_000_000,
      },
      now,
      "idea",
    );
    state = changeEarningIdeaStatus(state, "idea", "testing", now, "status");
    state = correctEarningIdea(
      state,
      {
        ideaId: "idea",
        title: "Clinic launch audit",
        hypothesis: "Independent clinics need a launch review",
        nextStep: "Offer one paid pilot",
        potentialMonthlyMinor: 6_000_000,
      },
      now,
      "correction",
    );
    state = featureEarningIdea(state, "idea");
    const idea = state.ideas[0];
    if (!idea) throw new Error("Expected an idea");
    expect(idea.original.title).toBe("Productized audit");
    expect(effectiveEarningIdea(idea)).toMatchObject({
      title: "Clinic launch audit",
      status: "testing",
      corrected: true,
    });
    expect(state.featuredIdeaId).toBe("idea");
  });

  it("records and corrects net-worth snapshots without replacing the original", () => {
    let state = addNetWorthSnapshot(
      DEFAULT_WEALTH_LAB_STATE,
      { assetsMinor: 50_000_000, liabilitiesMinor: 10_000_000, measuredOn: day },
      now,
      "snapshot",
    );
    state = correctNetWorthSnapshot(
      state,
      {
        snapshotId: "snapshot",
        assetsMinor: 52_000_000,
        liabilitiesMinor: 10_000_000,
        measuredOn: day,
      },
      now,
      "correction",
    );
    const snapshot = state.netWorthSnapshots[0];
    if (!snapshot) throw new Error("Expected a snapshot");
    expect(snapshot.original.assetsMinor).toBe(50_000_000);
    expect(effectiveNetWorth(snapshot)).toMatchObject({
      netWorthMinor: 42_000_000,
      corrected: true,
    });
  });

  it("repairs malformed and dangling profile-local state", () => {
    expect(parseWealthLabState(null)).toEqual(DEFAULT_WEALTH_LAB_STATE);
    expect(
      parseWealthLabState({
        monthlyIncomeTargetMinor: 0,
        monthlyInvestmentTargetMinor: 0,
        entries: [{ id: "bad" }],
        ideas: [],
        netWorthSnapshots: [],
        featuredIdeaId: "missing",
      }),
    ).toEqual(DEFAULT_WEALTH_LAB_STATE);
  });
});
