import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NowPlayingPanel } from './NowPlayingPanel';
import { PlayerBar } from './PlayerBar';
import { DownloadTargetModal } from './DownloadTargetModal';
import { Toast } from './Toast';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { ErrorBoundary } from './ErrorBoundary';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import { handleKeyboardShortcut } from '../lib/keyboard';

export function Layout() {
  const hydrateDownloads = useDownloadsStore((s) => s.hydrate);
  const location = useLocation();
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Read live state at call time (not via a hook) so this listener
      // never needs re-subscribing as playback state changes every second.
      const s = usePlayerStore.getState();
      const handled = handleKeyboardShortcut(e, {
        currentTime: s.currentTime,
        duration: s.duration,
        volume: s.volume,
        togglePlay: s.togglePlay,
        seek: s.seek,
        setVolume: s.setVolume,
        next: s.next,
        prev: s.prev,
        toggleShuffle: s.toggleShuffle,
        toggleRepeat: s.toggleRepeat,
        toggleMute: s.toggleMute,
        toggleShortcutsHelp: () => setShowShortcutsHelp((v) => !v),
      });
      if (handled) e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

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
      <Toast />
      {showShortcutsHelp && <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}
    </div>
  );
}
