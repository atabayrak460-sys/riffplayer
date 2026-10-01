// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

function renderModal(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <Modal onClose={onClose} label="Test dialog">
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      </Modal>,
    ),
  };
}

describe('Modal', () => {
  it('has dialog role, aria-modal, and the given label', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('focuses the first focusable element on open', () => {
    renderModal();
    expect(screen.getByText('First')).toHaveFocus();
  });

  it('restores focus to the previously focused element on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = renderModal();
    expect(trigger).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();

    trigger.remove();
  });

  it('calls onClose on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on backdrop click but not on card click', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByText('Second'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('traps Tab within the dialog, wrapping from last back to first', () => {
    renderModal();
    screen.getByText('Third').focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByText('First')).toHaveFocus();
  });

  it('traps Shift+Tab within the dialog, wrapping from first back to last', () => {
    renderModal();
    screen.getByText('First').focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByText('Third')).toHaveFocus();
  });

  it('portals out of a transformed ancestor (e.g. a virtualized list row), not nested under it', () => {
    // AddToPlaylistDialog/SongInfoDialog open from SongRow inside a
    // virtualized list row, which react-virtual positions with a CSS
    // `transform` — making that row the containing block for this dialog's
    // `fixed inset-0` overlay instead of the viewport. Without the portal,
    // the backdrop/card would be sized and centered against the row's small
    // translated box rather than filling the screen.
    const { container } = render(
      <div style={{ transform: 'translateY(400px)' }}>
        <Modal onClose={vi.fn()} label="Test dialog">
          <button>First</button>
        </Modal>
      </div>,
    );

    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });
});
