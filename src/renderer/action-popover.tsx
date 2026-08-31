import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ActionControlKind,
  type ActionDescriptionInput,
  actionDescription,
} from "./action-popover-model";
import "./action-popover.css";

const ACTION_SELECTOR = [
  "[data-action-description]",
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "label",
  "summary",
  "[draggable='true']",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const TOOLTIP_ID = "coach-action-popover";
const HOVER_DELAY_MS = 280;

type Placement = "top" | "right" | "bottom" | "left";

function placementOverride(element: HTMLElement): Placement | null {
  const value = element.dataset.actionPopoverPlacement;
  return value === "top" || value === "right" || value === "bottom" || value === "left"
    ? value
    : null;
}

interface PopoverTarget {
  element: HTMLElement;
  description: string;
}

interface PopoverPosition {
  left: number;
  top: number;
  placement: Placement;
  ready: boolean;
}

function controlKind(element: HTMLElement): ActionControlKind {
  if (element instanceof HTMLAnchorElement || element.getAttribute("role") === "link")
    return "link";
  if (element instanceof HTMLInputElement) return "input";
  if (element instanceof HTMLSelectElement) return "select";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLLabelElement) return "label";
  if (element instanceof HTMLButtonElement || element.getAttribute("role") === "button") {
    return "button";
  }
  return "generic";
}

function actionTarget(start: EventTarget | null): HTMLElement | null {
  if (!(start instanceof Element)) return null;
  const target = start.closest(ACTION_SELECTOR);
  if (!(target instanceof HTMLElement) || target.closest(".action-popover")) return null;
  return target;
}

function inputForLabel(element: HTMLElement): HTMLElement {
  if (element instanceof HTMLLabelElement && element.control instanceof HTMLElement) {
    return element.control;
  }
  return element;
}

function descriptionForElement(element: HTMLElement): string {
  const labelledElement = inputForLabel(element);
  const input: ActionDescriptionInput = {
    kind: controlKind(element),
    explicit:
      element.dataset.actionDescription ?? labelledElement.dataset.actionDescription ?? null,
    ariaDescription:
      element.getAttribute("aria-description") ??
      labelledElement.getAttribute("aria-description") ??
      null,
    title: element.getAttribute("title") ?? labelledElement.getAttribute("title") ?? null,
    ariaLabel:
      element.getAttribute("aria-label") ?? labelledElement.getAttribute("aria-label") ?? null,
    text: element instanceof HTMLInputElement ? null : element.textContent,
    placeholder:
      labelledElement instanceof HTMLInputElement || labelledElement instanceof HTMLTextAreaElement
        ? labelledElement.placeholder
        : null,
  };
  return actionDescription(input);
}

function positionCandidate(
  placement: Placement,
  target: DOMRect,
  popover: DOMRect,
  gap: number,
): { left: number; top: number } {
  if (placement === "right") {
    return { left: target.right + gap, top: target.top + (target.height - popover.height) / 2 };
  }
  if (placement === "left") {
    return {
      left: target.left - popover.width - gap,
      top: target.top + (target.height - popover.height) / 2,
    };
  }
  if (placement === "top") {
    return {
      left: target.left + (target.width - popover.width) / 2,
      top: target.top - popover.height - gap,
    };
  }
  return { left: target.left + (target.width - popover.width) / 2, top: target.bottom + gap };
}

