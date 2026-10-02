// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsersPage } from './UsersPage';
import { useAuthStore } from '../../store/auth';
import * as subsonic from '../../api/subsonic';

const users = [
  { id: 1, username: 'admin', role: 'admin' },
  { id: 2, username: 'alice', role: 'user' },
  { id: 3, username: 'bob', role: 'admin' },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

/** The row element for a user, found by the name at the start of its first line (roles can repeat a name, e.g. "admin"). */
const row = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('div.group')).find((r) =>
    r.querySelector('p')?.textContent?.startsWith(name),
  )!;

beforeEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: { id: 1, username: 'admin', role: 'admin' } });
  vi.spyOn(subsonic, 'adminGetUsers').mockResolvedValue(users as never);
  vi.spyOn(subsonic, 'adminCreateUser').mockResolvedValue({ id: 9 } as never);
  vi.spyOn(subsonic, 'adminUpdateUser').mockResolvedValue(undefined as never);
  vi.spyOn(subsonic, 'adminDeleteUser').mockResolvedValue(undefined as never);
});

describe('UsersPage — list', () => {
  it('shows placeholders while loading', () => {
    vi.spyOn(subsonic, 'adminGetUsers').mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('lists users with their roles and marks the current one "(you)"', async () => {
    renderPage();

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(within(row('alice')).getByText('user')).toBeInTheDocument();
    expect(within(row('bob')).getByText('admin')).toBeInTheDocument();
    expect(within(row('admin')).getByText('(you)')).toBeInTheDocument();
    expect(within(row('alice')).queryByText('(you)')).not.toBeInTheDocument();
  });

  it('offers no change/delete actions on your own row (no self-lockout)', async () => {
    renderPage();
    await screen.findByText('alice');

    expect(within(row('admin')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('alice')).getAllByRole('button')).toHaveLength(3);
  });
});

describe('UsersPage — create', () => {
  async function openForm() {
    await userEvent.click(screen.getByRole('button', { name: '+ Add user' }));
  }

  it('toggles the form with "+ Add user" and closes it with Cancel', async () => {
    renderPage();
    expect(screen.queryByText('New user')).not.toBeInTheDocument();

    await openForm();
    expect(screen.getByText('New user')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('New user')).not.toBeInTheDocument();
  });

  it('creates a user with the chosen role (default: user)', async () => {
    renderPage();
    await openForm();
    await userEvent.type(screen.getByPlaceholderText('Username'), 'carol');
    await userEvent.type(screen.getByPlaceholderText('Password'), 's3cret');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(subsonic.adminCreateUser).toHaveBeenCalled());
    expect(vi.mocked(subsonic.adminCreateUser).mock.calls[0][0]).toEqual({ username: 'carol', password: 's3cret', role: 'user' });
  });

  it('can create an admin', async () => {
    renderPage();
    await openForm();
    await userEvent.type(screen.getByPlaceholderText('Username'), 'dave');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'pw');
    await userEvent.selectOptions(screen.getByRole('combobox'), 'admin');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(subsonic.adminCreateUser).toHaveBeenCalled());
    expect(vi.mocked(subsonic.adminCreateUser).mock.calls[0][0]).toEqual({ username: 'dave', password: 'pw', role: 'admin' });
  });

  it('closes and clears the form after success, and refetches the list', async () => {
    renderPage();
    await screen.findByText('alice');
    await openForm();
    await userEvent.type(screen.getByPlaceholderText('Username'), 'carol');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'pw');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.queryByText('New user')).not.toBeInTheDocument());
    await waitFor(() => expect(subsonic.adminGetUsers).toHaveBeenCalledTimes(2));
    await openForm();
    expect(screen.getByPlaceholderText('Username')).toHaveValue('');
  });

  it('keeps the form and shows the error when creating fails', async () => {
    vi.spyOn(subsonic, 'adminCreateUser').mockRejectedValue(new Error('Username already taken'));
    renderPage();
    await openForm();
    await userEvent.type(screen.getByPlaceholderText('Username'), 'alice');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'pw');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(/Username already taken/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toHaveValue('alice');
  });
});

describe('UsersPage — managing others', () => {
  it('"Make admin" promotes a user, and "Make user" demotes an admin', async () => {
    renderPage();
    await screen.findByText('alice');

    await userEvent.click(within(row('alice')).getByRole('button', { name: 'Make admin' }));
    await waitFor(() => expect(subsonic.adminUpdateUser).toHaveBeenCalledWith(2, { role: 'admin' }));

    await userEvent.click(within(row('bob')).getByRole('button', { name: 'Make user' }));
    await waitFor(() => expect(subsonic.adminUpdateUser).toHaveBeenCalledWith(3, { role: 'user' }));
  });

  it('changes a password for that user, then closes the editor', async () => {
    renderPage();
    await screen.findByText('alice');

    await userEvent.click(within(row('alice')).getByRole('button', { name: 'Change pw' }));
    await userEvent.type(screen.getByPlaceholderText('New password'), 'n3w');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(subsonic.adminUpdateUser).toHaveBeenCalledWith(2, { password: 'n3w' }));
    await waitFor(() => expect(screen.queryByPlaceholderText('New password')).not.toBeInTheDocument());
  });

  it('Cancel closes the password editor without saving', async () => {
    renderPage();
    await screen.findByText('alice');
    await userEvent.click(within(row('alice')).getByRole('button', { name: 'Change pw' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(subsonic.adminUpdateUser).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('New password')).not.toBeInTheDocument();
  });

  it('opening the editor for another user starts with an empty field', async () => {
    renderPage();
    await screen.findByText('alice');
    await userEvent.click(within(row('alice')).getByRole('button', { name: 'Change pw' }));
    await userEvent.type(screen.getByPlaceholderText('New password'), 'half-typed');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(within(row('bob')).getByRole('button', { name: 'Change pw' }));

    expect(screen.getByPlaceholderText('New password')).toHaveValue('');
  });

  it('Delete asks for confirmation naming the user, and deletes only when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPage();
    await screen.findByText('alice');

    confirmSpy.mockReturnValueOnce(false);
    await userEvent.click(within(row('alice')).getByRole('button', { name: 'Delete' }));
    expect(confirmSpy).toHaveBeenCalledWith('Delete user "alice"?');
    expect(subsonic.adminDeleteUser).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await userEvent.click(within(row('alice')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(subsonic.adminDeleteUser).toHaveBeenCalledWith(2));
    await waitFor(() => expect(subsonic.adminGetUsers).toHaveBeenCalledTimes(2));
  });
});
