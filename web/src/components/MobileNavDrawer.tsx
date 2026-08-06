import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMobileNavStore } from '../store/mobileNav';
import { Sidebar } from './Sidebar';

/**
 * Mobile-only (#22) slide-in drawer wrapping the exact same <Sidebar> used
 * on desktop, unmodified — reuses its full nav/library/settings content
 * rather than inventing a condensed mobile IA (that's #27's job, and it's
 * not scoped yet). Closes automatically on navigation, so callers never
 * need to wire an onClick through every link inside Sidebar.
 */
export function MobileNavDrawer() {
  const isOpen = useMobileNavStore((s) => s.isOpen);
  const close = useMobileNavStore((s) => s.close);
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    close();
  }, [location.pathname, close]);

  return (
    <div
      className={`md:hidden fixed inset-0 z-40 ${isOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      <div
        className={`absolute inset-y-0 left-0 w-60 max-w-[85vw] transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>
    </div>
  );
}
