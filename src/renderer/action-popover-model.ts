export type ActionControlKind =
  | "button"
  | "link"
  | "input"
  | "select"
  | "textarea"
  | "label"
  | "generic";

export interface ActionDescriptionInput {
  explicit?: string | null;
  ariaDescription?: string | null;
  title?: string | null;
  ariaLabel?: string | null;
  text?: string | null;
  placeholder?: string | null;
  kind: ActionControlKind;
}

const actionLead =
  /^(add|apply|archive|browse|cancel|capture|change|choose|clear|close|collapse|connect|continue|create|delete|dismiss|download|drag|edit|enter|expand|find|focus|go|hide|manage|move|open|pause|pin|play|redo|reload|remove|rename|reset|restore|resume|reveal|run|save|search|see|select|send|set|show|start|stop|switch|toggle|turn|type|undo|unpin|update|upload|use|view|zoom)\b/i;

function normalizeText(value?: string | null): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function plainLanguageLabel(value: string): string {
  return value
    .replace(/\bwebsite object URL\b/gi, "website card address")
    .replace(/^Activate\s+/i, "Open ")
    .replace(/^Toggle\s+(.+)$/i, "Turn $1 on or off")
    .replace(/\breorder\b/gi, "change the order of")
    .replace(/\bactive tab\b/gi, "current tab")
    .replace(/\bURL\b/g, "website address")
    .replace(/\bMarkdown\b/gi, "text")
    .replace(/\bLattice Trash\b/gi, "Trash")
    .replace(/\bcanvas object\b/gi, "canvas item")
    .replace(/\bwebsite object\b/gi, "website card")
    .replace(/\blinks object\b/gi, "links card");
}

function describeLabel(label: string, kind: ActionControlKind): string {
  const plainLabel = plainLanguageLabel(label);
  if (actionLead.test(plainLabel)) return sentence(plainLabel);
  if (kind === "link") return sentence(`Open ${plainLabel}`);
  if (kind === "input" || kind === "textarea") return sentence(`Type or edit ${plainLabel}`);
  if (kind === "select") return sentence(`Choose ${plainLabel}`);
  if (kind === "label") return sentence(`Choose ${plainLabel}`);
  return sentence(`Open ${plainLabel}`);
}

export function actionDescription(input: ActionDescriptionInput): string {
  const explicit = normalizeText(input.explicit);
  if (explicit) return sentence(explicit);

  const labelledDescription = normalizeText(input.ariaDescription);
  if (labelledDescription) return sentence(labelledDescription);

  const title = normalizeText(input.title);
  if (title) return describeLabel(title, input.kind);

  const ariaLabel = normalizeText(input.ariaLabel);
  if (ariaLabel) return describeLabel(ariaLabel, input.kind);

  const text = normalizeText(input.text);
  if (text) return describeLabel(text, input.kind);

  const placeholder = normalizeText(input.placeholder);
  if (placeholder) return describeLabel(placeholder, input.kind);

  if (input.kind === "link") return "Open this link.";
  if (input.kind === "input" || input.kind === "textarea") return "Type or edit this field.";
  if (input.kind === "select") return "Choose an option.";
  if (input.kind === "label") return "Choose this field.";
  if (input.kind === "button") return "Use this button.";
  return "Use this item.";
}
