// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';

describe('KeyboardShortcutsHelp', () => {
  it('lists the shortcuts', () => {
    render(<KeyboardShortcutsHelp onClose={() => {}} />);
    expect(screen.getByText('Play / pause')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('Mute / unmute')).toBeInTheDocument();
  });

  it('closes on the Close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<KeyboardShortcutsHelp onClose={onClose} />);

    await user.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsHelp onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
