export const WEALTH_CURRENCY = "PHP" as const;
export const MAX_WEALTH_ENTRIES = 1_000;
export const MAX_EARNING_IDEAS = 300;
export const MAX_NET_WORTH_SNAPSHOTS = 300;
export const MAX_WEALTH_ACTIVITY = 64;
export const MAX_MONEY_MINOR = 100_000_000_000;

export type WealthEntryKind = "income" | "expense" | "investment";
export type EarningIdeaStatus = "idea" | "testing" | "earning" | "paused" | "retired";

export interface WealthEntryOriginal {
  kind: WealthEntryKind;
  amountMinor: number;
  label: string;
  category: string;
  occurredOn: string;
  recordedAt: string;
}

export interface WealthEntryActivity {
  id: string;
  recordedAt: string;
  type: "corrected" | "voided" | "restored";
  amountMinor?: number;
  label?: string;
  category?: string;
  occurredOn?: string;
  note?: string;
}

export interface WealthEntry {
  id: string;
  original: WealthEntryOriginal;
  activity: WealthEntryActivity[];
}

export interface EffectiveWealthEntry extends WealthEntryOriginal {
  id: string;
  original: WealthEntryOriginal;
  active: boolean;
  corrected: boolean;
  activity: WealthEntryActivity[];
}

export interface EarningIdeaOriginal {
  title: string;
  hypothesis: string;
  nextStep: string;
  potentialMonthlyMinor: number;
  capturedAt: string;
}

export interface EarningIdeaActivity {
  id: string;
  recordedAt: string;
  type: "status-changed" | "corrected";
  status?: EarningIdeaStatus;
  title?: string;
  hypothesis?: string;
  nextStep?: string;
  potentialMonthlyMinor?: number;
}

export interface EarningIdea {
  id: string;
  original: EarningIdeaOriginal;
  activity: EarningIdeaActivity[];
}

export interface EffectiveEarningIdea extends EarningIdeaOriginal {
  id: string;
  original: EarningIdeaOriginal;
  status: EarningIdeaStatus;
  corrected: boolean;
  activity: EarningIdeaActivity[];
}

export interface NetWorthOriginal {
  assetsMinor: number;
  liabilitiesMinor: number;
  measuredOn: string;
  note: string;
  recordedAt: string;
}

export interface NetWorthCorrection {
  id: string;
  recordedAt: string;
  assetsMinor: number;
  liabilitiesMinor: number;
  measuredOn: string;
  note: string;
}

export interface NetWorthSnapshot {
  id: string;
  original: NetWorthOriginal;
  corrections: NetWorthCorrection[];
}

export interface EffectiveNetWorthSnapshot extends NetWorthOriginal {
  id: string;
  original: NetWorthOriginal;
  corrected: boolean;
  netWorthMinor: number;
  corrections: NetWorthCorrection[];
}

export interface WealthLabState {
  currency: typeof WEALTH_CURRENCY;
  monthlyIncomeTargetMinor: number;
  monthlyInvestmentTargetMinor: number;
  entries: WealthEntry[];
  ideas: EarningIdea[];
  netWorthSnapshots: NetWorthSnapshot[];
  featuredIdeaId: string | null;
}

export interface WealthMonthSummary {
  incomeMinor: number;
  expenseMinor: number;
  investmentMinor: number;
  netCashMinor: number;
  savingsRate: number | null;
  investmentRate: number | null;
}

export const DEFAULT_WEALTH_LAB_STATE: WealthLabState = {
  currency: WEALTH_CURRENCY,
  monthlyIncomeTargetMinor: 0,
  monthlyInvestmentTargetMinor: 0,
  entries: [],
  ideas: [],
  netWorthSnapshots: [],
  featuredIdeaId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isWealthDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function localWealthDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function wealthMonthKey(date = new Date()): string {
  return localWealthDay(date).slice(0, 7);
}

function boundedMinor(value: unknown, allowZero = true): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  const minimum = allowZero ? 0 : 1;
  return value >= minimum && value <= MAX_MONEY_MINOR ? value : null;
}

export function parsePhpAmount(value: string, allowZero = false): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [major = "0", fraction = ""] = normalized.split(".");
  const minor = Number(major) * 100 + Number(fraction.padEnd(2, "0"));
  return boundedMinor(minor, allowZero);
}

