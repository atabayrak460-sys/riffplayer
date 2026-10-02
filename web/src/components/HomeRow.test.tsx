// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeRow } from './HomeRow';

// The right-edge fade (a `mask-image` gradient with calc()) is not asserted here: jsdom's CSS
// parser rejects that value, so it never reaches the DOM. What is verified is everything the
// fade depends on — measuring on mount, re-measuring when the row resizes, and cleaning up.
let observerCallback: (() => void) | undefined;
let observed: Element | undefined;
const disconnect = vi.fn();
const reads = vi.fn();

beforeEach(() => {
  observerCallback = undefined;
  observed = undefined;
  disconnect.mockClear();
  reads.mockClear();
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: () => void) { observerCallback = cb; }
    observe(el: Element) { observed = el; }
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => { reads(); return 100; });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 100);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const scroller = () => screen.getByText('card').parentElement as HTMLElement;

function renderRow(viewAllTo?: string) {
  return render(
    <MemoryRouter>
      <HomeRow title="Recently added" viewAllTo={viewAllTo}>
        <span>card</span>
      </HomeRow>
    </MemoryRouter>,
  );
}

describe('HomeRow', () => {
  it('shows the title and its children in a horizontally scrolling row', () => {
    renderRow();

    expect(screen.getByRole('heading', { name: 'Recently added' })).toBeInTheDocument();
    expect(scroller()).toHaveClass('overflow-x-auto');
  });

  it('links "See all" only when a destination is given', () => {
    const { unmount } = renderRow('/albums');
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/albums');
    unmount();

    renderRow();
    expect(screen.queryByRole('link', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('measures the row on mount and watches that same element for resizes', () => {
    renderRow();

    expect(reads).toHaveBeenCalledTimes(1);
    expect(observed).toBe(scroller());
  });

  it('measures again each time the row is resized', () => {
    renderRow();

    act(() => observerCallback!());
    act(() => observerCallback!());

    expect(reads).toHaveBeenCalledTimes(3);
  });

  it('stops observing on unmount', () => {
    const { unmount } = renderRow();
    expect(disconnect).not.toHaveBeenCalled();

    unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
