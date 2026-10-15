import { create } from 'zustand';
import { api, ApiError } from '@/services/api';

export interface AccountUser {
  id: string;
  username: string;
  displayName: string;
}

export type AccountStatus = 'checking' | 'guest' | 'signed-in' | 'unavailable';

interface AccountState {
  status: AccountStatus;
  user: AccountUser | null;
  /** Set once at boot: did we find a Solace backend at all? */
  checkSession: () => Promise<void>;
  register: (p: { username: string; password: string; displayName: string }) => Promise<AccountUser>;
  login: (p: { username: string; password: string }) => Promise<AccountUser>;
  logout: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

export const useAccount = create<AccountState>()((set) => ({
  status: 'checking',
  user: null,

  checkSession: async () => {
    try {
      const res = await api<{ authenticated: boolean; user?: AccountUser }>('/auth/session');
      if (res.authenticated && res.user) set({ status: 'signed-in', user: res.user });
      else set({ status: 'guest', user: null }); // backend present, nobody signed in
    } catch {
      set({ status: 'unavailable', user: null }); // no backend (static hosting, offline, wrong URL)
    }
  },

  register: async (p) => {
    const user = await api<AccountUser>('/auth/register', { method: 'POST', body: p });
    set({ status: 'signed-in', user });
    return user;
  },

  login: async (p) => {
    const user = await api<AccountUser>('/auth/login', { method: 'POST', body: p });
    set({ status: 'signed-in', user });
    return user;
  },

  logout: async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (e) {
      // If the server is gone we still sign out locally; the session cookie is HttpOnly and expires on its own.
      if (!(e instanceof ApiError && (e.unreachable || e.status === 401))) throw e;
    }
    set({ status: 'guest', user: null });
  },

  updateDisplayName: async (displayName) => {
    const user = await api<AccountUser>('/users/me', { method: 'PATCH', body: { displayName } });
    set({ user });
  },

  deleteAccount: async (password) => {
    await api('/users/me', { method: 'DELETE', body: { password } });
    set({ status: 'guest', user: null });
  },
}));