export function formatPhp(minor: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: WEALTH_CURRENCY,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

function parseEntryKind(value: unknown): WealthEntryKind | null {
  return value === "income" || value === "expense" || value === "investment" ? value : null;
}

function parseEntryActivity(value: unknown): WealthEntryActivity | null {
  if (!isRecord(value) || typeof value.id !== "string" || !validIsoDate(value.recordedAt)) {
    return null;
  }
  if (value.type !== "corrected" && value.type !== "voided" && value.type !== "restored") {
    return null;
  }
  const activity: WealthEntryActivity = {
    id: value.id,
    recordedAt: value.recordedAt,
    type: value.type,
  };
  if (value.type === "corrected") {
    const amountMinor = boundedMinor(value.amountMinor, false);
    const label = normalizedText(value.label, 160);
    const category = normalizedText(value.category, 80);
    if (!amountMinor || !label || !isWealthDay(value.occurredOn)) return null;
    activity.amountMinor = amountMinor;
    activity.label = label;
    activity.category = category;
    activity.occurredOn = value.occurredOn;
  }
  const note = normalizedText(value.note, 240);
  if (note) activity.note = note;
  return activity;
}

function parseWealthEntry(value: unknown): WealthEntry | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.original)) return null;
  const kind = parseEntryKind(value.original.kind);
  const amountMinor = boundedMinor(value.original.amountMinor, false);
  const label = normalizedText(value.original.label, 160);
  const category = normalizedText(value.original.category, 80);
  if (
    !kind ||
    !amountMinor ||
    !label ||
    !isWealthDay(value.original.occurredOn) ||
    !validIsoDate(value.original.recordedAt) ||
    !Array.isArray(value.activity) ||
    value.activity.length > MAX_WEALTH_ACTIVITY
  ) {
    return null;
  }
  const activityIds = new Set<string>();
  return {
    id: value.id,
    original: {
      kind,
      amountMinor,
      label,
      category,
      occurredOn: value.original.occurredOn,
      recordedAt: value.original.recordedAt,
    },
    activity: value.activity
      .map(parseEntryActivity)
      .filter((activity): activity is WealthEntryActivity => {
        if (!activity || activityIds.has(activity.id)) return false;
        activityIds.add(activity.id);
        return true;
      }),
  };
}

function parseIdeaStatus(value: unknown): EarningIdeaStatus | null {
  return value === "idea" ||
    value === "testing" ||
    value === "earning" ||
    value === "paused" ||
    value === "retired"
    ? value
    : null;
}

function parseIdeaActivity(value: unknown): EarningIdeaActivity | null {
  if (!isRecord(value) || typeof value.id !== "string" || !validIsoDate(value.recordedAt)) {
    return null;
  }
  if (value.type === "status-changed") {
    const status = parseIdeaStatus(value.status);
    return status ? { id: value.id, recordedAt: value.recordedAt, type: value.type, status } : null;
  }
  if (value.type !== "corrected") return null;
  const title = normalizedText(value.title, 160);
  const hypothesis = normalizedText(value.hypothesis, 320);
  const nextStep = normalizedText(value.nextStep, 240);
  const potentialMonthlyMinor = boundedMinor(value.potentialMonthlyMinor);
  if (!title || !hypothesis || !nextStep || potentialMonthlyMinor === null) return null;
  return {
    id: value.id,
    recordedAt: value.recordedAt,
    type: value.type,
    title,
    hypothesis,
    nextStep,
    potentialMonthlyMinor,
  };
}

function parseEarningIdea(value: unknown): EarningIdea | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.original)) return null;
  const title = normalizedText(value.original.title, 160);
  const hypothesis = normalizedText(value.original.hypothesis, 320);
  const nextStep = normalizedText(value.original.nextStep, 240);
  const potentialMonthlyMinor = boundedMinor(value.original.potentialMonthlyMinor);
  if (
    !title ||
    !hypothesis ||
    !nextStep ||
    potentialMonthlyMinor === null ||
    !validIsoDate(value.original.capturedAt) ||
    !Array.isArray(value.activity) ||
    value.activity.length > MAX_WEALTH_ACTIVITY
  ) {
    return null;
  }
  const activityIds = new Set<string>();
  return {
    id: value.id,
    original: {
      title,
      hypothesis,
      nextStep,
      potentialMonthlyMinor,
      capturedAt: value.original.capturedAt,
    },
    activity: value.activity
      .map(parseIdeaActivity)
      .filter((activity): activity is EarningIdeaActivity => {
        if (!activity || activityIds.has(activity.id)) return false;
        activityIds.add(activity.id);
        return true;
      }),
  };
}

