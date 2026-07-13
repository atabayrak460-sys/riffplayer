import { Navigate, createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { AlbumsPage } from './pages/AlbumsPage';
import { AlbumDetailPage } from './pages/AlbumDetailPage';
import { ArtistsPage } from './pages/ArtistsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';
import { AllSongsPage } from './pages/AllSongsPage';
import { QueuePage } from './pages/QueuePage';
import { SearchPage } from './pages/SearchPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { RecentPage } from './pages/RecentPage';
import { PlaylistsPage } from './pages/PlaylistsPage';
import { PlaylistDetailPage } from './pages/PlaylistDetailPage';
import { AdminPage } from './pages/admin/AdminPage';
import { UsersPage } from './pages/admin/UsersPage';
import { LibrariesPage } from './pages/admin/LibrariesPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { UserSettingsPage } from './pages/UserSettingsPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { WrappedPage } from './pages/WrappedPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function ProtectedRoute() {
  const credentials = useAuthStore((s) => s.credentials);
  if (!credentials) return <Navigate to="/login" replace />;
  return <Outlet />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/albums" replace /> },
          { path: 'albums', element: <AlbumsPage /> },
          { path: 'albums/:id', element: <AlbumDetailPage /> },
          { path: 'artists', element: <ArtistsPage /> },
          { path: 'artists/:id', element: <ArtistDetailPage /> },
          { path: 'songs', element: <AllSongsPage /> },
          { path: 'queue', element: <QueuePage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'favorites', element: <FavoritesPage /> },
          { path: 'recent', element: <RecentPage /> },
          { path: 'playlists', element: <PlaylistsPage /> },
          { path: 'playlists/:id', element: <PlaylistDetailPage /> },
          { path: 'settings', element: <UserSettingsPage /> },
          { path: 'discover', element: <RecommendationsPage /> },
          { path: 'wrapped', element: <WrappedPage /> },
          {
            path: 'admin',
            element: <AdminPage />,
            children: [
              { index: true, element: <Navigate to="/admin/users" replace /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'libraries', element: <LibrariesPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
