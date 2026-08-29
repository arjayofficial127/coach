export interface DesktopDefinition {
  id: string;
  name: string;
  color: "violet" | "cyan" | "amber" | "rose" | "lime";
}

export interface WorkspacePreferences {
  version: 2;
  activeDesktopId: string;
  desktops: DesktopDefinition[];
}

export interface DesktopUsage {
  openTabCount: number;
  savedLinkCount: number;
}

export type DeleteDesktopResult =
  | { deleted: true; workspace: WorkspacePreferences }
  | {
      deleted: false;
      reason: "not-found" | "last-desktop" | "has-open-tabs" | "has-saved-links";
    };

export const DEFAULT_DESKTOPS: DesktopDefinition[] = [
  { id: "research", name: "Desk 1", color: "violet" },
  { id: "build", name: "Desk 2", color: "cyan" },
  { id: "inspiration", name: "Desk 3", color: "amber" },
];

export const DEFAULT_WORKSPACE: WorkspacePreferences = {
  version: 2,
  activeDesktopId: DEFAULT_DESKTOPS[0]?.id ?? "research",
  desktops: DEFAULT_DESKTOPS,
};

const VALID_COLORS = new Set<DesktopDefinition["color"]>([
  "violet",
  "cyan",
  "amber",
  "rose",
  "lime",
]);

export function parseWorkspacePreferences(serialized: string | null): WorkspacePreferences {
  if (!serialized) return DEFAULT_WORKSPACE;
  try {
    const candidate = JSON.parse(serialized) as {
      version?: number;
      activeDesktopId?: unknown;
      desktops?: Array<Partial<DesktopDefinition> | null>;
    };
    if (![1, 2].includes(candidate.version ?? 0) || !Array.isArray(candidate.desktops)) {
      return DEFAULT_WORKSPACE;
    }
    const legacyDefaultNames: Record<string, string> = {
      research: "Research",
      build: "Build",
      inspiration: "Inspiration",
    };
    const genericNames: Record<string, string> = {
      research: "Desk 1",
      build: "Desk 2",
      inspiration: "Desk 3",
    };
    const desktops = candidate.desktops
      .filter((desktop): desktop is DesktopDefinition =>
        Boolean(
          desktop &&
            typeof desktop.id === "string" &&
            typeof desktop.name === "string" &&
            desktop.name.trim() &&
            VALID_COLORS.has(desktop.color as DesktopDefinition["color"]),
        ),
      )
      .slice(0, 12)
      .map((desktop) => {
        const name = desktop.name.trim().slice(0, 40);
        const migratedName =
          candidate.version === 1 && legacyDefaultNames[desktop.id] === name
            ? (genericNames[desktop.id] ?? name)
            : name;
        return { ...desktop, name: migratedName };
      });
    if (desktops.length === 0) return DEFAULT_WORKSPACE;
    const activeDesktopId = desktops.some((desktop) => desktop.id === candidate.activeDesktopId)
      ? (candidate.activeDesktopId as string)
      : (desktops[0]?.id ?? DEFAULT_WORKSPACE.activeDesktopId);
    return { version: 2, activeDesktopId, desktops };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

export function createDesktop(name: string, index: number): DesktopDefinition {
  const colors: DesktopDefinition["color"][] = ["violet", "cyan", "amber", "rose", "lime"];
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 40),
    color: colors[index % colors.length] ?? "violet",
  };
}

export function renameDesktop(
  workspace: WorkspacePreferences,
  desktopId: string,
  name: string,
): WorkspacePreferences {
  const nextName = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!nextName) return workspace;
  if (
    workspace.desktops.some(
      (desktop) =>
        desktop.id !== desktopId && desktop.name.toLowerCase() === nextName.toLowerCase(),
    )
  ) {
    return workspace;
  }
  return {
    ...workspace,
    desktops: workspace.desktops.map((desktop) =>
      desktop.id === desktopId ? { ...desktop, name: nextName } : desktop,
    ),
  };
}

export function moveTabToDesktop(
  assignments: Record<string, string>,
  workspace: WorkspacePreferences,
  tabId: string,
  desktopId: string,
): Record<string, string> {
  if (!Object.hasOwn(assignments, tabId)) return assignments;
  if (!workspace.desktops.some((desktop) => desktop.id === desktopId)) return assignments;
  if (assignments[tabId] === desktopId) return assignments;
  return { ...assignments, [tabId]: desktopId };
}

export function deleteDesktop(
  workspace: WorkspacePreferences,
  desktopId: string,
  usage: DesktopUsage,
): DeleteDesktopResult {
  const desktopIndex = workspace.desktops.findIndex((desktop) => desktop.id === desktopId);
  if (desktopIndex < 0) return { deleted: false, reason: "not-found" };
  if (workspace.desktops.length <= 1) return { deleted: false, reason: "last-desktop" };
  if (usage.openTabCount > 0) return { deleted: false, reason: "has-open-tabs" };
  if (usage.savedLinkCount > 0) return { deleted: false, reason: "has-saved-links" };

  const desktops = workspace.desktops.filter((desktop) => desktop.id !== desktopId);
  const fallbackDesktop = desktops[Math.min(desktopIndex, desktops.length - 1)] ?? desktops[0];
  return {
    deleted: true,
    workspace: {
      ...workspace,
      activeDesktopId:
        workspace.activeDesktopId === desktopId
          ? (fallbackDesktop?.id ?? workspace.activeDesktopId)
          : workspace.activeDesktopId,
      desktops,
    },
  };
}