function parseNetWorthCorrection(value: unknown): NetWorthCorrection | null {
  if (!isRecord(value) || typeof value.id !== "string" || !validIsoDate(value.recordedAt)) {
    return null;
  }
  const assetsMinor = boundedMinor(value.assetsMinor);
  const liabilitiesMinor = boundedMinor(value.liabilitiesMinor);
  if (assetsMinor === null || liabilitiesMinor === null || !isWealthDay(value.measuredOn)) {
    return null;
  }
  return {
    id: value.id,
    recordedAt: value.recordedAt,
    assetsMinor,
    liabilitiesMinor,
    measuredOn: value.measuredOn,
    note: normalizedText(value.note, 240),
  };
}

function parseNetWorthSnapshot(value: unknown): NetWorthSnapshot | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.original)) return null;
  const assetsMinor = boundedMinor(value.original.assetsMinor);
  const liabilitiesMinor = boundedMinor(value.original.liabilitiesMinor);
  if (
    assetsMinor === null ||
    liabilitiesMinor === null ||
    !isWealthDay(value.original.measuredOn) ||
    !validIsoDate(value.original.recordedAt) ||
    !Array.isArray(value.corrections) ||
    value.corrections.length > MAX_WEALTH_ACTIVITY
  ) {
    return null;
  }
  const correctionIds = new Set<string>();
  return {
    id: value.id,
    original: {
      assetsMinor,
      liabilitiesMinor,
      measuredOn: value.original.measuredOn,
      note: normalizedText(value.original.note, 240),
      recordedAt: value.original.recordedAt,
    },
    corrections: value.corrections
      .map(parseNetWorthCorrection)
      .filter((correction): correction is NetWorthCorrection => {
        if (!correction || correctionIds.has(correction.id)) return false;
        correctionIds.add(correction.id);
        return true;
      }),
  };
}

export function parseWealthLabState(value: unknown): WealthLabState {
  if (!isRecord(value)) return DEFAULT_WEALTH_LAB_STATE;
  const monthlyIncomeTargetMinor = boundedMinor(value.monthlyIncomeTargetMinor);
  const monthlyInvestmentTargetMinor = boundedMinor(value.monthlyInvestmentTargetMinor);
  if (monthlyIncomeTargetMinor === null || monthlyInvestmentTargetMinor === null) {
    return DEFAULT_WEALTH_LAB_STATE;
  }
  const unique = <T extends { id: string }>(items: T[]) => {
    const ids = new Set<string>();
    return items.filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    });
  };
  const entries = unique(
    (Array.isArray(value.entries) ? value.entries : [])
      .slice(0, MAX_WEALTH_ENTRIES)
      .map(parseWealthEntry)
      .filter((entry): entry is WealthEntry => !!entry),
  );
  const ideas = unique(
    (Array.isArray(value.ideas) ? value.ideas : [])
      .slice(0, MAX_EARNING_IDEAS)
      .map(parseEarningIdea)
      .filter((idea): idea is EarningIdea => !!idea),
  );
  const netWorthSnapshots = unique(
    (Array.isArray(value.netWorthSnapshots) ? value.netWorthSnapshots : [])
      .slice(0, MAX_NET_WORTH_SNAPSHOTS)
      .map(parseNetWorthSnapshot)
      .filter((snapshot): snapshot is NetWorthSnapshot => !!snapshot),
  );
  const requestedFeatured = typeof value.featuredIdeaId === "string" ? value.featuredIdeaId : null;
  const featuredIdeaId = ideas.some(
    (idea) => idea.id === requestedFeatured && effectiveEarningIdea(idea).status !== "retired",
  )
    ? requestedFeatured
    : null;
  return {
    currency: WEALTH_CURRENCY,
    monthlyIncomeTargetMinor,
    monthlyInvestmentTargetMinor,
    entries,
    ideas,
    netWorthSnapshots,
    featuredIdeaId,
  };
}

