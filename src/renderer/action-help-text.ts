export const actionHelpText = {
  dashboard: "Go to your dashboard",
  searchEverything: (shortcut: string) =>
    `Find a tab, desktop, saved link, or webpage. Keyboard shortcut: ${shortcut}`,
  desktopList: (name: string) => `Open the desktop list. You are currently in ${name}`,
  dashboardOverview: "See an overview of this desktop and continue where you left off",
  browse: "Browse the web or type a website address",
  canvasPages: "Open your visual notes and connected pages",
  runnableApps: "Open Daily Flow, Pomodoro, Wealth Lab, and your other tools",
  savedLinks: "See webpages you have saved",
  readingQueue: "See webpages you want to read later",
  settings: "Change how Coach Browser looks and works",
  profiles: "Choose a browsing profile or change its privacy settings",
  workspaceMenu: "Manage your profiles, desktops, tabs, and settings",
  compactNavigation: "Hide the full sidebar and use the smaller icon menu",
  addDesktop: "Create a separate space for another group of tabs and saved links",
  desktop: (name: string) => `Go to ${name} and continue where you left off`,
  renameDesktop: (name: string) => `Change the name of ${name}`,
  archiveDesktop: (name: string) =>
    `Move ${name} out of the sidebar without deleting its saved information`,
  addressBar: "Type a website address or search term, then press Enter",
  dashboardCustomization: (open: boolean) =>
    open ? "Close dashboard customization" : "Choose what appears on your dashboard",
  newTabSearch: "Type a website address or search term, then press Enter or choose Search",
  commandSearch: "Type to find a tab, desktop, saved link, app command, or webpage",
  dashboardSection: (name: string) => `Show ${name} on the dashboard`,
  dashboardSectionToggle: (name: string, shown: boolean) =>
    shown ? `Hide ${name} from the dashboard` : `Show ${name} on the dashboard`,
  dashboardSectionDrag: (name: string) => `Drag ${name} to move it on the dashboard`,
  closeDashboardCustomization: "Close dashboard customization",
} as const;
