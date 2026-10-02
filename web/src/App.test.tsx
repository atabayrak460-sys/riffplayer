// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// App builds its router at import time from window.location, so every test resets the module
// registry, sets the URL, and imports a fresh App. Every page is replaced by a stub that just
// names itself — what is under test here is the route table and the auth guard.
const { page } = vi.hoisted(() => ({
  page: (exportName: string, label: string) => ({
    [exportName]: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const React = require('react');
      return React.createElement('p', null, `page:${label}`);
    },
  }),
}));

vi.mock('./pages/HomePage', () => page('HomePage', 'HomePage'));
vi.mock('./pages/AlbumsPage', () => page('AlbumsPage', 'AlbumsPage'));
vi.mock('./pages/AlbumDetailPage', () => page('AlbumDetailPage', 'AlbumDetailPage'));
vi.mock('./pages/ArtistsPage', () => page('ArtistsPage', 'ArtistsPage'));
vi.mock('./pages/ArtistDetailPage', () => page('ArtistDetailPage', 'ArtistDetailPage'));
vi.mock('./pages/AllSongsPage', () => page('AllSongsPage', 'AllSongsPage'));
vi.mock('./pages/QueuePage', () => page('QueuePage', 'QueuePage'));
vi.mock('./pages/SearchPage', () => page('SearchPage', 'SearchPage'));
vi.mock('./pages/FavoritesPage', () => page('FavoritesPage', 'FavoritesPage'));
vi.mock('./pages/RecentlyPlayedPage', () => page('RecentlyPlayedPage', 'RecentlyPlayedPage'));
vi.mock('./pages/MostPlayedPage', () => page('MostPlayedPage', 'MostPlayedPage'));
vi.mock('./pages/PlaylistsPage', () => page('PlaylistsPage', 'PlaylistsPage'));
vi.mock('./pages/PlaylistDetailPage', () => page('PlaylistDetailPage', 'PlaylistDetailPage'));
vi.mock('./pages/DownloadedPage', () => page('DownloadedPage', 'DownloadedPage'));
vi.mock('./pages/OfflinePlaylistPage', () => page('OfflinePlaylistPage', 'OfflinePlaylistPage'));
vi.mock('./pages/RecommendationsPage', () => page('RecommendationsPage', 'RecommendationsPage'));
vi.mock('./pages/WrappedPage', () => page('WrappedPage', 'WrappedPage'));
vi.mock('./pages/admin/UsersPage', () => page('UsersPage', 'UsersPage'));
vi.mock('./pages/admin/LibrariesPage', () => page('LibrariesPage', 'LibrariesPage'));
vi.mock('./pages/admin/SettingsPage', () => page('SettingsPage', 'SettingsPage'));

vi.mock('./pages/LoginPage', () => page('LoginPage', 'Login'));
vi.mock('./components/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  const React = await import('react');
  return { Layout: () => React.createElement('div', { 'data-testid': 'layout' }, React.createElement(Outlet)) };
});
vi.mock('./pages/UserSettingsPage', async () => {
  const { Outlet } = await import('react-router-dom');
  const React = await import('react');
  return {
    UserSettingsPage: () => React.createElement('div', null, 'page:UserSettings', React.createElement(Outlet)),
    AccountSettingsPanel: () => React.createElement('p', null, 'page:AccountSettings'),
  };
});
vi.mock('./pages/admin/AdminPage', async () => {
  const { Outlet } = await import('react-router-dom');
  const React = await import('react');
  return { AdminPage: () => React.createElement('div', null, 'page:Admin', React.createElement(Outlet)) };
});

async function renderAt(path: string, signedIn: boolean) {
  vi.resetModules();
  window.history.pushState({}, '', path);
  const { useAuthStore } = await import('./store/auth');
  useAuthStore.setState({
    credentials: signedIn ? { serverUrl: 'http://srv', username: 'u', password: 'p' } : null,
  });
  const { App } = await import('./App');
  return render(<App />);
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('App — auth guard', () => {
  it.each(['/albums', '/playlists/3', '/settings/admin/users', '/'])(
    'sends a signed-out visitor from %s to the login page',
    async (path) => {
      await renderAt(path, false);

      expect(await screen.findByText('page:Login')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
      expect(screen.queryByTestId('layout')).not.toBeInTheDocument();
    },
  );

  it('shows the login page itself without the app layout', async () => {
    await renderAt('/login', false);

    expect(await screen.findByText('page:Login')).toBeInTheDocument();
    expect(screen.queryByTestId('layout')).not.toBeInTheDocument();
  });
});

describe('App — signed in', () => {
  it('the root redirects to /albums', async () => {
    await renderAt('/', true);

    expect(await screen.findByText('page:AlbumsPage')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/albums');
  });

  it.each([
    ['/home', 'HomePage'],
    ['/albums', 'AlbumsPage'],
    ['/albums/al-1', 'AlbumDetailPage'],
    ['/artists', 'ArtistsPage'],
    ['/artists/ar-1', 'ArtistDetailPage'],
    ['/songs', 'AllSongsPage'],
    ['/queue', 'QueuePage'],
    ['/search', 'SearchPage'],
    ['/favorites', 'FavoritesPage'],
    ['/recent', 'RecentlyPlayedPage'],
    ['/most-played', 'MostPlayedPage'],
    ['/playlists', 'PlaylistsPage'],
    ['/playlists/p-1', 'PlaylistDetailPage'],
    ['/downloaded', 'DownloadedPage'],
    ['/downloaded/playlists/p-1', 'OfflinePlaylistPage'],
    ['/discover', 'RecommendationsPage'],
    ['/wrapped', 'WrappedPage'],
  ])('%s renders %s inside the app layout', async (path, label) => {
    await renderAt(path, true);

    expect(await screen.findByText(`page:${label}`)).toBeInTheDocument();
    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });

  it('/login still renders the login page (outside the layout) when signed in', async () => {
    await renderAt('/login', true);

    expect(await screen.findByText('page:Login')).toBeInTheDocument();
    expect(screen.queryByTestId('layout')).not.toBeInTheDocument();
  });

  it('/settings shows the account panel inside the settings shell', async () => {
    await renderAt('/settings', true);

    expect(await screen.findByText('page:AccountSettings')).toBeInTheDocument();
    expect(screen.getByText(/page:UserSettings/)).toBeInTheDocument();
  });

  it('/settings/admin redirects to the users tab', async () => {
    await renderAt('/settings/admin', true);

    expect(await screen.findByText('page:UsersPage')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings/admin/users');
  });

  it.each([
    ['/settings/admin/users', 'UsersPage'],
    ['/settings/admin/libraries', 'LibrariesPage'],
    ['/settings/admin/settings', 'SettingsPage'],
  ])('%s renders %s inside the admin shell', async (path, label) => {
    await renderAt(path, true);

    expect(await screen.findByText(`page:${label}`)).toBeInTheDocument();
    expect(screen.getByText(/page:Admin/)).toBeInTheDocument();
  });
});
