// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminPage } from './AdminPage';
import { useAuthStore } from '../../store/auth';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/admin" element={<AdminPage />}>
          <Route path="users" element={<p>users tab</p>} />
          <Route path="libraries" element={<p>libraries tab</p>} />
        </Route>
        <Route path="/albums" element={<p>albums page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 1, username: 'a', role: 'admin' } });
});

describe('AdminPage', () => {
  it('shows the three tabs and the nested page to an admin', () => {
    renderAt('/settings/admin/users');

    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/settings/admin/users');
    expect(screen.getByRole('link', { name: 'Libraries' })).toHaveAttribute('href', '/settings/admin/libraries');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/admin/settings');
    expect(screen.getByText('users tab')).toBeInTheDocument();
  });

  it('highlights only the active tab', () => {
    renderAt('/settings/admin/libraries');

    expect(screen.getByRole('link', { name: 'Libraries' })).toHaveClass('text-brand');
    expect(screen.getByRole('link', { name: 'Users' })).not.toHaveClass('text-brand');
    expect(screen.getByText('libraries tab')).toBeInTheDocument();
  });

  it('sends a regular user to /albums without rendering anything of the admin area', () => {
    useAuthStore.setState({ user: { id: 2, username: 'u', role: 'user' } });
    renderAt('/settings/admin/users');

    expect(screen.getByText('albums page')).toBeInTheDocument();
    expect(screen.queryByText('users tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor away too', () => {
    useAuthStore.setState({ user: null });
    renderAt('/settings/admin/users');

    expect(screen.getByText('albums page')).toBeInTheDocument();
  });
});
