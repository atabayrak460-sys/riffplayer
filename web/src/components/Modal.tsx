import { useEffect, useRef } from 'react';

interface Props {
  onClose: () => void;
  /** Accessible name for the dialog (aria-label) — not necessarily the same as its visible heading. */
  label: string;
  /** Classes for the card itself (padding, width, etc.) — the backdrop/centering wrapper is fixed. */
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Shared overlay primitive for centered dialogs (AddToPlaylistDialog,
 * DownloadTargetModal, SongInfoDialog, KeyboardShortcutsHelp). Handles the
 * accessibility properties a modal needs that a plain overlay `<div>`
 * doesn't get for free: `role="dialog"`/`aria-modal`, initial focus, a Tab
 * focus trap so keyboard focus can't leak to the page underneath, focus
 * restored to whatever opened it on close, and Escape-to-close (callers no
 * longer each need their own Escape listener).
 */
export function Modal({ onClose, label, className = '', children }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const first = card?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? card)?.focus();

    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const card = cardRef.current;
      const focusables = card ? Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`bg-zinc-800 border border-zinc-700 rounded-xl mx-4 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
