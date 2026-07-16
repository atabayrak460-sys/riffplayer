import { create } from 'zustand';

interface UiMenuState {
  activeMenuId: string | null;
  openMenu: (id: string) => void;
  closeMenu: (id?: string) => void;
}

/**
 * Coordinates "only one context/options menu open at a time" across the
 * whole app. Each menu instance registers a unique id when it opens; any
 * other open menu reacts to activeMenuId changing away from its own id and
 * closes itself.
 */
export const useUiMenuStore = create<UiMenuState>((set, get) => ({
  activeMenuId: null,

  openMenu: (id) => set({ activeMenuId: id }),

  closeMenu: (id) => {
    if (id == null || get().activeMenuId === id) set({ activeMenuId: null });
  },
}));
