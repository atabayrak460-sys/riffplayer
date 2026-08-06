// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RouteErrorPage } from './RouteErrorPage';

function Bomb(): never {
  throw new Error('page crashed');
}

function renderWithRouter(initialPath = '/') {
  const router = createMemoryRouter(
    [{ path: '/', element: <Bomb />, errorElement: <RouteErrorPage /> }],
    { initialEntries: [initialPath] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RouteErrorPage', () => {
  it('shows the thrown error message and a way back home', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithRouter();

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('page crashed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to home' })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('"Back to home" navigates to the root route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    const router = createMemoryRouter(
      [
        { path: '/', element: <div>Home page</div> },
        { path: '/broken', element: <Bomb />, errorElement: <RouteErrorPage /> },
      ],
      { initialEntries: ['/broken'] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(screen.getByText('Home page')).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
