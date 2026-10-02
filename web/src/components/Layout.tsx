import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';
import { MobileNavDrawer } from './MobileNavDrawer';
import { NowPlayingPanel } from './NowPlayingPanel';
import { PlayerBar } from './PlayerBar';
import { DownloadTargetModal } from './DownloadTargetModal';
import { Toast } from './Toast';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { ErrorBoundary } from './ErrorBoundary';
import { useDownloadsStore } from '../store/downloads';
import { useGlobalShortcuts } from '../lib/useGlobalShortcuts';

export function Layout() {
  const hydrateDownloads = useDownloadsStore((s) => s.hydrate);
  const location = useLocation();
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  useGlobalShortcuts(setShowShortcutsHelp);

  useEffect(() => {
    hydrateDownloads();
  }, [hydrateDownloads]);

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <MobileTopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
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
      <MobileNavDrawer />
      <PlayerBar />
      <DownloadTargetModal />
      <Toast />
      {showShortcutsHelp && <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}
    </div>
  );
}
