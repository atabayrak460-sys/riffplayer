import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NowPlayingPanel } from './NowPlayingPanel';
import { PlayerBar } from './PlayerBar';
import { DownloadTargetModal } from './DownloadTargetModal';
import { ErrorBoundary } from './ErrorBoundary';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import { isTypingTarget } from '../lib/keyboard';

export function Layout() {
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const hydrateDownloads = useDownloadsStore((s) => s.hydrate);
  const location = useLocation();

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

  useEffect(() => {
    hydrateDownloads();
  }, [hydrateDownloads]);

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {/* Keyed on the route so navigating to a new page resets a
              previously-tripped boundary instead of leaving the fallback
              stuck forever — sidebar/player bar stay usable either way. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<div className="p-6 text-zinc-400 text-sm">Loading…</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <NowPlayingPanel />
      </div>
      <PlayerBar />
      <DownloadTargetModal />
    </div>
  );
}
