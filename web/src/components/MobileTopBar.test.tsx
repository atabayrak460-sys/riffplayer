// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileTopBar } from './MobileTopBar';
import { useMobileNavStore } from '../store/mobileNav';

beforeEach(() => {
  useMobileNavStore.setState({ isOpen: false });
});

describe('MobileTopBar', () => {
  it('renders the Cadence logo', () => {
    render(<MobileTopBar />);
    expect(screen.getByText('Cadence')).toBeInTheDocument();
  });

  it('opens the mobile nav drawer when the hamburger button is clicked', async () => {
    const user = userEvent.setup();
    render(<MobileTopBar />);

    await user.click(screen.getByLabelText('Open menu'));

    expect(useMobileNavStore.getState().isOpen).toBe(true);
  });
});
