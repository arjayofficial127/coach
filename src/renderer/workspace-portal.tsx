import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function WorkspacePortal({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return target ? createPortal(<div className="ws-portal">{children}</div>, target) : children;
}
