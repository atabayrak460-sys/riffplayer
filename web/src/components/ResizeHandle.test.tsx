// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeHandle } from './ResizeHandle';

function setup(direction: 1 | -1 = 1, width = 240) {
  const onCommit = vi.fn();
  const targetRef = createRef<HTMLElement>();
  render(
    <>
      <aside ref={targetRef} style={{ width }} />
      <ResizeHandle targetRef={targetRef} width={width} min={200} max={360} direction={direction} onCommit={onCommit} />
    </>,
  );
  return { onCommit, target: () => targetRef.current!, handle: screen.getByRole('separator') };
}

beforeEach(() => {
  // Run rAF callbacks synchronously so mid-drag DOM writes are observable.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('ResizeHandle', () => {
  it('resizes the target live during a drag without committing', () => {
    const { onCommit, target, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(document, { clientX: 130 });
    expect(target().style.width).toBe('270px');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('computes width from the drag start, not from summed deltas', () => {
    const { onCommit, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(document, { clientX: 112 });
    fireEvent.pointerMove(document, { clientX: 150 });
    fireEvent.pointerMove(document, { clientX: 140 });
    fireEvent.pointerUp(document);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(280);
  });

  it('grows the panel when dragging left for a left-edge handle', () => {
    const { onCommit, handle } = setup(-1, 320);
    fireEvent.pointerDown(handle, { clientX: 500 });
    fireEvent.pointerMove(document, { clientX: 470 });
    fireEvent.pointerUp(document);
    expect(onCommit).toHaveBeenCalledWith(350);
  });

  it('clamps to [min, max] and does not drift back after overshooting', () => {
    const { onCommit, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(document, { clientX: 600 }); // way past max
    fireEvent.pointerMove(document, { clientX: 190 }); // back to +90 from start
    fireEvent.pointerUp(document);
    expect(onCommit).toHaveBeenCalledWith(330);
  });

  it('stops tracking after pointerup', () => {
    const { onCommit, target, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(document, { clientX: 110 });
    fireEvent.pointerUp(document);
    fireEvent.pointerMove(document, { clientX: 200 });
    expect(target().style.width).toBe('250px');
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('does not commit a click with no movement', () => {
    const { onCommit, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerUp(document);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
