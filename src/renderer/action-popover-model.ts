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
  /^(add|apply|archive|cancel|capture|change|choose|clear|close|collapse|connect|continue|create|delete|dismiss|download|edit|enter|expand|focus|go|hide|move|open|pause|pin|play|redo|reload|remove|rename|reset|restore|resume|reveal|run|save|search|select|send|set|show|start|stop|switch|toggle|undo|unpin|update|upload|use|view|zoom)\b/i;

function normalizeText(value?: string | null): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function describeLabel(label: string, kind: ActionControlKind): string {
  if (actionLead.test(label)) return sentence(label);
  if (kind === "link") return sentence(`Open ${label}`);
  if (kind === "input" || kind === "textarea") return sentence(`Edit ${label}`);
  if (kind === "select") return sentence(`Choose ${label}`);
  if (kind === "label") return sentence(`Focus ${label}`);
  return sentence(`Activate ${label}`);
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
  if (input.kind === "input" || input.kind === "textarea") return "Edit this field.";
  if (input.kind === "select") return "Choose an option.";
  if (input.kind === "label") return "Focus this field.";
  return "Use this action.";
}
