// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DownloadTargetModal } from './DownloadTargetModal';
import { useDownloadsStore } from '../store/downloads';

const song = {
  id: 't-1', title: 'Test Song', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1',
  created: '2024-01-01', isVideo: false, type: 'music' as const, suffix: 'mp3',
};

beforeEach(() => {
  useDownloadsStore.setState({ pendingRequest: { kind: 'track', song } });
});

describe('DownloadTargetModal', () => {
  it('renders as an accessible dialog when a download request is pending', () => {
    render(<DownloadTargetModal />);
    expect(screen.getByRole('dialog', { name: 'Download to…' })).toBeInTheDocument();
    expect(screen.getByText('In Cadence')).toBeInTheDocument();
    expect(screen.getByText('To this device')).toBeInTheDocument();
  });

  it('renders nothing when there is no pending request', () => {
    useDownloadsStore.setState({ pendingRequest: null });
    render(<DownloadTargetModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
