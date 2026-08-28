import type { BrowserBounds } from "../../shared/contracts";

export interface ContentSize {
  width: number;
  height: number;
}

export function constrainBrowserBounds(
  requested: BrowserBounds,
  content: ContentSize,
): BrowserBounds {
  const values = [requested.x, requested.y, requested.width, requested.height];
  if (!values.every(Number.isFinite)) {
    throw new Error("Browser bounds must be finite numbers.");
  }

  const contentWidth = Math.max(1, Math.floor(content.width));
  const contentHeight = Math.max(1, Math.floor(content.height));
  const x = Math.min(Math.max(0, Math.floor(requested.x)), contentWidth - 1);
  const y = Math.min(Math.max(0, Math.floor(requested.y)), contentHeight - 1);
  const maxWidth = Math.max(1, contentWidth - x);
  const maxHeight = Math.max(1, contentHeight - y);

  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.floor(requested.width), maxWidth)),
    height: Math.max(1, Math.min(Math.floor(requested.height), maxHeight)),
  };
}
