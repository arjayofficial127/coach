export interface DesktopDefinition {
  id: string;
  name: string;
  color: "violet" | "cyan" | "amber" | "rose" | "lime";
}

export interface WorkspacePreferences {
  version: 1;
  activeDesktopId: string;
  desktops: DesktopDefinition[];
}

export const DEFAULT_DESKTOPS: DesktopDefinition[] = [
  { id: "research", name: "Research", color: "violet" },
  { id: "build", name: "Build", color: "cyan" },
  { id: "inspiration", name: "Inspiration", color: "amber" },
];

export const DEFAULT_WORKSPACE: WorkspacePreferences = {
  version: 1,
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
    const candidate = JSON.parse(serialized) as Partial<WorkspacePreferences>;
    if (candidate.version !== 1 || !Array.isArray(candidate.desktops)) return DEFAULT_WORKSPACE;
    const desktops = candidate.desktops
      .filter((desktop): desktop is DesktopDefinition =>
        Boolean(
          desktop &&
            typeof desktop.id === "string" &&
            typeof desktop.name === "string" &&
            desktop.name.trim() &&
            VALID_COLORS.has(desktop.color),
        ),
      )
      .slice(0, 12)
      .map((desktop) => ({ ...desktop, name: desktop.name.trim().slice(0, 40) }));
    if (desktops.length === 0) return DEFAULT_WORKSPACE;
    const activeDesktopId = desktops.some((desktop) => desktop.id === candidate.activeDesktopId)
      ? (candidate.activeDesktopId as string)
      : (desktops[0]?.id ?? DEFAULT_WORKSPACE.activeDesktopId);
    return { version: 1, activeDesktopId, desktops };
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
