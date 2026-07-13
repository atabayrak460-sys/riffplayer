import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import { usePlayerStore } from '../store/player';
import { isTypingTarget } from '../lib/keyboard';

export function Layout() {
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      togglePlay();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [togglePlay]);

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <PlayerBar />
    </div>
  );
}
