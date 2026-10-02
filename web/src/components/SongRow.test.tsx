// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongRow } from './SongRow';
import { useAuthStore } from '../store/auth';
import * as subsonic from '../api/subsonic';
import type { Song } from '../api/types';

const song: Song = {
  id: 't-1', title: 'Test Song', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1',
  created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3', duration: 200,
};

function renderRow() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SongRow song={song} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByTitle('More options'));
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 1, username: 'admin', role: 'admin' } });
});

describe('SongRow — admin delete', () => {
  it('shows "Delete song" to an admin', () => {
    renderRow();
    openMenu();
    expect(screen.getByText('Delete song')).toBeInTheDocument();
  });

  it('does not show "Delete song" to a regular user', () => {
    useAuthStore.setState({ user: { id: 2, username: 'bob', role: 'user' } });
    renderRow();
    openMenu();
    expect(screen.queryByText('Delete song')).not.toBeInTheDocument();
  });

  it('asks for confirmation and does not call the API if declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteSpy = vi.spyOn(subsonic, 'adminDeleteTrack');
    renderRow();
    openMenu();

    fireEvent.click(screen.getByText('Delete song'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Test Song'));
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('deletes the track when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteSpy = vi.spyOn(subsonic, 'adminDeleteTrack').mockResolvedValue(undefined);
    renderRow();
    openMenu();

    fireEvent.click(screen.getByText('Delete song'));

    expect(deleteSpy).toHaveBeenCalledWith('t-1');
  });
});
