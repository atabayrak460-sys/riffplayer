import { create } from 'zustand';

interface ToastState {
  message: string | null;
  show: (message: string) => void;
  dismiss: () => void;
}

/**
 * A single transient error/status message, shown by `<Toast />` in Layout.
 * Deliberately holds only one message at a time (last one wins) — this app
 * has no queue of unrelated background failures piling up, so a queue would
 * just be unused complexity.
 */
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  dismiss: () => set({ message: null }),
}));
