// app/store/authStore.ts
import { create } from "zustand";

type User = { id: number; nickname: string; email?: string } | null;

type AuthState = {
  token: string | null;
  user: User;
  isAuthed: boolean;
  setToken: (t: string | null) => void;
  setUser: (u: User) => void;
  setAuthed: (v: boolean) => void;   // ✅ 추가!
  logout: () => void;
  hydrateFromStorage: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthed: false,

  setToken: (t) => {
    if (t) localStorage.setItem("token", t);
    else localStorage.removeItem("token");
    set({ token: t, isAuthed: !!t });
  },

  setUser: (u) => set({ user: u }),

  setAuthed: (v) => set({ isAuthed: v }),   // ✅ 여기 추가

  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null, isAuthed: false });
  },

  hydrateFromStorage: () => {
    const t = localStorage.getItem("token");
    set({ token: t, isAuthed: !!t });
  },
}));