export function effectiveWealthEntry(entry: WealthEntry): EffectiveWealthEntry {
  const effective: EffectiveWealthEntry = {
    id: entry.id,
    ...entry.original,
    original: entry.original,
    active: true,
    corrected: false,
    activity: entry.activity,
  };
  for (const activity of entry.activity) {
    if (activity.type === "corrected") {
      if (activity.amountMinor !== undefined) effective.amountMinor = activity.amountMinor;
      if (activity.label !== undefined) effective.label = activity.label;
      if (activity.category !== undefined) effective.category = activity.category;
      if (activity.occurredOn !== undefined) effective.occurredOn = activity.occurredOn;
      effective.corrected = true;
    } else if (activity.type === "voided") effective.active = false;
    else if (activity.type === "restored") effective.active = true;
  }
  return effective;
}

export function effectiveEarningIdea(idea: EarningIdea): EffectiveEarningIdea {
  const effective: EffectiveEarningIdea = {
    id: idea.id,
    ...idea.original,
    original: idea.original,
    status: "idea",
    corrected: false,
    activity: idea.activity,
  };
  for (const activity of idea.activity) {
    if (activity.type === "status-changed" && activity.status) effective.status = activity.status;
    else if (activity.type === "corrected") {
      if (activity.title !== undefined) effective.title = activity.title;
      if (activity.hypothesis !== undefined) effective.hypothesis = activity.hypothesis;
      if (activity.nextStep !== undefined) effective.nextStep = activity.nextStep;
      if (activity.potentialMonthlyMinor !== undefined) {
        effective.potentialMonthlyMinor = activity.potentialMonthlyMinor;
      }
      effective.corrected = true;
    }
  }
  return effective;
}

export function effectiveNetWorth(snapshot: NetWorthSnapshot): EffectiveNetWorthSnapshot {
  const correction = snapshot.corrections.at(-1);
  const values = correction ?? snapshot.original;
  return {
    id: snapshot.id,
    original: snapshot.original,
    assetsMinor: values.assetsMinor,
    liabilitiesMinor: values.liabilitiesMinor,
    measuredOn: values.measuredOn,
    note: values.note,
    recordedAt: values.recordedAt,
    corrected: Boolean(correction),
    netWorthMinor: values.assetsMinor - values.liabilitiesMinor,
    corrections: snapshot.corrections,
  };
}

export function setWealthTargets(
  state: WealthLabState,
  monthlyIncomeTargetMinor: number,
  monthlyInvestmentTargetMinor: number,
): WealthLabState {
  if (
    boundedMinor(monthlyIncomeTargetMinor) === null ||
    boundedMinor(monthlyInvestmentTargetMinor) === null
  ) {
    throw new Error("Targets must be valid non-negative PHP amounts.");
  }
  return { ...state, monthlyIncomeTargetMinor, monthlyInvestmentTargetMinor };
}

export function addWealthEntry(
  state: WealthLabState,
  input: {
    kind: WealthEntryKind;
    amountMinor: number;
    label: string;
    category?: string;
    occurredOn: string;
  },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  if (state.entries.length >= MAX_WEALTH_ENTRIES) throw new Error("The money log is full.");
  const amountMinor = boundedMinor(input.amountMinor, false);
  const label = normalizedText(input.label, 160);
  if (!amountMinor || !label || !isWealthDay(input.occurredOn)) {
    throw new Error("Enter a description, positive amount, and valid date.");
  }
  return {
    ...state,
    entries: [
      {
        id,
        original: {
          kind: input.kind,
          amountMinor,
          label,
          category: normalizedText(input.category, 80),
          occurredOn: input.occurredOn,
          recordedAt: now,
        },
        activity: [],
      },
      ...state.entries,
    ],
  };
}

