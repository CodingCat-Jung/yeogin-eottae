// app/store/userStore.ts (zustand 예시)
import { create } from "zustand";

type User = { id: number; nickname: string } | null;

type S = {
  user: User;
  setUser: (u: User) => void;
  reset: () => void;
};

export const useUserStore = create<S>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
  reset: () => set({ user: null }), // ✅ 로그아웃 시 호출
}));
