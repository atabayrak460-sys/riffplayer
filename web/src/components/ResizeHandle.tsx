import { useEffect, useRef, type RefObject } from 'react';

interface Props {
  /** The panel being resized. Its inline width is written directly during a
   *  drag, so React doesn't re-render the panel's whole subtree per frame. */
  targetRef: RefObject<HTMLElement | null>;
  /** The panel's committed width when the drag starts. */
  width: number;
  min: number;
  max: number;
  /** +1 if dragging right grows the panel (handle on its right edge),
   *  -1 if dragging left grows it (handle on its left edge). */
  direction: 1 | -1;
  /** Called once on pointerup with the final width — the only point the
   *  (persisted) store is written to. */
  onCommit: (width: number) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A thin, draggable vertical divider between a resizable panel and the rest
 * of the layout. Width is computed from the drag's start point (not summed
 * per-event deltas), so it never drifts and never reads a stale width. */
export function ResizeHandle({ targetRef, width, min, max, direction, onCommit }: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    let next = startWidth;
    let frame = 0;

    const onPointerMove = (ev: PointerEvent) => {
      next = clamp(startWidth + direction * (ev.clientX - startX), min, max);
      // Coalesce to at most one layout write per animation frame.
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (targetRef.current) targetRef.current.style.width = `${next}px`;
        });
      }
    };
    const stop = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      if (frame) cancelAnimationFrame(frame);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cleanup.current = null;
    };
    const onPointerUp = () => {
      stop();
      if (targetRef.current) targetRef.current.style.width = `${next}px`;
      if (next !== startWidth) onCommit(next);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    cleanup.current = stop;
    // Set on <body>, not just this element — once the pointer moves fast
    // enough to leave the narrow handle, the cursor would otherwise revert
    // to whatever's underneath mid-drag.
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      className="w-1 flex-shrink-0 cursor-col-resize hover:bg-brand/50 active:bg-brand transition-colors"
    />
  );
}