export function correctWealthEntry(
  state: WealthLabState,
  input: {
    entryId: string;
    amountMinor: number;
    label: string;
    category?: string;
    occurredOn: string;
    note?: string;
  },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  const entry = state.entries.find((candidate) => candidate.id === input.entryId);
  const amountMinor = boundedMinor(input.amountMinor, false);
  const label = normalizedText(input.label, 160);
  if (!entry) throw new Error("The money entry no longer exists.");
  if (entry.activity.length >= MAX_WEALTH_ACTIVITY) throw new Error("This entry history is full.");
  if (!amountMinor || !label || !isWealthDay(input.occurredOn)) {
    throw new Error("The corrected entry is incomplete.");
  }
  return {
    ...state,
    entries: state.entries.map((candidate) =>
      candidate.id === input.entryId
        ? {
            ...candidate,
            activity: [
              ...candidate.activity,
              {
                id,
                recordedAt: now,
                type: "corrected" as const,
                amountMinor,
                label,
                category: normalizedText(input.category, 80),
                occurredOn: input.occurredOn,
                note: normalizedText(input.note, 240),
              },
            ],
          }
        : candidate,
    ),
  };
}

function toggleEntry(
  state: WealthLabState,
  entryId: string,
  type: "voided" | "restored",
  now: string,
  id: string,
): WealthLabState {
  const entry = state.entries.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error("The money entry no longer exists.");
  if (entry.activity.length >= MAX_WEALTH_ACTIVITY) throw new Error("This entry history is full.");
  return {
    ...state,
    entries: state.entries.map((candidate) =>
      candidate.id === entryId
        ? { ...candidate, activity: [...candidate.activity, { id, recordedAt: now, type }] }
        : candidate,
    ),
  };
}

export function voidWealthEntry(
  state: WealthLabState,
  entryId: string,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  return toggleEntry(state, entryId, "voided", now, id);
}

export function restoreWealthEntry(
  state: WealthLabState,
  entryId: string,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  return toggleEntry(state, entryId, "restored", now, id);
}

export function summarizeWealthMonth(state: WealthLabState, month: string): WealthMonthSummary {
  const entries = state.entries
    .map(effectiveWealthEntry)
    .filter((entry) => entry.active && entry.occurredOn.startsWith(`${month}-`));
  const total = (kind: WealthEntryKind) =>
    entries
      .filter((entry) => entry.kind === kind)
      .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const incomeMinor = total("income");
  const expenseMinor = total("expense");
  const investmentMinor = total("investment");
  return {
    incomeMinor,
    expenseMinor,
    investmentMinor,
    netCashMinor: incomeMinor - expenseMinor,
    savingsRate: incomeMinor > 0 ? (incomeMinor - expenseMinor) / incomeMinor : null,
    investmentRate: incomeMinor > 0 ? investmentMinor / incomeMinor : null,
  };
}

export function addEarningIdea(
  state: WealthLabState,
  input: {
    title: string;
    hypothesis: string;
    nextStep: string;
    potentialMonthlyMinor?: number;
  },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  if (state.ideas.length >= MAX_EARNING_IDEAS) throw new Error("The earning-idea log is full.");
  const title = normalizedText(input.title, 160);
  const hypothesis = normalizedText(input.hypothesis, 320);
  const nextStep = normalizedText(input.nextStep, 240);
  const potentialMonthlyMinor = boundedMinor(input.potentialMonthlyMinor ?? 0);
  if (!title || !hypothesis || !nextStep || potentialMonthlyMinor === null) {
    throw new Error("Name the idea, why it may work, and the smallest next test.");
  }
  const idea: EarningIdea = {
    id,
    original: { title, hypothesis, nextStep, potentialMonthlyMinor, capturedAt: now },
    activity: [],
  };
  return {
    ...state,
    ideas: [idea, ...state.ideas],
    featuredIdeaId: state.featuredIdeaId ?? id,
  };
}

export function changeEarningIdeaStatus(
  state: WealthLabState,
  ideaId: string,
  status: EarningIdeaStatus,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  const idea = state.ideas.find((candidate) => candidate.id === ideaId);
  if (!idea) throw new Error("The earning idea no longer exists.");
  if (idea.activity.length >= MAX_WEALTH_ACTIVITY) throw new Error("This idea history is full.");
  return {
    ...state,
    ideas: state.ideas.map((candidate) =>
      candidate.id === ideaId
        ? {
            ...candidate,
            activity: [
              ...candidate.activity,
              { id, recordedAt: now, type: "status-changed", status },
            ],
          }
        : candidate,
    ),
    featuredIdeaId:
      status === "retired" && state.featuredIdeaId === ideaId ? null : state.featuredIdeaId,
  };
}

