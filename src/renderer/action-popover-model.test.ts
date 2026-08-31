import { describe, expect, it } from "vitest";
import { actionDescription } from "./action-popover-model";

describe("action popover descriptions", () => {
  it("prefers an explicit explanation of the outcome", () => {
    expect(
      actionDescription({
        kind: "button",
        explicit: "Collapse the sidebar and use compact navigation",
        ariaLabel: "Use compact navigation",
      }),
    ).toBe("Collapse the sidebar and use compact navigation.");
  });

  it("turns accessible labels into action sentences", () => {
    expect(actionDescription({ kind: "button", ariaLabel: "Rename Desk 2" })).toBe(
      "Rename Desk 2.",
    );
    expect(actionDescription({ kind: "button", text: "Settings & appearance" })).toBe(
      "Open Settings & appearance.",
    );
    expect(actionDescription({ kind: "generic", title: "Drag to reorder tabs" })).toBe(
      "Drag to change the order of tabs.",
    );
    expect(actionDescription({ kind: "button", ariaLabel: "Toggle focus view" })).toBe(
      "Turn focus view on or off.",
    );
    expect(actionDescription({ kind: "input", ariaLabel: "Website object URL" })).toBe(
      "Type or edit website card address.",
    );
    expect(actionDescription({ kind: "textarea", ariaLabel: "Canvas note Markdown" })).toBe(
      "Type or edit Canvas note text.",
    );
  });

  it("describes fields and supplies a non-empty fallback for unlabelled controls", () => {
    expect(actionDescription({ kind: "input", ariaLabel: "Canvas page title" })).toBe(
      "Type or edit Canvas page title.",
    );
    expect(actionDescription({ kind: "button" })).toBe("Use this button.");
  });
});