export function ActionPopover() {
  const [target, setTarget] = useState<PopoverTarget | null>(null);
  const [position, setPosition] = useState<PopoverPosition>({
    left: 0,
    top: 0,
    placement: "right",
    ready: false,
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const suppressedTitleRef = useRef<{ element: HTMLElement; title: string } | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    };
    const restoreTitle = () => {
      const suppressed = suppressedTitleRef.current;
      if (suppressed?.element.isConnected && !suppressed.element.hasAttribute("title")) {
        suppressed.element.setAttribute("title", suppressed.title);
      }
      suppressedTitleRef.current = null;
    };
    const suppressTitle = (element: HTMLElement) => {
      restoreTitle();
      const title = element.getAttribute("title");
      if (!title) return;
      suppressedTitleRef.current = { element, title };
      element.removeAttribute("title");
    };
    const hide = () => {
      clearTimer();
      restoreTitle();
      currentTargetRef.current = null;
      setTarget(null);
    };
    const reveal = (element: HTMLElement, immediate: boolean) => {
      if (currentTargetRef.current === element) return;
      clearTimer();
      currentTargetRef.current = element;
      const description = descriptionForElement(element);
      suppressTitle(element);
      const show = () => {
        if (currentTargetRef.current !== element || !element.isConnected) return;
        setPosition((current) => ({ ...current, ready: false }));
        setTarget({ element, description });
      };
      if (immediate) show();
      else revealTimerRef.current = window.setTimeout(show, HOVER_DELAY_MS);
    };
    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const element = actionTarget(event.target);
      if (element) reveal(element, false);
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const from = actionTarget(event.target);
      const to = actionTarget(event.relatedTarget);
      if (from && from === to) return;
      if (to) reveal(to, false);
      else hide();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const element = actionTarget(event.target);
      if (element) reveal(element, true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const to = actionTarget(event.relatedTarget);
      if (to) reveal(to, true);
      else hide();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimer();
      restoreTitle();
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const previous = target.element.getAttribute("aria-describedby");
    const ids = new Set((previous ?? "").split(/\s+/).filter(Boolean));
    ids.add(TOOLTIP_ID);
    target.element.setAttribute("aria-describedby", [...ids].join(" "));
    return () => {
      if (!target.element.isConnected) return;
      if (previous) target.element.setAttribute("aria-describedby", previous);
      else target.element.removeAttribute("aria-describedby");
    };
  }, [target]);

  useLayoutEffect(() => {
    if (!target) return;
    const updatePosition = () => {
      const popover = popoverRef.current;
      if (!popover || !target.element.isConnected) return;
      if (!popover.matches(":popover-open")) popover.showPopover();
      const targetBounds = target.element.getBoundingClientRect();
      const popoverBounds = popover.getBoundingClientRect();
      const margin = 10;
      const gap = 11;
      const defaultPreferred: Placement[] =
        targetBounds.right < window.innerWidth * 0.48
          ? ["right", "bottom", "top", "left"]
          : ["bottom", "top", "left", "right"];
      const requestedPlacement = placementOverride(target.element);
      const preferred: Placement[] = requestedPlacement
        ? [
            requestedPlacement,
            ...defaultPreferred.filter((option) => option !== requestedPlacement),
          ]
        : defaultPreferred;
      let placement: Placement = preferred[0] ?? "right";
      let candidate = positionCandidate(placement, targetBounds, popoverBounds, gap);
      for (const option of preferred) {
        const next = positionCandidate(option, targetBounds, popoverBounds, gap);
        const fits =
          next.left >= margin &&
          next.top >= margin &&
          next.left + popoverBounds.width <= window.innerWidth - margin &&
          next.top + popoverBounds.height <= window.innerHeight - margin;
        if (!fits) continue;
        placement = option;
        candidate = next;
        break;
      }
      setPosition({
        left: Math.min(
          Math.max(candidate.left, margin),
          window.innerWidth - popoverBounds.width - margin,
        ),
        top: Math.min(
          Math.max(candidate.top, margin),
          window.innerHeight - popoverBounds.height - margin,
        ),
        placement,
        ready: true,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [target]);

  if (!target || typeof document === "undefined") return null;
  const style = {
    left: position.left,
    top: position.top,
    visibility: position.ready ? "visible" : "hidden",
  } satisfies CSSProperties;
  return createPortal(
    <div
      ref={popoverRef}
      id={TOOLTIP_ID}
      className="action-popover"
      data-placement={position.placement}
      popover="manual"
      role="tooltip"
      style={style}
    >
      <span className="action-popover-kicker">Action</span>
      <span className="action-popover-description">{target.description}</span>
    </div>,
    document.body,
  );
}
