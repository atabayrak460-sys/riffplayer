/**
 * Resolves a dnd-kit `DragEndEvent`'s active/over ids into a from/to index
 * pair against the list's current id order — the part of a drag-and-drop
 * reorder handler that's pure logic, not DOM/pointer interaction, so it's
 * unit-testable without mounting DndContext. Used by QueuePage and
 * PlaylistDetailPage.
 *
 * Returns null when there's nothing to do: dropped outside any item,
 * dropped on itself, or either id isn't in the list (shouldn't happen with
 * dnd-kit's own ids, but a stale render mid-mutation is possible).
 */
export function resolveDragReorderIndices(
  ids: string[],
  activeId: string,
  overId: string | undefined,
): { from: number; to: number } | null {
  if (!overId || activeId === overId) return null;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return null;
  return { from, to };
}
