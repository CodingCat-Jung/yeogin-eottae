// app/store/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ✅ 같은 오리진 우선(상대경로). 필요하면 .env에 절대주소 넣기.
//const API = (import.meta.env.VITE_BACKEND_ADDRESS ?? "").trim(); // ""면 같은 오리진
const API = ""; // 프록시 의존
console.log("[Auth] API base =", API);

async function fetchWithLog(input: RequestInfo, init?: RequestInit) {
  const url = typeof input === "string" ? input : input.toString();
  console.log("[Auth] fetch:", url, init);
  const res = await fetch(url, init);
  console.log("[Auth] response:", url, res.status, res.headers.get("set-cookie"));
  return res;
}

// initialize()에서 테스트로 사용해봐도 됨:
//let res = await fetchWithLog(`${API}/api/auth/me`, { credentials: "include" });
/** 화면에서 쓰는 최소 유저 타입 */
export type User =
  | {
  id: number;
  nickname: string;
  email?: string;
  /** 백엔드 응답의 profile_image_url / profileImageUrl / avatarUrl 등을 흡수해 저장 */
  profile_image_url?: string;
}
  | null;

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

  const profileImageUrl =
    u.profile_image_url ?? u.profileImageUrl ?? u.avatarUrl ?? u.avatar_url ?? u.photoURL;

  if (id == null || !nickname) return null;

  return {
    id: Number(id),
    nickname: String(nickname),
    email: email ? String(email) : undefined,
    profile_image_url: profileImageUrl ? String(profileImageUrl) : undefined,
  };
}

// ✅ CSRF 쿠키 읽기 & 보장
function getCsrfFromCookie(): string | null {
  const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function ensureCsrf(base = API) {
  if (!getCsrfFromCookie()) {
    const res = await fetch(`${base}/api/auth/csrf`, { credentials: "include" });
    if (!res.ok) throw new Error("CSRF 발급 실패");
  }
}

type Stored = Pick<AuthState, "token" | "user" | "isAuthed" | "initialized">;

// ✅ create()(...): 이중 괄호 구조 유지
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

      logout: async () => {
        try {
          // ✅ POST는 CSRF 필요할 수 있으니 먼저 보장
          await ensureCsrf(API);
          const csrf = getCsrfFromCookie();
          await fetch(`${API}/api/auth/logout`, {
            method: "POST",
            credentials: "include",
            headers: csrf ? { "x-csrf-token": csrf } : undefined,
          });
        } catch {
          // 서버 세션 종료 실패는 무시 (클라이언트 상태만 초기화)
        }
        localStorage.removeItem("token");
        set({ token: null, user: null, isAuthed: false, initialized: true });
      },

      /** 앱 시작 시 세션/토큰으로 인증 동기화 */
      initialize: async () => {
        try {
          // 1) 세션 쿠키 기반
          let res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
          if (res.ok) {
            const me = normalizeMe(await res.json());
            if (me) {
              set({ user: me, isAuthed: true, initialized: true });
              return;
            }
          }
          // 2) 토큰 기반 (백엔드가 Bearer 허용하는 경우만)
          const t = get().token ?? localStorage.getItem("token");
          if (t) {
            res = await fetch(`${API}/api/auth/me`, {
              headers: { Authorization: `Bearer ${t}` },
              credentials: "include",
            });
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
          set({ initialized: true }); // 네트워크 장애여도 초기화 플래그는 세움
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
