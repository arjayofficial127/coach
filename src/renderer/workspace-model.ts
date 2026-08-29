export interface DesktopDefinition {
  id: string;
  name: string;
  color: "violet" | "cyan" | "amber" | "rose" | "lime";
}

export interface ArchivedDesktopDefinition extends DesktopDefinition {
  archivedAt: string;
  previousIndex: number;
}

export interface WorkspacePreferences {
  version: 3;
  activeDesktopId: string;
  desktops: DesktopDefinition[];
  archivedDesktops: ArchivedDesktopDefinition[];
}

export type ArchiveDesktopResult =
  | { archived: true; workspace: WorkspacePreferences }
  | {
      archived: false;
      reason: "not-found" | "last-desktop";
    };

export type RestoreDesktopResult =
  | { restored: true; workspace: WorkspacePreferences }
  | { restored: false; reason: "not-found" | "duplicate-id" };

export const DEFAULT_DESKTOPS: DesktopDefinition[] = [
  { id: "research", name: "Desk 1", color: "violet" },
  { id: "build", name: "Desk 2", color: "cyan" },
  { id: "inspiration", name: "Desk 3", color: "amber" },
];

export const DEFAULT_WORKSPACE: WorkspacePreferences = {
  version: 3,
  activeDesktopId: DEFAULT_DESKTOPS[0]?.id ?? "research",
  desktops: DEFAULT_DESKTOPS,
  archivedDesktops: [],
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
      archivedDesktops?: Array<Partial<ArchivedDesktopDefinition> | null>;
    };
    if (![1, 2, 3].includes(candidate.version ?? 0) || !Array.isArray(candidate.desktops)) {
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
    const activeIds = new Set(desktops.map((desktop) => desktop.id));
    const archivedIds = new Set<string>();
    const archivedDesktops = (candidate.archivedDesktops ?? [])
      .map((desktop) => {
        if (!desktop || typeof desktop.id !== "string" || typeof desktop.name !== "string") {
          return null;
        }
        const id = desktop.id.trim();
        const name = desktop.name.trim().replace(/\s+/g, " ").slice(0, 40);
        const color = desktop.color;
        if (
          !id ||
          !name ||
          !VALID_COLORS.has(color as DesktopDefinition["color"]) ||
          activeIds.has(id) ||
          archivedIds.has(id)
        ) {
          return null;
        }
        archivedIds.add(id);
        return {
          id,
          name,
          color: color as DesktopDefinition["color"],
          archivedAt:
            typeof desktop.archivedAt === "string" && desktop.archivedAt
              ? desktop.archivedAt
              : new Date(0).toISOString(),
          previousIndex:
            typeof desktop.previousIndex === "number" && Number.isInteger(desktop.previousIndex)
              ? Math.max(0, desktop.previousIndex)
              : desktops.length,
        };
      })
      .filter((desktop): desktop is ArchivedDesktopDefinition => desktop !== null);
    return { version: 3, activeDesktopId, desktops, archivedDesktops };
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

export function archiveDesktop(
  workspace: WorkspacePreferences,
  desktopId: string,
  archivedAt = new Date().toISOString(),
): ArchiveDesktopResult {
  const desktopIndex = workspace.desktops.findIndex((desktop) => desktop.id === desktopId);
  if (desktopIndex < 0) return { archived: false, reason: "not-found" };
  if (workspace.desktops.length <= 1) return { archived: false, reason: "last-desktop" };

  const desktop = workspace.desktops[desktopIndex];
  if (!desktop) return { archived: false, reason: "not-found" };
  const desktops = workspace.desktops.filter((desktop) => desktop.id !== desktopId);
  const fallbackDesktop = desktops[Math.min(desktopIndex, desktops.length - 1)] ?? desktops[0];
  return {
    archived: true,
    workspace: {
      ...workspace,
      activeDesktopId:
        workspace.activeDesktopId === desktopId
          ? (fallbackDesktop?.id ?? workspace.activeDesktopId)
          : workspace.activeDesktopId,
      desktops,
      archivedDesktops: [
        ...workspace.archivedDesktops.filter((candidate) => candidate.id !== desktopId),
        { ...desktop, archivedAt, previousIndex: desktopIndex },
      ],
    },
  };
}

export function restoreArchivedDesktop(
  workspace: WorkspacePreferences,
  desktopId: string,
): RestoreDesktopResult {
  const archived = workspace.archivedDesktops.find((desktop) => desktop.id === desktopId);
  if (!archived) return { restored: false, reason: "not-found" };
  if (workspace.desktops.some((desktop) => desktop.id === desktopId)) {
    return { restored: false, reason: "duplicate-id" };
  }
  const desktops = [...workspace.desktops];
  desktops.splice(Math.min(archived.previousIndex, desktops.length), 0, {
    id: archived.id,
    name: archived.name,
    color: archived.color,
  });
  return {
    restored: true,
    workspace: {
      ...workspace,
      activeDesktopId: archived.id,
      desktops,
      archivedDesktops: workspace.archivedDesktops.filter((desktop) => desktop.id !== desktopId),
    },
  };
}

export function permanentlyDeleteArchivedDesktop(
  workspace: WorkspacePreferences,
  desktopId: string,
): WorkspacePreferences {
  if (!workspace.archivedDesktops.some((desktop) => desktop.id === desktopId)) return workspace;
  return {
    ...workspace,
    archivedDesktops: workspace.archivedDesktops.filter((desktop) => desktop.id !== desktopId),
  };
}
