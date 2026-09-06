export type TabDropPlacement = "before" | "after";

/**
 * Moves one tab so it sits before or after another tab, leaving every other tab in place.
 * Unknown ids leave the order untouched rather than inventing a position.
 */
export function moveTabInOrder(
  order: readonly string[],
  draggedId: string,
  targetId: string,
  placement: TabDropPlacement,
): string[] {
  if (draggedId === targetId) return [...order];
  if (!order.includes(draggedId) || !order.includes(targetId)) return [...order];

  const remaining = order.filter((id) => id !== draggedId);
  const targetIndex = remaining.indexOf(targetId);
  const insertAt = placement === "before" ? targetIndex : targetIndex + 1;
  remaining.splice(insertAt, 0, draggedId);
  return remaining;
}

/**
 * Applies a requested order to the tabs it names while every unnamed tab keeps its own slot.
 * The renderer only ever reorders the visible desktop, so tabs on other desktops must not move.
 */
export function applyRequestedTabOrder(
  currentOrder: readonly string[],
  requestedOrder: readonly string[],
): string[] {
  const current = new Set(currentOrder);
  const requested: string[] = [];
  const moving = new Set<string>();

  for (const id of requestedOrder) {
    if (!current.has(id) || moving.has(id)) continue;
    moving.add(id);
    requested.push(id);
  }

  const next = [...currentOrder];
  let cursor = 0;
  for (const [index, id] of next.entries()) {
    if (!moving.has(id)) continue;
    const replacement = requested[cursor++];
    if (replacement) next[index] = replacement;
  }
  return next;
}
