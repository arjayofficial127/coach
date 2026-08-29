export const DEFAULT_ZOOM_PERCENT = 100;
export const MIN_ZOOM_PERCENT = 50;
export const MAX_ZOOM_PERCENT = 200;
export const KEYBOARD_ZOOM_STEP = 10;
export const FINE_ZOOM_STEP = 5;

export type ZoomCommand = "zoom-in" | "zoom-out" | "zoom-reset";

export interface ZoomShortcutInput {
  key: string;
  code?: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
}

export function clampZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM_PERCENT;
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(value)));
}

export function nextZoomPercent(
  current: number,
  command: ZoomCommand,
  step = KEYBOARD_ZOOM_STEP,
): number {
  if (command === "zoom-reset") return DEFAULT_ZOOM_PERCENT;
  return clampZoomPercent(current + (command === "zoom-in" ? step : -step));
}

export function zoomCommandForShortcut(input: ZoomShortcutInput): ZoomCommand | null {
  if ((!input.control && !input.meta) || input.alt) return null;

  const key = input.key.toLowerCase();
  const code = input.code?.toLowerCase() ?? "";
  if (key === "+" || key === "=" || code === "equal" || code === "numpadadd") {
    return "zoom-in";
  }
  if (key === "-" || code === "minus" || code === "numpadsubtract") return "zoom-out";
  if (key === "0" || code === "digit0" || code === "numpad0") return "zoom-reset";
  return null;
}
