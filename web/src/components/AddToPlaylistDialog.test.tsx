// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import * as subsonic from '../api/subsonic';

beforeEach(() => {
  vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([
    { id: 'p-1', name: 'My Playlist', owner: 'admin', songCount: 0, duration: 0, public: false, created: '2024-01-01', changed: '2024-01-01' },
  ]);
});

function renderDialog() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AddToPlaylistDialog songId="t-1" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('AddToPlaylistDialog', () => {
  it('renders as an accessible dialog listing playlists', async () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Add to playlist' })).toBeInTheDocument();
    expect(await screen.findByText('My Playlist')).toBeInTheDocument();
  });
});
