// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SongInfoDialog } from './SongInfoDialog';
import type { Song } from '../api/types';

const song: Song = {
  id: 't-1', title: 'Test Song', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1',
  created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3', duration: 200,
};

describe('SongInfoDialog', () => {
  it('renders as an accessible dialog with the song details', () => {
    render(<SongInfoDialog song={song} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Song info' })).toBeInTheDocument();
    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });
});
