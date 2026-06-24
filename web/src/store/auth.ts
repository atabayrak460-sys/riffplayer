import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setCredentials, clearCredentials, setJwt } from '../api/subsonic';
import type { Credentials } from '../api/types';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

interface AuthState {
  credentials: Credentials | null;   // for Subsonic API
  token: string | null;              // JWT for /api/v1
  user: AuthUser | null;
  login: (creds: Credentials) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      credentials: null,
      token: null,
      user: null,

      login: async (creds) => {
        // 1. Get a JWT from the custom API (validates credentials)
        const base = creds.serverUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: creds.username, password: creds.password }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: 'Login failed' }))) as {
            error?: string;
          };
          throw new Error(data.error ?? 'Login failed');
        }
        const data = (await res.json()) as { token: string; user: AuthUser };

        // 2. Also wire up Subsonic credentials for media endpoints
        setCredentials(creds);
        setJwt(data.token);

        set({ credentials: creds, token: data.token, user: data.user });
      },

      logout: () => {
        clearCredentials();
        setJwt(null);
        set({ credentials: null, token: null, user: null });
      },
    }),
    {
      name: 'cadence-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.credentials) setCredentials(state.credentials);
        if (state?.token) setJwt(state.token);
      },
    },
  ),
);
