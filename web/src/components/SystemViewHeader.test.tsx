// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemViewHeader } from './SystemViewHeader';
import * as subsonic from '../api/subsonic';

vi.mock('./CoverUploadControl', () => ({
  CoverUploadControl: (p: {
    coverId?: string; hasCover: boolean; error?: string | null;
    onUpload: (f: File) => void; onRemove: () => void;
  }) => (
    <div>
      <span>{p.hasCover ? `cover:${p.coverId}` : 'stock cover'}</span>
      <button onClick={() => p.onUpload(new File(['x'], 'c.png'))}>upload cover</button>
      <button onClick={p.onRemove}>remove cover</button>
      {p.error && <span>{p.error}</span>}
    </div>
  ),
}));

const Stock = () => <svg />;

function renderHeader(meta?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemViewHeader
        viewKey="favorites"
        title="Favourites"
        defaultDescription="Your starred things"
        StockCover={Stock}
        meta={meta}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'getSystemViewSettings').mockResolvedValue({ hasCover: false, description: '' } as never);
  vi.spyOn(subsonic, 'setSystemViewDescription').mockResolvedValue(undefined as never);
  vi.spyOn(subsonic, 'uploadSystemViewCover').mockResolvedValue(undefined as never);
  vi.spyOn(subsonic, 'removeSystemViewCover').mockResolvedValue(undefined as never);
});

describe('SystemViewHeader', () => {
  it('shows the title, the meta line and the default description', async () => {
    renderHeader('3 songs starred');

    expect(screen.getByRole('heading', { name: 'Favourites' })).toBeInTheDocument();
    expect(screen.getByText('3 songs starred')).toBeInTheDocument();
    expect(await screen.findByText('Your starred things')).toBeInTheDocument();
    expect(subsonic.getSystemViewSettings).toHaveBeenCalledWith('favorites');
  });

  it('renders no meta line when meta is false/undefined', () => {
    renderHeader(false);
    expect(screen.queryByText(/starred$/)).not.toBeInTheDocument();
  });

  it('a custom description replaces the default one', async () => {
    vi.spyOn(subsonic, 'getSystemViewSettings').mockResolvedValue({ hasCover: false, description: 'My faves' } as never);
    renderHeader();

    expect(await screen.findByText('My faves')).toBeInTheDocument();
    expect(screen.queryByText('Your starred things')).not.toBeInTheDocument();
  });

  it('uses the stock cover until a custom cover exists, then sv-<key>', async () => {
    renderHeader();
    expect(await screen.findByText('stock cover')).toBeInTheDocument();
  });

  it('points at the uploaded cover as sv-favorites', async () => {
    vi.spyOn(subsonic, 'getSystemViewSettings').mockResolvedValue({ hasCover: true, description: '' } as never);
    renderHeader();

    expect(await screen.findByText('cover:sv-favorites')).toBeInTheDocument();
  });

  it('editing starts empty when only the default is showing; Save stores the new text', async () => {
    renderHeader();
    await userEvent.click(await screen.findByTitle('Click to edit description'));
    const box = screen.getByPlaceholderText('Your starred things');
    expect(box).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();

    await userEvent.type(box, 'Only the best');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(subsonic.setSystemViewDescription).toHaveBeenCalledWith('favorites', 'Only the best'));
    await waitFor(() => expect(screen.queryByPlaceholderText('Your starred things')).not.toBeInTheDocument());
  });

  it('editing a custom description starts from it and offers "Reset to default" (saves empty)', async () => {
    vi.spyOn(subsonic, 'getSystemViewSettings').mockResolvedValue({ hasCover: false, description: 'My faves' } as never);
    renderHeader();
    await userEvent.click(await screen.findByTitle('Click to edit description'));
    expect(screen.getByPlaceholderText('Your starred things')).toHaveValue('My faves');

    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => expect(subsonic.setSystemViewDescription).toHaveBeenCalledWith('favorites', ''));
  });

  it('Cancel closes the editor without saving', async () => {
    renderHeader();
    await userEvent.click(await screen.findByTitle('Click to edit description'));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(subsonic.setSystemViewDescription).not.toHaveBeenCalled();
    expect(screen.getByTitle('Click to edit description')).toBeInTheDocument();
  });

  it('uploads and resets the cover for its own view key', async () => {
    renderHeader();
    await userEvent.click(await screen.findByText('upload cover'));
    await waitFor(() =>
      expect(subsonic.uploadSystemViewCover).toHaveBeenCalledWith('favorites', expect.any(File)),
    );

    await userEvent.click(screen.getByText('remove cover'));
    await waitFor(() => expect(subsonic.removeSystemViewCover).toHaveBeenCalledWith('favorites'));
  });

  it('shows the upload error, with a generic fallback for non-Error rejections', async () => {
    vi.spyOn(subsonic, 'uploadSystemViewCover').mockRejectedValue(new Error('Too big'));
    renderHeader();
    await userEvent.click(await screen.findByText('upload cover'));
    expect(await screen.findByText('Too big')).toBeInTheDocument();
  });

  it('falls back to "Upload failed" for a non-Error rejection', async () => {
    vi.spyOn(subsonic, 'uploadSystemViewCover').mockRejectedValue('boom');
    renderHeader();
    await userEvent.click(await screen.findByText('upload cover'));
    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
  });
});
