// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LibrariesPage } from './LibrariesPage';
import * as subsonic from '../../api/subsonic';

const libs = [
  { id: 1, name: 'Music', path: '/music', scanning: false },
  { id: 2, name: 'Podcasts', path: '/pods', scanning: true },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LibrariesPage />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByText(name).closest('div.group') as HTMLElement;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'adminGetLibraries').mockResolvedValue(libs as never);
  vi.spyOn(subsonic, 'adminAddLibrary').mockResolvedValue({ id: 3 } as never);
  vi.spyOn(subsonic, 'adminDeleteLibrary').mockResolvedValue(undefined as never);
  vi.spyOn(subsonic, 'adminScanLibrary').mockResolvedValue(undefined as never);
});

describe('LibrariesPage', () => {
  it('shows placeholders while loading', () => {
    vi.spyOn(subsonic, 'adminGetLibraries').mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });

  it('lists libraries with their paths', async () => {
    renderPage();

    expect(await screen.findByText('Music')).toBeInTheDocument();
    expect(screen.getByText('/music')).toBeInTheDocument();
    expect(screen.getByText('/pods')).toBeInTheDocument();
  });

  it('explains how to start when there are none', async () => {
    vi.spyOn(subsonic, 'adminGetLibraries').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no libraries yet/i)).toBeInTheDocument();
  });

  it('adds a library, then closes and clears the form and refetches', async () => {
    renderPage();
    await screen.findByText('Music');
    await userEvent.click(screen.getByRole('button', { name: '+ Add library' }));
    await userEvent.type(screen.getByPlaceholderText('Name (e.g. Music)'), 'Jazz');
    await userEvent.type(screen.getByPlaceholderText('Path (e.g. /music)'), '/jazz');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(subsonic.adminAddLibrary).toHaveBeenCalled());
    // mutationFn may receive a second (context) argument, so check the payload only
    expect(vi.mocked(subsonic.adminAddLibrary).mock.calls[0][0]).toEqual({ name: 'Jazz', path: '/jazz' });
    await waitFor(() => expect(screen.queryByText('New library')).not.toBeInTheDocument());
    await waitFor(() => expect(subsonic.adminGetLibraries).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: '+ Add library' }));
    expect(screen.getByPlaceholderText('Name (e.g. Music)')).toHaveValue('');
  });

  it('Cancel closes the add form; the toggle button also closes it', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '+ Add library' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('New library')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+ Add library' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Add library' }));
    expect(screen.queryByText('New library')).not.toBeInTheDocument();
  });

  it('keeps the form open when adding fails', async () => {
    vi.spyOn(subsonic, 'adminAddLibrary').mockRejectedValue(new Error('Path does not exist'));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '+ Add library' }));
    await userEvent.type(screen.getByPlaceholderText('Name (e.g. Music)'), 'Jazz');
    await userEvent.type(screen.getByPlaceholderText('Path (e.g. /music)'), '/nope');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(subsonic.adminAddLibrary).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Path (e.g. /music)')).toHaveValue('/nope');
  });
});

describe('LibrariesPage — scanning and removing', () => {
  it('starts a scan for that library and refetches the server\'s scanning state', async () => {
    renderPage();
    await screen.findByText('Music');

    await userEvent.click(within(row('Music')).getByRole('button', { name: '⟳ Scan' }));

    await waitFor(() => expect(subsonic.adminScanLibrary).toHaveBeenCalledWith(1));
    await waitFor(() => expect(subsonic.adminGetLibraries).toHaveBeenCalledTimes(2));
  });

  it('shows Scanning… and disables the button while this tab\'s request is in flight', async () => {
    vi.spyOn(subsonic, 'adminScanLibrary').mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByText('Music');

    await userEvent.click(within(row('Music')).getByRole('button', { name: '⟳ Scan' }));

    expect(await within(row('Music')).findByRole('button', { name: 'Scanning…' })).toBeDisabled();
  });

  it('a library the server reports as scanning is shown as Scanning… for everyone', async () => {
    renderPage();
    await screen.findByText('Podcasts');

    expect(within(row('Podcasts')).getByRole('button', { name: 'Scanning…' })).toBeDisabled();
  });

  it('alerts the server\'s message when the scan is refused (e.g. already running)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(subsonic, 'adminScanLibrary').mockRejectedValue(new Error('A scan is already running'));
    renderPage();
    await screen.findByText('Music');

    await userEvent.click(within(row('Music')).getByRole('button', { name: '⟳ Scan' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('A scan is already running'));
    // and the button comes back so the user can retry
    expect(await within(row('Music')).findByRole('button', { name: '⟳ Scan' })).toBeEnabled();
  });

  it('Remove confirms (mentioning that track data stays) and removes only when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPage();
    await screen.findByText('Music');

    confirmSpy.mockReturnValueOnce(false);
    await userEvent.click(within(row('Music')).getByRole('button', { name: 'Remove' }));
    expect(confirmSpy).toHaveBeenCalledWith('Remove library "Music"? Track data stays.');
    expect(subsonic.adminDeleteLibrary).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await userEvent.click(within(row('Music')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(subsonic.adminDeleteLibrary).toHaveBeenCalledWith(1));
  });
});
