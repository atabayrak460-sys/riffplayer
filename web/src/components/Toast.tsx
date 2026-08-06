import { useEffect } from 'react';
import { useToastStore } from '../store/toast';

const AUTO_DISMISS_MS = 5000;

/** Mounted once at the app root. Shows the last message pushed to `useToastStore`. */
export function Toast() {
  const message = useToastStore((s) => s.message);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, dismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-md px-4">
      <div className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg shadow-lg px-4 py-3">
        <span className="flex-1">{message}</span>
        <button
          onClick={dismiss}
          className="text-zinc-400 hover:text-zinc-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
