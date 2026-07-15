import { useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
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

/**
 * Right-click (desktop) and long-press (touch) both open the same menu —
 * long-press is the standard mobile equivalent of a context menu, since
 * touch devices have no right-click.
 */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlers = (items: ContextMenuItem[]) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ position: { x: e.clientX, y: e.clientY }, items });
    },
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const x = touch.clientX;
      const y = touch.clientY;
      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        setMenu({ position: { x, y }, items });
      }, LONG_PRESS_MS);
    },
    onTouchEnd: clearLongPress,
    onTouchMove: clearLongPress,
  });

  return { menu, handlers, close: () => setMenu(null) };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onOutside = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  // Keep the menu on-screen near the click/touch point.
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(menu.position.x, window.innerWidth - 200),
    top: Math.min(menu.position.y, window.innerHeight - menu.items.length * 36 - 16),
  };

  return (
    <div
      ref={ref}
      style={style}
      className="z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[10rem]"
    >
      {menu.items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-700 transition-colors ${
            item.danger ? 'text-red-400' : 'text-zinc-200'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
