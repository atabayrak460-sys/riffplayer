import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

  const openAt = (e: { clientX: number; clientY: number }, items: ContextMenuItem[]) => {
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
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

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
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onEscape);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const itemButtons = menu.items.map((item, i) => (
    <button
      key={i}
      onClick={() => {
        item.onClick();
        onClose();
      }}
      className={`w-full flex items-center gap-3 text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors ${
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

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose}>
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-0 left-0 right-0 bg-zinc-800 border-t border-zinc-700 rounded-t-2xl py-2 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto my-2" />
          {itemButtons}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={style}
      className="z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[11rem]"
    >
      {itemButtons}
    </div>
  );
}