export function correctEarningIdea(
  state: WealthLabState,
  input: {
    ideaId: string;
    title: string;
    hypothesis: string;
    nextStep: string;
    potentialMonthlyMinor?: number;
  },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  const idea = state.ideas.find((candidate) => candidate.id === input.ideaId);
  const title = normalizedText(input.title, 160);
  const hypothesis = normalizedText(input.hypothesis, 320);
  const nextStep = normalizedText(input.nextStep, 240);
  const potentialMonthlyMinor = boundedMinor(input.potentialMonthlyMinor ?? 0);
  if (!idea) throw new Error("The earning idea no longer exists.");
  if (idea.activity.length >= MAX_WEALTH_ACTIVITY) throw new Error("This idea history is full.");
  if (!title || !hypothesis || !nextStep || potentialMonthlyMinor === null) {
    throw new Error("The corrected idea is incomplete.");
  }
  return {
    ...state,
    ideas: state.ideas.map((candidate) =>
      candidate.id === input.ideaId
        ? {
            ...candidate,
            activity: [
              ...candidate.activity,
              {
                id,
                recordedAt: now,
                type: "corrected" as const,
                title,
                hypothesis,
                nextStep,
                potentialMonthlyMinor,
              },
            ],
          }
        : candidate,
    ),
  };
}

export function featureEarningIdea(state: WealthLabState, ideaId: string): WealthLabState {
  const idea = state.ideas.find((candidate) => candidate.id === ideaId);
  if (!idea || effectiveEarningIdea(idea).status === "retired") {
    throw new Error("Choose an active earning idea.");
  }
  return { ...state, featuredIdeaId: ideaId };
}

export function addNetWorthSnapshot(
  state: WealthLabState,
  input: { assetsMinor: number; liabilitiesMinor: number; measuredOn: string; note?: string },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  if (state.netWorthSnapshots.length >= MAX_NET_WORTH_SNAPSHOTS) {
    throw new Error("The net-worth snapshot log is full.");
  }
  const assetsMinor = boundedMinor(input.assetsMinor);
  const liabilitiesMinor = boundedMinor(input.liabilitiesMinor);
  if (assetsMinor === null || liabilitiesMinor === null || !isWealthDay(input.measuredOn)) {
    throw new Error("Enter valid assets, liabilities, and a measurement date.");
  }
  return {
    ...state,
    netWorthSnapshots: [
      {
        id,
        original: {
          assetsMinor,
          liabilitiesMinor,
          measuredOn: input.measuredOn,
          note: normalizedText(input.note, 240),
          recordedAt: now,
        },
        corrections: [],
      },
      ...state.netWorthSnapshots,
    ],
  };
}

export function correctNetWorthSnapshot(
  state: WealthLabState,
  input: {
    snapshotId: string;
    assetsMinor: number;
    liabilitiesMinor: number;
    measuredOn: string;
    note?: string;
  },
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): WealthLabState {
  const snapshot = state.netWorthSnapshots.find((candidate) => candidate.id === input.snapshotId);
  const assetsMinor = boundedMinor(input.assetsMinor);
  const liabilitiesMinor = boundedMinor(input.liabilitiesMinor);
  if (!snapshot) throw new Error("The net-worth snapshot no longer exists.");
  if (snapshot.corrections.length >= MAX_WEALTH_ACTIVITY) {
    throw new Error("This snapshot history is full.");
  }
  if (assetsMinor === null || liabilitiesMinor === null || !isWealthDay(input.measuredOn)) {
    throw new Error("The corrected net-worth snapshot is incomplete.");
  }
  return {
    ...state,
    netWorthSnapshots: state.netWorthSnapshots.map((candidate) =>
      candidate.id === input.snapshotId
        ? {
            ...candidate,
            corrections: [
              ...candidate.corrections,
              {
                id,
                recordedAt: now,
                assetsMinor,
                liabilitiesMinor,
                measuredOn: input.measuredOn,
                note: normalizedText(input.note, 240),
              },
            ],
          }
        : candidate,
    ),
  };
}
