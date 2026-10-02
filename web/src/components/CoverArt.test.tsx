// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CoverArt } from './CoverArt';
import * as subsonic from '../api/subsonic';
import * as offlineDb from '../lib/offlineDb';

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  createObjectURL.mockReset().mockImplementation(() => `blob:cover-${createObjectURL.mock.calls.length}`);
  revokeObjectURL.mockReset();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(subsonic, 'coverArtUrl').mockImplementation((id, size) => `http://srv/cover/${id}?size=${size}`);
  vi.spyOn(offlineDb, 'getCoverBlob').mockResolvedValue(undefined as never);
});

// getByRole('img') would miss it: an <img alt=""> is decorative (role presentation)
const img = () => document.querySelector('img') as HTMLImageElement;

describe('CoverArt — network', () => {
  it('shows the server cover at the requested size', () => {
    render(<CoverArt id="al1" size={300} alt="Album" />);

    expect(img()).toHaveAttribute('src', 'http://srv/cover/al1?size=300');
    expect(img()).toHaveAttribute('alt', 'Album');
    expect(img()).toHaveAttribute('loading', 'lazy');
  });

  it('defaults to size 200 and passes the class through', () => {
    render(<CoverArt id="al1" className="w-10 h-10" />);

    expect(img()).toHaveAttribute('src', 'http://srv/cover/al1?size=200');
    expect(img()).toHaveClass('w-10', 'h-10');
  });

  it('does not rebuild the URL (new auth salt) on an unrelated re-render', () => {
    const { rerender } = render(<CoverArt id="al1" size={100} className="a" />);
    rerender(<CoverArt id="al1" size={100} className="b" />);

    expect(subsonic.coverArtUrl).toHaveBeenCalledTimes(1);
  });

  it('builds a new URL when the id or size changes', () => {
    const { rerender } = render(<CoverArt id="al1" size={100} />);
    rerender(<CoverArt id="al2" size={100} />);
    rerender(<CoverArt id="al2" size={200} />);

    expect(subsonic.coverArtUrl).toHaveBeenCalledTimes(3);
    expect(img()).toHaveAttribute('src', 'http://srv/cover/al2?size=200');
  });
});

describe('CoverArt — placeholders', () => {
  it('without an id shows the generic placeholder and never asks the server', () => {
    const { container } = render(<CoverArt className="w-10" />);

    expect(document.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.firstChild).toHaveClass('w-10');
    expect(subsonic.coverArtUrl).not.toHaveBeenCalled();
  });

  it('without an id shows the given fallback instead of the generic one', () => {
    const { container } = render(<CoverArt className="w-10" fallback={<span>stock</span>} />);

    expect(screen.getByText('stock')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.firstChild).toHaveClass('overflow-hidden', 'w-10');
  });
});

describe('CoverArt — offline fallback', () => {
  it('on a network error, switches to the downloaded cover', async () => {
    const blob = new Blob(['x']);
    vi.spyOn(offlineDb, 'getCoverBlob').mockResolvedValue(blob as never);
    render(<CoverArt id="al1" />);

    fireEvent.error(img());

    await waitFor(() => expect(img()).toHaveAttribute('src', 'blob:cover-1'));
    expect(offlineDb.getCoverBlob).toHaveBeenCalledWith('al1');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('with no downloaded cover, falls back to the placeholder', async () => {
    const { container } = render(<CoverArt id="al1" fallback={<span>stock</span>} />);

    fireEvent.error(img());

    expect(await screen.findByText('stock')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('if the downloaded cover fails to load too, gives up and shows the placeholder', async () => {
    vi.spyOn(offlineDb, 'getCoverBlob').mockResolvedValue(new Blob(['x']) as never);
    render(<CoverArt id="al1" fallback={<span>stock</span>} />);
    fireEvent.error(img());
    await waitFor(() => expect(img()).toHaveAttribute('src', 'blob:cover-1'));

    fireEvent.error(img());

    expect(await screen.findByText('stock')).toBeInTheDocument();
    expect(offlineDb.getCoverBlob).toHaveBeenCalledTimes(1);
  });

  it('ignores a slow lookup that finishes after the id changed', async () => {
    let finish!: (b: Blob) => void;
    vi.spyOn(offlineDb, 'getCoverBlob').mockReturnValue(new Promise((r) => { finish = r as never; }) as never);
    const { rerender } = render(<CoverArt id="old" />);
    fireEvent.error(img());

    rerender(<CoverArt id="new" />);
    await act(async () => { finish(new Blob(['stale'])); });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(img()).toHaveAttribute('src', 'http://srv/cover/new?size=200');
  });

  it('goes back to the network for the next cover after having used the offline one', async () => {
    vi.spyOn(offlineDb, 'getCoverBlob').mockResolvedValue(new Blob(['x']) as never);
    const { rerender } = render(<CoverArt id="al1" />);
    fireEvent.error(img());
    await waitFor(() => expect(img()).toHaveAttribute('src', 'blob:cover-1'));

    rerender(<CoverArt id="al2" />);

    await waitFor(() => expect(img()).toHaveAttribute('src', 'http://srv/cover/al2?size=200'));
  });

  it('releases the blob URL when the id changes and when unmounting', async () => {
    vi.spyOn(offlineDb, 'getCoverBlob').mockResolvedValue(new Blob(['x']) as never);
    const { rerender, unmount } = render(<CoverArt id="al1" />);
    fireEvent.error(img());
    await waitFor(() => expect(img()).toHaveAttribute('src', 'blob:cover-1'));

    rerender(<CoverArt id="al2" />);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-1'));

    fireEvent.error(img());
    await waitFor(() => expect(img()).toHaveAttribute('src', 'blob:cover-2'));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-2');
  });
});
