// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { useAuthStore } from '../store/auth';

const login = vi.fn();

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/albums" element={<p>albums page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(serverUrl: string | null = null) {
  if (serverUrl !== null) {
    const url = screen.getByLabelText('Server URL');
    await userEvent.clear(url);
    await userEvent.type(url, serverUrl);
  }
  await userEvent.type(screen.getByLabelText('Username'), 'admin');
  await userEvent.type(screen.getByLabelText('Password'), 'hunter2');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  login.mockReset();
  useAuthStore.setState({ login });
});

describe('LoginPage', () => {
  it('defaults the server URL to the origin the page is served from', () => {
    renderPage();

    expect(screen.getByLabelText('Server URL')).toHaveValue(window.location.origin);
  });

  it('logs in with the typed credentials and goes to /albums', async () => {
    login.mockResolvedValue(undefined);
    renderPage();

    await fillAndSubmit('http://music.local:4533');

    expect(login).toHaveBeenCalledWith({
      serverUrl: 'http://music.local:4533',
      username: 'admin',
      password: 'hunter2',
    });
    expect(await screen.findByText('albums page')).toBeInTheDocument();
  });

  it('strips a trailing slash from the server URL', async () => {
    login.mockResolvedValue(undefined);
    renderPage();

    await fillAndSubmit('http://music.local:4533/');

    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: 'http://music.local:4533' }),
    );
  });

  it('shows the error and stays on the page when login fails', async () => {
    login.mockRejectedValue(new Error('Invalid username or password'));
    renderPage();

    await fillAndSubmit();

    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument();
    expect(screen.queryByText('albums page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('falls back to "Login failed" for a non-Error rejection', async () => {
    login.mockRejectedValue('boom');
    renderPage();

    await fillAndSubmit();

    expect(await screen.findByText('Login failed')).toBeInTheDocument();
  });

  it('disables the button and says "Connecting…" while the request is in flight', async () => {
    let resolve!: () => void;
    login.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    renderPage();

    await fillAndSubmit();

    expect(await screen.findByRole('button', { name: 'Connecting…' })).toBeDisabled();
    resolve();
    expect(await screen.findByText('albums page')).toBeInTheDocument();
  });

  it('clears an earlier error when the form is submitted again', async () => {
    login.mockRejectedValueOnce(new Error('Nope')).mockResolvedValueOnce(undefined);
    renderPage();
    await fillAndSubmit();
    expect(await screen.findByText('Nope')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('albums page')).toBeInTheDocument();
  });

  it('shows the message passed in navigation state (e.g. after a password change)', () => {
    renderPage({ message: 'Password changed. Please sign in again.' });

    expect(screen.getByText('Password changed. Please sign in again.')).toBeInTheDocument();
  });

  it('shows no info banner without navigation state', () => {
    renderPage();

    expect(screen.queryByText(/sign in again/i)).not.toBeInTheDocument();
  });
});
