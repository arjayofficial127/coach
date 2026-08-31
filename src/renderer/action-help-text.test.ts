import { describe, expect, it } from "vitest";
import { actionHelpText } from "./action-help-text";

function examples(): string[] {
  return [
    actionHelpText.dashboard,
    actionHelpText.navigationDashboard,
    actionHelpText.searchEverything("Ctrl K"),
    actionHelpText.desktopList("Desk 1"),
    actionHelpText.dashboardOverview,
    actionHelpText.browse,
    actionHelpText.canvasPages,
    actionHelpText.runnableApps,
    actionHelpText.savedLinks,
    actionHelpText.readingQueue,
    actionHelpText.settings,
    actionHelpText.profiles,
    actionHelpText.connectObsidian,
    actionHelpText.workspaceMenu,
    actionHelpText.compactNavigation,
    actionHelpText.addDesktop,
    actionHelpText.desktop("Desk 1"),
    actionHelpText.desktopDashboard("Desk 1"),
    actionHelpText.showAllOpenTabs,
    actionHelpText.newDashboardTab,
    actionHelpText.dashboardTabGrid,
    actionHelpText.dashboardTabList,
    actionHelpText.openDashboardTab("New tab"),
    actionHelpText.pinDashboardTab("New tab", false),
    actionHelpText.pinDashboardTab("New tab", true),
    actionHelpText.favoriteDashboardTab("New tab", false),
    actionHelpText.favoriteDashboardTab("New tab", true),
    actionHelpText.moveDashboardTab("New tab"),
    actionHelpText.closeDashboardTab("New tab"),
    actionHelpText.renameDesktop("Desk 1"),
    actionHelpText.archiveDesktop("Desk 1"),
    actionHelpText.addressBar,
    actionHelpText.dashboardCustomization(false),
    actionHelpText.dashboardCustomization(true),
    actionHelpText.newTabSearch,
    actionHelpText.newTabSearchButton,
    actionHelpText.newTabShortcut("Google"),
    actionHelpText.manageNewTabShortcuts,
    actionHelpText.continueNewTabItem("Product strategy roadmap"),
    actionHelpText.viewNewTabHistory,
    actionHelpText.quickAccess("Daily Flow"),
    actionHelpText.quickCaptureNote,
    actionHelpText.captureQuickNote,
    actionHelpText.openQuickCaptureInbox,
    actionHelpText.latticeNoteEditor,
    actionHelpText.searchProvider("Google"),
    actionHelpText.clearSearchHistory,
    actionHelpText.openWebResult("Search Google for test"),
    actionHelpText.openWebsite("YouTube"),
    actionHelpText.revealSearchFile("Project brief.pdf"),
    actionHelpText.saveSearchAsNote("Remember this idea"),
    actionHelpText.commandSearch,
    actionHelpText.dashboardSection("History"),
    actionHelpText.dashboardSectionToggle("History", true),
    actionHelpText.dashboardSectionToggle("History", false),
    actionHelpText.dashboardSectionDrag("History"),
    actionHelpText.closeDashboardCustomization,
  ];
}

describe("curated action help text", () => {
  it("uses plain language instead of implementation terms", () => {
    for (const text of examples()) {
      expect(text).not.toMatch(
        /\b(activate|active tab|IPC|local action|Markdown|reopen|reorder|runtime|section|surface|vault)\b/i,
      );
    }
  });

  it("states an outcome and stays concise", () => {
    for (const text of examples()) {
      expect(text).toMatch(
        /^(Browse|Change|Choose|Close|Connect|Continue|Create|Drag|Find|Go|Hide|Keep|Manage|Move|Open|Remove|Reveal|Save|Search|See|Show|Type|Use)\b/,
      );
      expect(text.length).toBeLessThanOrEqual(120);
    }
  });
});
