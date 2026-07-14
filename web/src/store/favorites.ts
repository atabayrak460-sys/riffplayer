import { create } from 'zustand';

export type FavoriteType = 'track' | 'album' | 'artist';

function keyFor(type: FavoriteType, id: string): string {
  return `${type}:${id}`;
}

interface FavoritesState {
  starred: Record<string, boolean>;
  /** Seed a starred value the first time an item is seen; does not clobber a known value. */
  hydrate: (type: FavoriteType, id: string, value: boolean) => void;
  setStarred: (type: FavoriteType, id: string, value: boolean) => void;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  starred: {},

  hydrate: (type, id, value) => {
    const key = keyFor(type, id);
    if (key in get().starred) return;
    set((s) => ({ starred: { ...s.starred, [key]: value } }));
  },

  setStarred: (type, id, value) => {
    set((s) => ({ starred: { ...s.starred, [keyFor(type, id)]: value } }));
  },
}));

export function selectStarred(type: FavoriteType, id: string) {
  return (s: FavoritesState) => s.starred[keyFor(type, id)];
}
