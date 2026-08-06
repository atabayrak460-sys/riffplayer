// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useMobileNavStore } from '../store/mobileNav';

vi.mock('../api/subsonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/subsonic')>();
  return {
    ...actual,
    adminGetSettings: vi.fn().mockResolvedValue({}),
    getPlaylists: vi.fn().mockResolvedValue([]),
    getLibrarySidebarState: vi.fn().mockResolvedValue([]),
  };
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/*', element: <MobileNavDrawer /> },
    ],
    { initialEntries: [path] },
  );
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
  };
}

beforeEach(() => {
  useMobileNavStore.setState({ isOpen: false });
});

describe('MobileNavDrawer', () => {
  it('is not interactable (pointer-events-none) when closed', () => {
    renderAt('/home');
    const drawer = document.querySelector('.md\\:hidden.fixed') as HTMLElement;
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    expect(drawer.className).toContain('pointer-events-none');
  });

  it('shows Cadence sidebar content and is interactable when open', () => {
    useMobileNavStore.setState({ isOpen: true });
    renderAt('/home');
    expect(screen.getByText('Cadence')).toBeInTheDocument();
    const drawer = document.querySelector('.md\\:hidden.fixed') as HTMLElement;
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes when the backdrop is clicked', () => {
    useMobileNavStore.setState({ isOpen: true });
    renderAt('/home');
    const backdrop = document.querySelector('.bg-black\\/60') as HTMLElement;
    fireEvent.click(backdrop);
    expect(useMobileNavStore.getState().isOpen).toBe(false);
  });

  it('closes automatically on navigation', async () => {
    useMobileNavStore.setState({ isOpen: true });
    const { router } = renderAt('/home');
    expect(useMobileNavStore.getState().isOpen).toBe(true);

    await router.navigate('/albums');

    await waitFor(() => expect(useMobileNavStore.getState().isOpen).toBe(false));
  });
});
