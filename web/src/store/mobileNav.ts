import { create } from 'zustand';

interface MobileNavState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** Open/closed state for the mobile hamburger nav drawer (#22) — mirrors
 * the same "single piece of shared UI state" pattern as store/uiMenu.ts. */
export const useMobileNavStore = create<MobileNavState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
