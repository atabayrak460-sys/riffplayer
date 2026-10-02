// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { useLyricsViewStore } from '../store/lyrics';

// Layout's job here is composition + the lyrics open/close wiring; the
// heavyweight neighbours have their own tests and need a QueryClient, player
// and audio element, so stub them.
vi.mock('./Sidebar', () => ({ Sidebar: () => <nav>sidebar</nav> }));
vi.mock('./MobileTopBar', () => ({ MobileTopBar: () => null }));
vi.mock('./MobileNavDrawer', () => ({ MobileNavDrawer: () => null }));
vi.mock('./NowPlayingPanel', () => ({ NowPlayingPanel: () => <aside>now playing</aside> }));
vi.mock('./PlayerBar', () => ({ PlayerBar: () => <footer>player bar</footer> }));
vi.mock('./DownloadTargetModal', () => ({ DownloadTargetModal: () => null }));
vi.mock('./Toast', () => ({ Toast: () => null }));
vi.mock('./KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));
// hydrate() opens IndexedDB, which jsdom doesn't have; the store has its own tests.
vi.mock('../store/downloads', () => ({
  useDownloadsStore: (select: (s: { hydrate: () => void }) => unknown) => select({ hydrate: () => {} }),
}));
// Connect opens a network stream; Layout's job is only to start it on mount and stop it on unmount.
const { connectStart, connectStop } = vi.hoisted(() => ({ connectStart: vi.fn(), connectStop: vi.fn() }));
vi.mock('../store/connect', () => ({
  useConnectStore: (select: (s: { start: () => void; stop: () => void }) => unknown) =>
    select({ start: connectStart, stop: connectStop }),
}));
vi.mock('../lib/useGlobalShortcuts', () => ({ useGlobalShortcuts: () => {} }));
vi.mock('./LyricsPanel', () => ({
  LyricsPanel: ({ onClose }: { onClose: () => void }) => (
    <div>
      lyrics view
      <button onClick={onClose}>close lyrics</button>
    </div>
  ),
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Link to="/albums">go to albums</Link>} />
          <Route path="/albums" element={<p>albums page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useLyricsViewStore.setState({ open: false });
  connectStart.mockClear();
  connectStop.mockClear();
});

describe('Layout', () => {
  it('connects this device to the user\'s others while the app is open, and disconnects on the way out', () => {
    const { unmount } = renderLayout();
    expect(connectStart).toHaveBeenCalledTimes(1);
    expect(connectStop).not.toHaveBeenCalled();

    unmount();

    expect(connectStop).toHaveBeenCalledTimes(1);
  });

  it('keeps sidebar, now playing panel and player bar around the routed page', () => {
    renderLayout();

    expect(screen.getByText('sidebar')).toBeInTheDocument();
    expect(screen.getByText('now playing')).toBeInTheDocument();
    expect(screen.getByText('player bar')).toBeInTheDocument();
    expect(screen.getByText('go to albums')).toBeInTheDocument();
  });

  it('shows the lyrics view only while the store says it is open', () => {
    renderLayout();
    expect(screen.queryByText('lyrics view')).not.toBeInTheDocument();

    act(() => useLyricsViewStore.getState().toggle());
    expect(screen.getByText('lyrics view')).toBeInTheDocument();
    // the page underneath stays mounted, the lyrics only cover it
    expect(screen.getByText('go to albums')).toBeInTheDocument();
  });

  it('closes the lyrics through the panel\'s onClose', async () => {
    renderLayout();
    act(() => useLyricsViewStore.getState().toggle());

    await userEvent.click(screen.getByText('close lyrics'));

    expect(useLyricsViewStore.getState().open).toBe(false);
    expect(screen.queryByText('lyrics view')).not.toBeInTheDocument();
  });

  it('closes the lyrics when navigating to another page', async () => {
    renderLayout();
    act(() => useLyricsViewStore.getState().toggle());
    expect(screen.getByText('lyrics view')).toBeInTheDocument();

    await userEvent.click(screen.getByText('go to albums'));

    expect(screen.getByText('albums page')).toBeInTheDocument();
    expect(screen.queryByText('lyrics view')).not.toBeInTheDocument();
    expect(useLyricsViewStore.getState().open).toBe(false);
  });
});
