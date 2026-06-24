import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setCredentials, clearCredentials, ping } from '../api/subsonic';
import type { Credentials } from '../api/types';

interface AuthState {
  credentials: Credentials | null;
  login: (creds: Credentials) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      credentials: null,

      login: async (creds) => {
        setCredentials(creds);
        await ping(); // will throw if credentials are wrong
        set({ credentials: creds });
      },

      logout: () => {
        clearCredentials();
        set({ credentials: null });
      },
    }),
    {
      name: 'cadence-auth',
      onRehydrateStorage: () => (state) => {
        // Re-apply credentials to the API module after page reload
        if (state?.credentials) setCredentials(state.credentials);
      },
    },
  ),
);
