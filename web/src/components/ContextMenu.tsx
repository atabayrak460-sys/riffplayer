import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiMenuStore } from '../store/uiMenu';
import { useMediaQuery } from '../lib/useMediaQuery';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: string; // SVG path `d` attribute
  danger?: boolean;
}

interface Position {
  x: number;
  y: number;
}

interface MenuState {
  position: Position;
  items: ContextMenuItem[];
}

const LONG_PRESS_MS = 500;
const MOBILE_QUERY = '(max-width: 640px)';

let idCounter = 0;

/**
 * Right-click (desktop) and long-press (touch) both open the same menu —
 * long-press is the standard mobile equivalent of a context menu, since
 * touch devices have no right-click. `openAt` opens the same menu from a
 * regular click (e.g. a "⋯" button).
 *
 * Only one of these menus is ever open at once, app-wide — see store/uiMenu.
 */
export function useContextMenu() {
  const idRef = useRef(`menu-${++idCounter}`);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const activeMenuId = useUiMenuStore((s) => s.activeMenuId);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Another menu opened — close this one.
  useEffect(() => {
    if (menu && activeMenuId !== idRef.current) setMenu(null);
  }, [activeMenuId, menu]);

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openAtPosition = (position: Position, items: ContextMenuItem[]) => {
    useUiMenuStore.getState().openMenu(idRef.current);
    setMenu({ position, items });
  };

  const openAt = (e: React.MouseEvent, items: ContextMenuItem[]) => {
    // A keyboard-activated click (Tab to a "⋯" button, then Enter/Space)
    // fires with clientX/clientY both 0 — there's no real cursor position to
    // anchor to. Anchoring there anyway pins the menu to the screen's
    // top-left corner instead of near the button the user actually
    // activated, so fall back to that button's own position instead.
    if (e.clientX === 0 && e.clientY === 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      openAtPosition({ x: rect.left, y: rect.bottom }, items);
      return;
    }
    openAtPosition({ x: e.clientX, y: e.clientY }, items);
  };

  const handlers = (items: ContextMenuItem[]) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openAt(e, items);
    },
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const x = touch.clientX;
      const y = touch.clientY;
      clearLongPress();
      longPressTimer.current = setTimeout(() => openAtPosition({ x, y }, items), LONG_PRESS_MS);
    },
    onTouchEnd: clearLongPress,
    onTouchMove: clearLongPress,
  });

  const close = () => {
    useUiMenuStore.getState().closeMenu(idRef.current);
    setMenu(null);
  };

  return { menu, handlers, openAt, close };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  // `position: 'fixed'` from the very first render, not just once the real
  // left/top are computed below — now that this is portaled straight onto
  // <body>, an initial style of merely `{ visibility: 'hidden' }` renders as
  // `position: static`, which (unlike fixed/absolute) sizes to fill the
  // available width instead of shrinking to its content. The very first
  // getBoundingClientRect() measurement for a given trigger would then see a
  // near-full-viewport-wide box, making the flip/clamp math below pin the
  // menu to the left margin. Every *re*-open was fine, since by then `style`
  // already held `position: fixed` from the previous open — only the first
  // open of a given menu instance ever hit this.
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', visibility: 'hidden' });

  // Menu opens already focused, like a native context menu — arrow keys can
  // navigate immediately without an extra Tab first.
  useEffect(() => {
    if (menu) itemRefs.current[0]?.focus();
  }, [menu]);

  // Measure the menu after it mounts and flip above/left if it would
  // otherwise overflow the viewport — not used in mobile bottom-sheet mode.
  useLayoutEffect(() => {
    if (!menu || isMobile || !ref.current) return;
    const margin = 8;
    const rect = ref.current.getBoundingClientRect();
    let left = menu.position.x;
    let top = menu.position.y;
    if (left + rect.width > window.innerWidth - margin) left = menu.position.x - rect.width;
    if (top + rect.height > window.innerHeight - margin) top = menu.position.y - rect.height;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    setStyle({ position: 'fixed', left, top, visibility: 'visible' });
  }, [menu, isMobile]);

  useEffect(() => {
    if (!menu) return;
    const onOutside = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const items = itemRefs.current.filter((el): el is HTMLButtonElement => el != null);
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(current + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const itemButtons = menu.items.map((item, i) => (
    <button
      key={i}
      ref={(el) => { itemRefs.current[i] = el; }}
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        item.onClick();
        onClose();
      }}
      className={`w-full flex items-center gap-3 text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors focus:outline-none focus:bg-zinc-700 ${
        item.danger ? 'text-red-400' : 'text-zinc-200'
      }`}
    >
      {item.icon && (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
        </svg>
      )}
      {item.label}
    </button>
  ));

  // Portaled to <body> — callers like SongRow render this inline inside
  // virtualized list rows (react-virtual positions each row with a CSS
  // `transform`), and a `transform` on any ancestor makes it the containing
  // block for `position: fixed` descendants instead of the viewport. Without
  // the portal, the menu's fixed coordinates were resolved against the row's
  // translated box, not the screen — landing in the wrong place depending on
  // which row/scroll offset it opened from and overlapping other rows.
  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose}>
        <div
          ref={ref}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-0 left-0 right-0 bg-zinc-800 border-t border-zinc-700 rounded-t-2xl py-2 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto my-2" />
          {itemButtons}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      role="menu"
      ref={ref}
      style={style}
      className="z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[11rem]"
    >
      {itemButtons}
    </div>,
    document.body,
  );
}
