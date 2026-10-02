// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSettingsPanel } from './UserSettingsPage';
import { useAuthStore } from '../store/auth';
import * as subsonic from '../api/subsonic';

function renderPanel() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AccountSettingsPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1, username: 'admin', role: 'admin' },
    credentials: { serverUrl: 'http://localhost', username: 'admin', password: 'admin' },
    token: 'fake-jwt',
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 1, username: 'admin', role: 'admin', preferences: null }),
  }));
});

async function fillPasswordForm(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  await user.type(screen.getByPlaceholderText('Current password'), current);
  await user.type(screen.getByPlaceholderText('New password'), next);
  await user.type(screen.getByPlaceholderText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('AccountSettingsPanel — password change', () => {
  it('rejects mismatched new/confirm passwords without calling the API', async () => {
    const changeSpy = vi.spyOn(subsonic, 'changeMyPassword');
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Signed in as admin');

    await fillPasswordForm(user, 'oldpass', 'newpass1', 'newpass2');

    expect(await screen.findByText("New passwords don't match.")).toBeInTheDocument();
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('surfaces the server error (e.g. wrong current password) without logging out', async () => {
    vi.spyOn(subsonic, 'changeMyPassword').mockRejectedValue(new Error('Current password is incorrect'));
    const logout = vi.fn();
    useAuthStore.setState({ logout });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Signed in as admin');

    await fillPasswordForm(user, 'wrong', 'newpass1', 'newpass1');

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out and redirects to login on a successful change (the session JWT is now stale)', async () => {
    vi.spyOn(subsonic, 'changeMyPassword').mockResolvedValue(undefined);
    const logout = vi.fn();
    useAuthStore.setState({ logout });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Signed in as admin');

    await fillPasswordForm(user, 'oldpass', 'newpass1', 'newpass1');

    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });
});
