// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu, useContextMenu, type ContextMenuItem } from './ContextMenu';

function Harness({ items }: { items: ContextMenuItem[] }) {
  const { menu, handlers, close } = useContextMenu();
  return (
    <div>
      <div data-testid="target" {...handlers(items)} />
      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}

// Mirrors the "⋯ More options" button pattern used by SongRow/PlayerBar/
// AlbumDetailPage, which open the menu via `openAt(e, items)` from a button
// `onClick` rather than from `handlers()`'s contextmenu/long-press.
function ButtonTriggerHarness({ items }: { items: ContextMenuItem[] }) {
  const { menu, openAt, close } = useContextMenu();
  return (
    <div>
      <button data-testid="trigger" onClick={(e) => openAt(e, items)} />
      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}

function renderMenu() {
  const onClick1 = vi.fn();
  const onClick2 = vi.fn();
  const onClick3 = vi.fn();
  const items: ContextMenuItem[] = [
    { label: 'First', onClick: onClick1 },
    { label: 'Second', onClick: onClick2 },
    { label: 'Third', onClick: onClick3 },
  ];
  render(<Harness items={items} />);
  fireEvent.contextMenu(screen.getByTestId('target'));
  return { onClick1, onClick2, onClick3 };
}

describe('ContextMenu', () => {
  it('has menu/menuitem roles', () => {
    renderMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('focuses the first item on open', () => {
    renderMenu();
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('ArrowDown moves focus to the next item and wraps at the end', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Second' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('ArrowUp moves focus to the previous item and wraps at the start', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
  });

  it('Home/End jump to the first/last item', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
  });

  it('Escape closes the menu', () => {
    renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('activating a focused item via click runs its onClick and closes the menu', () => {
    const { onClick2 } = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Second' }));
    expect(onClick2).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('portals out of a transformed ancestor (e.g. a virtualized list row), not nested under it', () => {
    // react-virtual positions each row with `transform: translateY(...)`,
    // which makes that row the containing block for any `position: fixed`
    // descendant — so without a portal, the menu's "fixed" coordinates
    // resolve against the row's translated box instead of the viewport,
    // landing in the wrong place depending on which row/scroll offset it
    // opened from. Rendering via a portal to <body> escapes that regardless
    // of what transforms sit between the trigger and the menu.
    const items: ContextMenuItem[] = [{ label: 'Only', onClick: vi.fn() }];
    const { container } = render(
      <div style={{ transform: 'translateY(400px)' }}>
        <Harness items={items} />
      </div>,
    );
    fireEvent.contextMenu(screen.getByTestId('target'));

    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  describe('desktop vs. mobile rendering', () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    function stubMatchMedia(matchesMobileQuery: boolean) {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width') ? matchesMobileQuery : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    }

    it('renders the floating desktop menu (no bottom-sheet drag handle) when the viewport is wide', () => {
      stubMatchMedia(false);
      renderMenu();
      // The mobile bottom-sheet variant renders a drag-handle bar div the
      // desktop variant doesn't; absence of the full-screen backdrop is the
      // clearest signal we're in the desktop branch.
      expect(document.querySelector('.fixed.inset-0.bg-black\\/60')).not.toBeInTheDocument();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('renders the mobile bottom-sheet variant (full-screen backdrop) when the viewport is narrow', () => {
      stubMatchMedia(true);
      renderMenu();
      expect(document.querySelector('.fixed.inset-0.bg-black\\/60')).toBeInTheDocument();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('desktop positioning (flips to stay on-screen)', () => {
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    afterEach(() => {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
    });

    it('flips left and up when opened near the bottom-right corner of a small viewport', () => {
      Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
      // A 150x120 menu, as if it had just rendered off-screen bottom-right.
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.getAttribute('role') === 'menu') {
          return { width: 150, height: 120, top: 0, left: 0, right: 150, bottom: 120, x: 0, y: 0, toJSON() { return this; } } as DOMRect;
        }
        return originalGetBoundingClientRect.call(this);
      };

      const items: ContextMenuItem[] = [{ label: 'Only', onClick: vi.fn() }];
      render(<Harness items={items} />);
      // Open right at the corner — a naive placement would push the menu
      // off both the right and bottom edges of a 400x400 viewport.
      fireEvent.contextMenu(screen.getByTestId('target'), { clientX: 390, clientY: 390 });

      const menu = screen.getByRole('menu') as HTMLElement;
      const left = parseFloat(menu.style.left);
      const top = parseFloat(menu.style.top);
      // Flipped left of the cursor (390 - 150 = 240) and up above it (390 - 120 = 270).
      expect(left).toBeLessThanOrEqual(240);
      expect(top).toBeLessThanOrEqual(270);
      expect(menu.style.visibility).toBe('visible');
    });

    it('anchors to the trigger button instead of the screen corner when opened via keyboard', () => {
      // A keyboard-activated click (Tab to the "⋯" button, then Enter/Space)
      // fires with clientX/clientY both 0 — there's no real cursor position.
      // Naively using that would pin the menu to the top-left corner of the
      // screen regardless of where the button actually is.
      Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.getAttribute('data-testid') === 'trigger') {
          return { width: 20, height: 20, top: 100, left: 300, right: 320, bottom: 120, x: 300, y: 100, toJSON() { return this; } } as DOMRect;
        }
        if (this.getAttribute('role') === 'menu') {
          return { width: 150, height: 120, top: 0, left: 0, right: 150, bottom: 120, x: 0, y: 0, toJSON() { return this; } } as DOMRect;
        }
        return originalGetBoundingClientRect.call(this);
      };

      const items: ContextMenuItem[] = [{ label: 'Only', onClick: vi.fn() }];
      render(<ButtonTriggerHarness items={items} />);
      fireEvent.click(screen.getByTestId('trigger'), { clientX: 0, clientY: 0 });

      const menu = screen.getByRole('menu') as HTMLElement;
      expect(parseFloat(menu.style.left)).toBe(300);
      expect(parseFloat(menu.style.top)).toBe(120);
    });

    it('positions correctly on the very first open of a given menu instance, not just subsequent ones', () => {
      // Before any position is computed, the menu's style starts out as just
      // `{ visibility: 'hidden' }` — with no `position` set, that's
      // `position: static`, which (now that the menu is portaled straight
      // onto <body>) sizes to fill the available width rather than shrinking
      // to its content. A real browser would measure a near-viewport-wide
      // box on that first pass; simulate that here by returning a wide rect
      // whenever the element isn't yet `position: fixed`.
      Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.getAttribute('role') !== 'menu') return originalGetBoundingClientRect.call(this);
        const isFixed = (this as HTMLElement).style.position === 'fixed';
        const width = isFixed ? 150 : 1000;
        return { width, height: 120, top: 0, left: 0, right: width, bottom: 120, x: 0, y: 0, toJSON() { return this; } } as DOMRect;
      };

      const items: ContextMenuItem[] = [{ label: 'Only', onClick: vi.fn() }];
      render(<Harness items={items} />);
      // Click well within the viewport — a correctly-measured 150px-wide
      // menu would never need to flip or clamp from here.
      fireEvent.contextMenu(screen.getByTestId('target'), { clientX: 300, clientY: 300 });

      const menu = screen.getByRole('menu') as HTMLElement;
      expect(parseFloat(menu.style.left)).toBe(300);
      expect(parseFloat(menu.style.top)).toBe(300);
    });
  });
});
