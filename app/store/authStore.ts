// app/store/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

const API = import.meta.env.VITE_BACKEND_ADDRESS ?? "";

/** 화면에서 쓰는 최소 유저 타입 */
export type User = { id: number; nickname: string; email?: string } | null;

type AuthState = {
  token: string | null;
  user: User;
  isAuthed: boolean;
  initialized: boolean;

  setToken: (t: string | null) => void;
  setUser: (u: User) => void;
  setAuthed: (v: boolean) => void;

  logout: () => void;
  initialize: () => Promise<void>;
  hydrateFromStorage: () => void;
};

/** /api/auth/me 응답 다양한 형태 흡수 */
function normalizeMe(raw: any): User {
  const u = raw?.user ?? raw?.data ?? raw;
  if (!u) return null;
  const id = u.id ?? u.userId ?? u.uid;
  const nickname = u.nickname ?? u.name ?? u.username;
  const email = u.email ?? u.mail;
  if (id == null || !nickname) return null;
  return { id: Number(id), nickname: String(nickname), email: email ? String(email) : undefined };
}

type Stored = Pick<AuthState, "token" | "user" | "isAuthed" | "initialized">;

// ✅ create()(...): 이중 괄호 구조를 반드시 유지
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthed: false,
      initialized: false,

      setToken: (t) => {
        if (t) localStorage.setItem("token", t);
        else localStorage.removeItem("token");
        set({ token: t, isAuthed: !!t });
      },

      setUser: (u) => set({ user: u }),
      setAuthed: (v) => set({ isAuthed: v }),

      logout: () => {
        // 서버 세션 종료(실패 무시)
        fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
        localStorage.removeItem("token");
        set({ token: null, user: null, isAuthed: false, initialized: true });
      },

      /** 앱 시작 시 세션/토큰으로 인증 동기화 */
      initialize: async () => {
        try {
          // 1) 쿠키 세션
          let res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
          if (res.ok) {
            const me = normalizeMe(await res.json());
            if (me) {
              set({ user: me, isAuthed: true, initialized: true });
              return;
            }
          }
          // 2) 토큰
          const t = get().token ?? localStorage.getItem("token");
          if (t) {
            res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
            if (res.ok) {
              const me = normalizeMe(await res.json());
              if (me) {
                set({ user: me, token: t, isAuthed: true, initialized: true });
                return;
              }
            }
          }
          set({ user: null, token: null, isAuthed: false, initialized: true });
        } catch {
          set({ initialized: true }); // 네트워크 장애여도 초기화는 마무리
        }
      },

      /** (레거시 호환) 토큰만 복구 */
      hydrateFromStorage: () => {
        const t = localStorage.getItem("token");
        set({ token: t, isAuthed: !!t });
      },
    }),
    {
      name: "auth-store",
      // 기본 storage(localStorage) 사용 — 구버전 zustand도 안전
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        isAuthed: s.isAuthed,
        initialized: s.initialized,
      }),
      version: 2,
      migrate: (persisted: any, fromVersion: number): Stored => {
        if (!persisted || typeof persisted !== "object") {
          return { token: null, user: null, isAuthed: false, initialized: false };
        }
        if (fromVersion < 2) {
          return {
            token: persisted.token ?? null,
            user: persisted.user ?? null,
            isAuthed: Boolean(persisted.isAuthed ?? (persisted.token ? true : false)),
            initialized: Boolean(persisted.initialized ?? false),
          };
        }
        return persisted as Stored;
      },
    }
  )
);
